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

  // 1. Idempotence : si déjà une facture pour cette famille/année → on retourne celle-là
  const { data: existing } = await s
    .from('factures')
    .select('id, numero')
    .eq('famille_id', contrat.famille_id)
    .eq('annee_scolaire', annee)
    .maybeSingle()

  if (existing) {
    return { ok: true, deja_existante: true, facture_id: existing.id, numero: existing.numero }
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

  // 3. Insert entête facture
  const { data: nf, error: insErr } = await s
    .from('factures')
    .insert({
      famille_id: contrat.famille_id,
      annee_scolaire: annee,
      numero,
      date_emission: new Date().toISOString().split('T')[0],
      statut: 'en_attente',
      notes: `Générée automatiquement à la validation du contrat ${annee}`,
    })
    .select()
    .single()

  if (insErr || !nf) {
    return { ok: false, error: insErr?.message || 'Insert facture échoué' }
  }

  // 4. Calculer les lignes
  const enfants = contrat.contrat_enfants || []
  const enfantIds = enfants.map((e: any) => e.enfant_id).filter(Boolean)
  const [{ data: ddr }, { data: tarifsList }, { data: fraisCfg }, { data: pedagos }] = await Promise.all([
    s
      .from('demandes_reduction')
      .select('tarif_accorde, statut')
      .eq('famille_id', contrat.famille_id)
      .eq('annee_scolaire', annee)
      .eq('statut', 'accepte')
      .maybeSingle(),
    s.from('tarifs_secteur').select('id, inclus_dans_reduction').eq('ecole_id', ecoleId),
    s.from('frais_inscription_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).maybeSingle(),
    enfantIds.length
      ? s.from('inscriptions_pedagogiques').select('enfant_id').eq('annee_scolaire', annee).in('enfant_id', enfantIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const nouveauxIds = new Set((pedagos || []).map((p: any) => p.enfant_id))
  const tarifMap: Record<string, boolean> = {}
  ;(tarifsList || []).forEach((t: any) => {
    tarifMap[t.id] = t.inclus_dans_reduction !== false
  })

  const lignes: any[] = []

  if (ddr?.tarif_accorde) {
    // DDR validée : 1 ligne forfait commission + 1 ligne par enfant pour les options
    const enfantsLabels = enfants
      .map((e: any) => `${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim())
      .filter(Boolean)
      .join(' + ')
    const descForfait = enfantsLabels
      ? `Forfait scolarité ${annee} — Famille (${enfants.length} enfant${enfants.length > 1 ? 's' : ''} : ${enfantsLabels}) — tarif accordé par la commission`
      : `Forfait scolarité ${annee} (tarif accordé par la commission)`
    lignes.push({
      facture_id: nf.id,
      enfant_id: null,
      description: descForfait,
      montant: parseFloat(ddr.tarif_accorde) || 0,
      deductible: true,
    })
    for (const e of enfants) {
      const totalOptions = (e.postes || []).reduce((acc: number, p: any) => {
        const inclus = tarifMap[p.tarif_id] !== false
        return acc + (inclus ? 0 : (parseFloat(p.montant) || 0))
      }, 0)
      if (totalOptions > 0) {
        lignes.push({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          description: `Options ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
          montant: totalOptions,
          deductible: false,
        })
      }
    }
  } else {
    // Pas de DDR validée : 1 ligne par enfant
    for (const e of enfants) {
      if (e.sous_total != null) {
        lignes.push({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          description: `Scolarité ${annee}${e.classe_prevue ? ' — ' + e.classe_prevue : ''}${e.enfants ? ' (' + (e.enfants.prenom || '') + ' ' + (e.enfants.nom || '') + ')' : ''}`.trim(),
          montant: parseFloat(e.sous_total) || 0,
          deductible: true,
        })
      }
    }
  }

  // Assurance scolaire si souscrite
  if (contrat.assurance_ecole && contrat.assurance_montant_total) {
    lignes.push({
      facture_id: nf.id,
      enfant_id: null,
      description: `Assurance scolaire ${annee}`,
      montant: parseFloat(contrat.assurance_montant_total) || 0,
      deductible: false,
    })
  }

  // Frais inscription / réinscription selon config école
  if (fraisCfg) {
    const enfantsList = enfants
    const nouveauxEnfants = enfantsList.filter((e: any) => nouveauxIds.has(e.enfant_id))
    const reinscriptionsEnfants = enfantsList.filter((e: any) => !nouveauxIds.has(e.enfant_id))

    const fraisInscEnfant = parseFloat(fraisCfg.inscription_par_enfant) || 0
    if (fraisInscEnfant > 0) {
      for (const e of nouveauxEnfants) {
        lignes.push({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          description: `Frais d'inscription ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
          montant: fraisInscEnfant,
          deductible: false,
        })
      }
    }
    const fraisInscFamille = parseFloat(fraisCfg.inscription_par_famille) || 0
    if (fraisInscFamille > 0 && nouveauxEnfants.length > 0) {
      lignes.push({
        facture_id: nf.id,
        enfant_id: null,
        description: `Frais d'inscription forfait famille ${annee}`,
        montant: fraisInscFamille,
        deductible: false,
      })
    }
    const fraisReinsEnfant = parseFloat(fraisCfg.reinscription_par_enfant) || 0
    if (fraisReinsEnfant > 0) {
      for (const e of reinscriptionsEnfants) {
        lignes.push({
          facture_id: nf.id,
          enfant_id: e.enfant_id,
          description: `Frais de réinscription ${annee} — ${e.enfants?.prenom || ''} ${e.enfants?.nom || ''}`.trim(),
          montant: fraisReinsEnfant,
          deductible: false,
        })
      }
    }
    const fraisReinsFamille = parseFloat(fraisCfg.reinscription_par_famille) || 0
    if (fraisReinsFamille > 0 && reinscriptionsEnfants.length > 0) {
      lignes.push({
        facture_id: nf.id,
        enfant_id: null,
        description: `Frais de réinscription forfait famille ${annee}`,
        montant: fraisReinsFamille,
        deductible: false,
      })
    }
  }

  if (lignes.length) {
    const { error: ligErr } = await s.from('facture_lignes').insert(lignes)
    if (ligErr) {
      return { ok: false, facture_id: nf.id, numero: nf.numero, error: 'Lignes : ' + ligErr.message }
    }
  }

  return { ok: true, facture_id: nf.id, numero: nf.numero }
}
