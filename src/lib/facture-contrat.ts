/**
 * Helper de création de facture à partir d'un contrat de scolarisation validé.
 *
 * Idempotent : si une facture existe déjà pour la famille + année, ne fait rien
 * et retourne la facture existante.
 *
 * Utilisé par :
 *  - src/app/[ecole]/inscriptions/page.tsx (validerContrat depuis la liste)
 *  - src/app/[ecole]/inscriptions/contrat/[id]/page.tsx (valider depuis le détail)
 *
 * Le contrat doit être chargé avec ses jointures :
 *   contrats_scolarisation
 *     .select('*, familles(...), contrat_enfants(*, enfants(prenom, nom))')
 */

import { chargerImputations, imputer } from './comptabilite'

type AnySupabase = any

export interface CreerFactureResult {
  ok: boolean
  facture_id?: string
  numero?: string
  deja_existante?: boolean
  error?: string
}

export async function creerFactureDepuisContrat(
  s: AnySupabase,
  contrat: any,
  ecoleId: string,
  annee: string,
): Promise<CreerFactureResult> {
  if (!contrat?.famille_id) return { ok: false, error: 'Contrat sans famille' }

  // 1. Vérifier s'il existe une facture (n'importe quel statut) pour cette famille/année.
  //    La table a une contrainte UNIQUE (famille_id, annee_scolaire) → on ne peut pas
  //    en avoir deux. Donc :
  //      - facture active (≠ annule)   → idempotent, on retourne celle-là
  //      - facture annulée              → on la RÉACTIVE (purge ses lignes + repasse en en_attente)
  const { data: existing } = await s
    .from('factures')
    .select('id, numero, statut')
    .eq('famille_id', contrat.famille_id)
    .eq('annee_scolaire', annee)
    .maybeSingle()

  if (existing && existing.statut !== 'annule') {
    return { ok: true, deja_existante: true, facture_id: existing.id, numero: existing.numero }
  }

  // Cas réactivation : delete anciennes lignes + reset statut + on continue avec cette facture
  let reactivation = false
  if (existing && existing.statut === 'annule') {
    reactivation = true
    // FIX audit RLS 29/07/2026 : une policy qui refuse le delete ne leve pas
    // d'exception. Sans ce test, les anciennes lignes restaient en place et la
    // reconstruction ci-dessous les DOUBLAIT (facture reactivee au double).
    const { error: purgeErr } = await s.from('facture_lignes').delete().eq('facture_id', existing.id)
    if (purgeErr) {
      return { ok: false, facture_id: existing.id, numero: existing.numero, error: 'Purge des anciennes lignes : ' + purgeErr.message }
    }
  }

  // 2. Numéro séquentiel FACT-{YYYY}-{NNNN}
  const yearSuffix = annee.split('-')[1] || new Date().getFullYear().toString()
  const { data: lastFact } = await s
    .from('factures')
    .select('numero')
    .like('numero', `FACT-${yearSuffix}-%`)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nextNum = 1
  if (lastFact?.numero) {
    const m = lastFact.numero.match(/FACT-\d+-(\d+)$/)
    if (m) nextNum = parseInt(m[1]) + 1
  }
  const numero = `FACT-${yearSuffix}-${String(nextNum).padStart(4, '0')}`

  // Résoudre exercice_id (NULL → résolution via annee_scolaire)
  let exerciceId: string | null = contrat.exercice_id || null
  if (!exerciceId) {
    const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecoleId).eq('code', annee).maybeSingle()
    exerciceId = ex?.id || null
  }

  // 3. Insert OU update (cas réactivation d'une facture annulée).
  let nf: any = null
  let insErr: any = null
  if (reactivation && existing) {
    const upd = await s
      .from('factures')
      .update({
        statut: 'en_attente',
        annule_le: null,
        exercice_id: exerciceId,
        date_emission: new Date().toISOString().split('T')[0],
        notes: `Réactivée après re-validation du contrat ${annee}`,
      })
      .eq('id', existing.id)
      .select()
      .single()
    nf = upd.data
    insErr = upd.error
  } else {
    const ins = await s
      .from('factures')
      .insert({
        famille_id: contrat.famille_id,
        annee_scolaire: annee,
        exercice_id: exerciceId,
        numero,
        date_emission: new Date().toISOString().split('T')[0],
        statut: 'en_attente',
        notes: `Générée automatiquement à la validation du contrat ${annee}`,
      })
      .select()
      .single()
    nf = ins.data
    insErr = ins.error
  }

  if (insErr || !nf) {
    return { ok: false, error: insErr?.message || 'Insert facture échoué' }
  }

  // 4. Calculer + insérer les lignes (logique extraite dans construireLignesFacture
  //    pour être partagée avec calculerEcartFactureContrat / regenererFactureDepuisContrat)
  const lignes = await construireLignesFacture(s, contrat, ecoleId, annee, nf.id)

  if (lignes.length) {
    const { error: ligErr } = await s.from('facture_lignes').insert(lignes)
    if (ligErr) {
      return { ok: false, facture_id: nf.id, numero: nf.numero, error: 'Lignes : ' + ligErr.message }
    }
  }

  return { ok: true, facture_id: nf.id, numero: nf.numero }
}

/**
 * Construit les lignes de facture théoriques pour un contrat donné (sans insert).
 * Source de vérité UNIQUE du calcul des lignes (DDR ventilée par enfant, postes,
 * assurance, frais d'inscription/réinscription).
 *
 * Chaque ligne produite porte aussi son imputation comptable et analytique
 * (tarif_id, compte_id, activite_id, centre_cout_id, centre_cout). C'est un
 * SNAPSHOT figé à la génération : le FEC d'un exercice clos ne doit pas bouger
 * si l'école reparamètre ses postes après coup.
 */
export async function construireLignesFacture(
  s: AnySupabase,
  contrat: any,
  ecoleId: string,
  annee: string,
  factureId: string,
): Promise<any[]> {
  const enfants = contrat.contrat_enfants || []
  const enfantIds = enfants.map((e: any) => e.enfant_id).filter(Boolean)
  // Le résolveur comptable est chargé DANS le Promise.all : l'imputation ne doit
  // coûter aucun aller-retour supplémentaire sur le chemin critique de la
  // facturation. chargerImputations ne lève jamais — au pire il renvoie un
  // résolveur vide et les lignes partent avec des colonnes comptables à NULL.
  const [{ data: ddr }, { data: tarifsList }, { data: fraisCfg }, { data: pedagos }, resolveur, { data: baremesFN }, { data: familleRow }] = await Promise.all([
    s
      .from('demandes_reduction')
      .select('tarif_accorde, statut')
      .eq('famille_id', contrat.famille_id)
      .eq('annee_scolaire', annee)
      .eq('statut', 'accepte')
      .maybeSingle(),
    s.from('tarifs_secteur').select('id, inclus_dans_reduction, montant').eq('ecole_id', ecoleId),
    s.from('frais_inscription_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).maybeSingle(),
    enfantIds.length
      ? s.from('inscriptions_pedagogiques').select('enfant_id').eq('annee_scolaire', annee).in('enfant_id', enfantIds)
      : Promise.resolve({ data: [] as any[] }),
    chargerImputations(s, ecoleId),
    // FIX audit démo 06/08 (P1-1) : la réduction famille nombreuse était appliquée
    // à la signature du contrat mais JAMAIS reproduite ici. Conséquences : bandeau
    // « écart avec le contrat » erroné sur toute facture de famille nombreuse, et
    // surtout une RÉGÉNÉRATION qui faisait sauter la réduction (surfacturation).
    s.from('reductions_famille_nombreuse').select('nb_enfants, montant_reduction, tranches_eligibles')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants'),
    s.from('familles').select('tranche_id').eq('id', contrat.famille_id).maybeSingle(),
  ])
  const nouveauxIds = new Set((pedagos || []).map((p: any) => p.enfant_id))
  const tarifMap: Record<string, boolean> = {}
  const tarifMontantMap: Record<string, number> = {}
  ;(tarifsList || []).forEach((t: any) => {
    tarifMap[t.id] = t.inclus_dans_reduction !== false
    if (t.montant != null) tarifMontantMap[t.id] = parseFloat(t.montant) || 0
  })

  // FIX sécu audit 28/07 : le montant d'un poste est REPRIS depuis tarifs_secteur
  // (jointure sur p.tarif_id) au lieu de faire confiance au montant JSON stocké
  // dans contrat_enfants.postes (fourni à l'origine par le navigateur du parent).
  // Fallback sur p.montant UNIQUEMENT pour les données historiques dont le
  // tarif_id n'est plus retrouvable en base.
  const montantPoste = (p: any): number =>
    p?.tarif_id != null && tarifMontantMap[p.tarif_id] != null
      ? tarifMontantMap[p.tarif_id]
      : (parseFloat(p?.montant) || 0)

  const nf = { id: factureId }
  // Toutes les lignes poussées ici passent par `imputer` et portent explicitement
  // `tarif_id` (null si la ligne ne vient pas d'un poste). Uniformité voulue :
  // l'insert est un insert de masse, et PostgREST se comporte mal quand les
  // objets d'un même tableau n'ont pas exactement le même jeu de clés.
  const lignes: any[] = []

  if (ddr?.tarif_accorde) {
    // DDR validée : on RÉPARTIT le tarif accordé par enfant, et on détaille
    // ligne par ligne comme pour le plein tarif. La réduction s'applique en
    // priorité sur la scolarité, ensuite éventuellement sur la demi-pension.
    //
    // Mécanique :
    //   part_par_enfant = tarif_accorde / nb_enfants
    //   postes "inclus_dans_reduction" SAUF scolarité (ex: Demi-pension) → plein tarif
    //   Scolarité par enfant = part_par_enfant - somme(autres postes inclus)
    //   Postes NON inclus (Navette, Car de ramassage) → plein tarif facturé en plus
    const tarifAccorde = parseFloat(ddr.tarif_accorde) || 0
    const nbEnfants = enfants.length || 1
    const partParEnfant = Math.round((tarifAccorde / nbEnfants) * 100) / 100

    for (const e of enfants) {
      const enfantLabel = e.enfants ? `${e.enfants.prenom || ''} ${e.enfants.nom || ''}`.trim() : ''
      const classe = e.classe_prevue ? ` (${e.classe_prevue})` : ''
      const postesContrat = Array.isArray(e.postes) ? e.postes : []

      // Postes inclus dans la réduction (sauf scolarité) — facturés au plein tarif
      const postesInclusHorsScol = postesContrat.filter((p: any) => {
        const inclus = tarifMap[p.tarif_id] !== false
        const estScolarite = /scolarit/i.test(p.nom || '')
        return inclus && !estScolarite
      })
      const totalInclusHorsScol = postesInclusHorsScol.reduce((s: number, p: any) => s + montantPoste(p), 0)

      // La ligne « Scolarité (tarif accordé) » n'est pas une ligne système : elle
      // vient bien du poste scolarité du contrat, seul son montant est recalculé.
      // On récupère donc son poste d'origine pour l'imputer sur le bon compte
      // plutôt que sur le compte de repli.
      const posteScolarite = postesContrat.find((p: any) => /scolarit/i.test(p.nom || ''))

      // Scolarité enfant = part accordée - autres postes inclus (DP, etc.)
      // Si la part est inférieure aux autres postes inclus → réduction additionnelle sur DP
      const scolEnfant = Math.max(0, Math.round((partParEnfant - totalInclusHorsScol) * 100) / 100)

      // Ligne Scolarité (tarif accordé)
      if (scolEnfant > 0) {
        lignes.push(imputer({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          tarif_id: posteScolarite?.tarif_id ?? null,
          description: `Scolarité ${annee} — ${enfantLabel}${classe} (tarif accordé)`.trim(),
          montant: scolEnfant,
          deductible: true,
        }, posteScolarite?.tarif_id ? resolveur.parTarif(posteScolarite.tarif_id) : resolveur.parCle('poste_defaut')))
      }

      // Lignes postes inclus hors scolarité (DP au plein tarif)
      // Si scolEnfant a saturé à 0 et qu'il reste un excédent, on réduit la DP en cascade
      let excedentARepartir = Math.max(0, totalInclusHorsScol - partParEnfant)
      // Trier postes inclus pour appliquer la cascade (DP d'abord par défaut)
      for (const p of postesInclusHorsScol) {
        const montantPlein = montantPoste(p)
        if (montantPlein <= 0) continue
        const reduc = Math.min(excedentARepartir, montantPlein)
        excedentARepartir -= reduc
        const montantFinal = Math.round((montantPlein - reduc) * 100) / 100
        if (montantFinal > 0) {
          lignes.push(imputer({
            facture_id: nf.id,
            enfant_id: e.enfant_id,
            tarif_id: p.tarif_id ?? null,
            description: `${p.nom || 'Poste'} ${annee} — ${enfantLabel}${classe}`.trim(),
            montant: montantFinal,
            deductible: true,
          }, resolveur.parTarif(p.tarif_id)))
        }
      }

      // Postes NON inclus dans la réduction (Navette, Car de ramassage) → plein tarif
      const postesNonInclus = postesContrat.filter((p: any) => tarifMap[p.tarif_id] === false)
      for (const p of postesNonInclus) {
        const m = montantPoste(p)
        if (m <= 0) continue
        lignes.push(imputer({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          tarif_id: p.tarif_id ?? null,
          description: `${p.nom || 'Poste'} ${annee} — ${enfantLabel}${classe}`.trim(),
          montant: m,
          deductible: false,
        }, resolveur.parTarif(p.tarif_id)))
      }
    }
  } else {
    // Pas de DDR validée : on éclate les postes du contrat (scolarité, demi-pension,
    // navette, cantine, etc.) pour que la facture affiche le détail au lieu d'un montant
    // unique aggregé. Le caractère déductible suit le tarif (tarifMap).
    for (const e of enfants) {
      const postes = Array.isArray(e.postes) ? e.postes : []
      const enfantLabel = e.enfants ? `${e.enfants.prenom || ''} ${e.enfants.nom || ''}`.trim() : ''
      const classe = e.classe_prevue ? ` (${e.classe_prevue})` : ''
      if (postes.length > 0) {
        for (const p of postes) {
          const montant = montantPoste(p)
          if (montant <= 0) continue
          const nom = p.nom || 'Poste'
          // Déductibilité : true par défaut (scolarité), mais selon tarifMap si renseigné.
          // Les options classiques (cantine, transport...) ne sont pas déductibles.
          const tarifInclus = tarifMap[p.tarif_id]
          const estScolarite = /scolarit/i.test(nom)
          const deductible = tarifInclus !== undefined ? tarifInclus !== false : estScolarite
          lignes.push(imputer({
            facture_id: nf.id,
            enfant_id: e.enfant_id,
            tarif_id: p.tarif_id ?? null,
            description: `${nom} ${annee} — ${enfantLabel}${classe}`.trim(),
            montant,
            deductible,
          }, resolveur.parTarif(p.tarif_id)))
        }
      } else if (e.sous_total != null) {
        // Fallback : pas de détail des postes → on crée la ligne agrégée comme avant.
        // Aucun poste identifiable derrière ce montant : imputation de repli, sinon
        // le montant tomberait hors de tout compte de produit.
        lignes.push(imputer({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          tarif_id: null,
          description: `Scolarité ${annee}${e.classe_prevue ? ' — ' + e.classe_prevue : ''}${enfantLabel ? ' (' + enfantLabel + ')' : ''}`.trim(),
          montant: parseFloat(e.sous_total) || 0,
          deductible: true,
        }, resolveur.parCle('poste_defaut')))
      }
    }
  }

  // Réduction famille nombreuse — uniquement HORS DDR (une DDR acceptée remplace
  // le barème), mêmes règles que le contrat portail/admin : ≥ 2 enfants avec
  // classe, barème le plus élevé dont nb_enfants ≤ effectif, filtré par les
  // tranches éligibles (null/[] = toutes). Ligne NÉGATIVE imputée sur la clé
  // comptable 'reduction' (RRR accordés).
  if (!ddr?.tarif_accorde && Array.isArray(baremesFN) && baremesFN.length > 0) {
    const nbEnfantsTotal = enfants.length
    const nbAvecClasse = enfants.filter((e: any) => e.classe_prevue || e.classe_id).length
    if (nbAvecClasse >= 2) {
      const trancheFamille = familleRow?.tranche_id || null
      const applicables = baremesFN.filter((r: any) => {
        if (parseInt(r.nb_enfants) > nbEnfantsTotal) return false
        if (Array.isArray(r.tranches_eligibles) && r.tranches_eligibles.length > 0) {
          if (!trancheFamille || !r.tranches_eligibles.includes(trancheFamille)) return false
        }
        return true
      })
      const montantFN = applicables.length ? (parseFloat(applicables[applicables.length - 1].montant_reduction) || 0) : 0
      if (montantFN > 0) {
        lignes.push(imputer({
          facture_id: nf.id,
          enfant_id: null,
          tarif_id: null,
          description: `Réduction famille nombreuse (${nbEnfantsTotal} enfants)`,
          montant: -Math.abs(montantFN),
          deductible: true,
        }, resolveur.parCle('reduction')))
      }
    }
  }

  // Assurance scolaire si souscrite
  if (contrat.assurance_ecole && contrat.assurance_montant_total) {
    lignes.push(imputer({
      facture_id: nf.id,
      enfant_id: null,
      tarif_id: null,
      description: `Assurance scolaire ${annee}`,
      montant: parseFloat(contrat.assurance_montant_total) || 0,
      deductible: false,
    }, resolveur.parCle('assurance')))
  }

  // Frais inscription / réinscription selon config école
  if (fraisCfg) {
    const enfantsList = enfants
    const nouveauxEnfants = enfantsList.filter((e: any) => nouveauxIds.has(e.enfant_id))
    const reinscriptionsEnfants = enfantsList.filter((e: any) => !nouveauxIds.has(e.enfant_id))

    const fraisInscEnfant = parseFloat(fraisCfg.inscription_par_enfant) || 0
    if (fraisInscEnfant > 0) {
      for (const e of nouveauxEnfants) {
        lignes.push(imputer({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          tarif_id: null,
          description: `Frais d'inscription ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
          montant: fraisInscEnfant,
          deductible: false,
        }, resolveur.parCle('frais_inscription')))
      }
    }
    const fraisInscFamille = parseFloat(fraisCfg.inscription_par_famille) || 0
    if (fraisInscFamille > 0 && nouveauxEnfants.length > 0) {
      lignes.push(imputer({
        facture_id: nf.id,
        enfant_id: null,
        tarif_id: null,
        description: `Frais d'inscription forfait famille ${annee}`,
        montant: fraisInscFamille,
        deductible: false,
      }, resolveur.parCle('frais_inscription')))
    }
    const fraisReinsEnfant = parseFloat(fraisCfg.reinscription_par_enfant) || 0
    if (fraisReinsEnfant > 0) {
      for (const e of reinscriptionsEnfants) {
        lignes.push(imputer({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          tarif_id: null,
          description: `Frais de réinscription ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
          montant: fraisReinsEnfant,
          deductible: false,
        }, resolveur.parCle('frais_reinscription')))
      }
    }
    const fraisReinsFamille = parseFloat(fraisCfg.reinscription_par_famille) || 0
    if (fraisReinsFamille > 0 && reinscriptionsEnfants.length > 0) {
      lignes.push(imputer({
        facture_id: nf.id,
        enfant_id: null,
        tarif_id: null,
        description: `Frais de réinscription forfait famille ${annee}`,
        montant: fraisReinsFamille,
        deductible: false,
      }, resolveur.parCle('frais_reinscription')))
    }
  }

  return lignes
}

/**
 * Compare la facture existante d'une famille avec ce que le contrat actuel
 * générerait. Permet d'afficher un bandeau "la facture ne correspond plus au
 * contrat" (re-signature du parent, DDR acceptée après validation, etc.).
 */
export interface EcartFactureContrat {
  facture_id: string
  numero: string
  verrouillee: boolean
  totalActuel: number
  totalTheorique: number
  ecart: number
  enEcart: boolean
}

export async function calculerEcartFactureContrat(
  s: AnySupabase,
  contrat: any,
  ecoleId: string,
  annee: string,
): Promise<EcartFactureContrat | null> {
  if (!contrat?.famille_id) return null
  const { data: facture } = await s
    .from('factures')
    .select('id, numero, statut, verrouillee')
    .eq('famille_id', contrat.famille_id)
    .eq('annee_scolaire', annee)
    .neq('statut', 'annule')
    .maybeSingle()
  if (!facture) return null

  const [{ data: lignesActuelles }, lignesTheoriques] = await Promise.all([
    s.from('facture_lignes').select('montant').eq('facture_id', facture.id),
    construireLignesFacture(s, contrat, ecoleId, annee, facture.id),
  ])
  const totalActuel = Math.round(((lignesActuelles || []) as any[]).reduce((sum: number, l: any) => sum + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const totalTheorique = Math.round(lignesTheoriques.reduce((sum: number, l: any) => sum + (parseFloat(l.montant) || 0), 0) * 100) / 100
  const ecart = Math.round((totalTheorique - totalActuel) * 100) / 100
  return {
    facture_id: facture.id,
    numero: facture.numero,
    verrouillee: !!facture.verrouillee,
    totalActuel,
    totalTheorique,
    ecart,
    enEcart: Math.abs(ecart) > 1,
  }
}

/**
 * Régénère les lignes de la facture existante depuis le contrat actuel.
 * Refuse si la facture est verrouillée. Resynchronise l'échéancier (échéance
 * de régularisation si le nouveau total n'est plus couvert).
 */
export async function regenererFactureDepuisContrat(
  s: AnySupabase,
  contrat: any,
  ecoleId: string,
  annee: string,
): Promise<CreerFactureResult> {
  if (!contrat?.famille_id) return { ok: false, error: 'Contrat sans famille' }
  const { data: facture } = await s
    .from('factures')
    .select('id, numero, statut, verrouillee')
    .eq('famille_id', contrat.famille_id)
    .eq('annee_scolaire', annee)
    .neq('statut', 'annule')
    .maybeSingle()
  if (!facture) return { ok: false, error: 'Aucune facture active pour cette famille/année' }
  if (facture.verrouillee) return { ok: false, error: `Facture ${facture.numero} verrouillée : déverrouiller avant de régénérer` }

  const lignes = await construireLignesFacture(s, contrat, ecoleId, annee, facture.id)
  if (lignes.length === 0) return { ok: false, error: 'Le contrat ne génère aucune ligne (contrat vide ?)' }

  const { error: delErr } = await s.from('facture_lignes').delete().eq('facture_id', facture.id)
  if (delErr) return { ok: false, error: 'Purge lignes : ' + delErr.message }
  const { error: insErr } = await s.from('facture_lignes').insert(lignes)
  if (insErr) return { ok: false, facture_id: facture.id, numero: facture.numero, error: 'Lignes : ' + insErr.message }

  // Resync échéancier : échéance de régularisation si le total n'est plus couvert
  try {
    const { data: echeances } = await s.from('cheques_prevus')
      .select('id, montant, numero_cheque, date_echeance, mode_paiement, contrat_id')
      .eq('famille_id', contrat.famille_id)
    const totalFacture = lignes.reduce((sum: number, l: any) => sum + (parseFloat(l.montant) || 0), 0)
    const totalEch = ((echeances || []) as any[]).reduce((sum: number, e: any) => sum + (parseFloat(e.montant) || 0), 0)
    const ecartEch = Math.round((totalFacture - totalEch) * 100) / 100
    if ((echeances || []).length > 0 && ecartEch > 1) {
      const maxNum = Math.max(...(echeances as any[]).map((e: any) => e.numero_cheque || 0))
      const derniereDate = (echeances as any[]).map((e: any) => e.date_echeance).sort().pop()
      const modeEch = (echeances as any[])[0]?.mode_paiement || 'virement'
      const { error: chqErr } = await s.from('cheques_prevus').insert({
        contrat_id: (echeances as any[])[0]?.contrat_id || contrat.id,
        famille_id: contrat.famille_id,
        ecole_id: ecoleId,
        numero_cheque: maxNum + 1,
        montant: ecartEch,
        date_echeance: derniereDate,
        statut: modeEch === 'cheque' ? 'attente_reception' : 'prevu',
        mode_paiement: modeEch,
        note: 'Régularisation auto : régénération facture depuis contrat',
        facture_id: facture.id,
      })
      // Reste « best effort » (la facture est correcte), mais l'echec n'est plus muet.
      if (chqErr) console.error('[regenererFactureDepuisContrat] insert cheques_prevus failed:', chqErr.message)
    }
  } catch (e: any) { console.error('[regenererFactureDepuisContrat] resync echeancier:', e?.message) }

  return { ok: true, facture_id: facture.id, numero: facture.numero }
}
