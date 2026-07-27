/**
 * Helpers de saisie ADMIN d'un contrat de scolarisation PAPIER.
 *
 * Le parent a signé un contrat papier ; l'admin saisit les mêmes informations
 * que le formulaire du portail (src/app/portail/inscriptions/contrat/page.tsx)
 * et le contrat est validé IMMÉDIATEMENT (statut 'valide'), avec :
 *  - génération de l'échéancier (cheques_prevus),
 *  - création de la facture (creerFactureDepuisContrat),
 *  - upsert des scolarités N+1 (comme la fonction valider de
 *    src/app/[ecole]/inscriptions/contrat/[id]/page.tsx),
 *  - mise à jour familles.scolarite_n1 / scolarite_n1_annee.
 *
 * Serveur-agnostique : le client supabase est passé en paramètre.
 */
import { creerFactureDepuisContrat } from '@/lib/facture-contrat'
import { logAction } from '@/lib/audit-log'

type AnySupabase = any

export interface LigneEcheancier {
  numero_cheque: number
  montant: number
  date_echeance: string
  statut: string
  mode_paiement: string
}

/**
 * Génère les lignes d'échéancier — logique EXACTE du portail :
 *  - départ septembre (année = parseInt(anneeScolaire.split('-')[0]), mois index 8)
 *  - jour du mois = jourEcheance || 5
 *  - statut initial 'attente_reception' si chèque, sinon 'prevu'
 *  - la DERNIÈRE échéance absorbe l'écart d'arrondi pour que la somme = total EXACT.
 */
export function genererLignesEcheancier({
  totalAnnuel,
  nbEcheances,
  anneeScolaire,
  jourEcheance,
  modeReglement,
}: {
  totalAnnuel: number
  nbEcheances: number
  anneeScolaire: string
  jourEcheance: number | null | undefined
  modeReglement: string
}): LigneEcheancier[] {
  if (!nbEcheances || nbEcheances <= 0) return []
  // Année scolaire "2026-2027" => septembre 2026 (mois index 8)
  const anneeDebut = parseInt(anneeScolaire.split('-')[0]) || new Date().getFullYear()
  const moisDebut = 8
  const jour = jourEcheance || 5
  const statutInitial = modeReglement === 'cheque' ? 'attente_reception' : 'prevu'
  const montantEcheance = Math.round((totalAnnuel / nbEcheances) * 100) / 100
  const lignes: LigneEcheancier[] = []
  for (let i = 0; i < nbEcheances; i++) {
    let m = moisDebut + i; let y = anneeDebut
    while (m > 11) { m -= 12; y++ }
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
    const montant = i === nbEcheances - 1
      ? Math.round((totalAnnuel - montantEcheance * (nbEcheances - 1)) * 100) / 100
      : montantEcheance
    lignes.push({ numero_cheque: i + 1, montant, date_echeance: dateStr, statut: statutInitial, mode_paiement: modeReglement })
  }
  return lignes
}

export interface EnfantContratPapier {
  enfant_id: string
  classe_id: string
  classe_nom: string
  postes: { tarif_id: string; nom: string; montant: number }[]
  sous_total: number
}

export interface CreerContratPapierParams {
  familleId: string
  ecoleId: string
  anneeScolaire: string
  enfantsContrat: EnfantContratPapier[]
  assuranceEcole: boolean
  assuranceMontantTotal: number
  modeReglement: string
  nbEcheances: number
  jourEcheance: number | null
  montantTotal: number
  observations: string | null
  demandeReductionId: string | null
  /** Date à laquelle le contrat papier a été signé (YYYY-MM-DD) */
  signatureDate: string
  /** URL du scan du contrat papier uploadé (nullable) */
  contratPapierUrl: string | null
}

export interface CreerContratPapierResult {
  ok: boolean
  contratId?: string
  factureId?: string
  factureNumero?: string
  factureDejaExistante?: boolean
  error?: string
}

export async function creerContratPapier(
  s: AnySupabase,
  params: CreerContratPapierParams,
): Promise<CreerContratPapierResult> {
  const {
    familleId, ecoleId, anneeScolaire, enfantsContrat,
    assuranceEcole, assuranceMontantTotal, modeReglement, nbEcheances,
    jourEcheance, montantTotal, observations, demandeReductionId,
    signatureDate, contratPapierUrl,
  } = params

  if (!familleId || !ecoleId || !anneeScolaire) return { ok: false, error: 'Paramètres manquants (famille / école / année)' }
  const enfantsValides = (enfantsContrat || []).filter(e => e.enfant_id && e.classe_id)
  if (enfantsValides.length === 0) return { ok: false, error: 'Aucun enfant avec classe sélectionnée' }

  const nowIso = new Date().toISOString()

  // ── 1. contrats_scolarisation : UPSERT (update si un contrat existe déjà pour famille+année)
  const payload: any = {
    famille_id: familleId,
    ecole_id: ecoleId,
    annee_scolaire: anneeScolaire,
    demande_reduction_id: demandeReductionId || null,
    assurance_ecole: assuranceEcole,
    assurance_montant_total: assuranceMontantTotal,
    mode_reglement: modeReglement,
    nb_echeances: nbEcheances,
    montant_total: montantTotal,
    observations: observations || null,
    engagement_lu: true,
    statut: 'valide',
    soumis_le: nowIso,
    valide_le: nowIso,
    saisi_par_admin: true,
    signature_url: null,
    signature_date: signatureDate,
    contrat_papier_url: contratPapierUrl || null,
  }

  const { data: existant, error: exErr } = await s
    .from('contrats_scolarisation')
    .select('id, statut')
    .eq('famille_id', familleId)
    .eq('annee_scolaire', anneeScolaire)
    .maybeSingle()
  if (exErr) return { ok: false, error: 'Lecture contrat existant : ' + exErr.message }

  let contratId: string
  if (existant?.id) {
    const { data: upd, error: updErr } = await s
      .from('contrats_scolarisation').update(payload).eq('id', existant.id).select()
    if (updErr || !upd || upd.length === 0) {
      return { ok: false, error: 'Mise à jour du contrat : ' + (updErr?.message || 'aucune ligne modifiée') }
    }
    contratId = existant.id
  } else {
    const { data: nc, error: insErr } = await s
      .from('contrats_scolarisation').insert(payload).select().single()
    if (insErr || !nc) return { ok: false, error: 'Création du contrat : ' + (insErr?.message || 'inconnue') }
    contratId = nc.id
  }

  // Résolution secteur_id par classe (comme le portail : insert avec secteur_id de la classe)
  const { data: classesEcole } = await s.from('classes').select('id, nom, secteur_id').eq('ecole_id', ecoleId)
  const classesMap: Record<string, any> = {}
  ;(classesEcole || []).forEach((c: any) => { classesMap[c.id] = c })

  // ── 2. contrat_enfants : DELETE puis INSERT
  const { error: delEnfErr } = await s.from('contrat_enfants').delete().eq('contrat_id', contratId)
  if (delEnfErr) return { ok: false, contratId, error: 'Purge contrat_enfants : ' + delEnfErr.message }
  for (const e of enfantsValides) {
    const cls = classesMap[e.classe_id]
    const { error: ceErr } = await s.from('contrat_enfants').insert({
      contrat_id: contratId,
      enfant_id: e.enfant_id,
      secteur_id: cls?.secteur_id || null,
      classe_prevue: e.classe_nom || cls?.nom || null,
      postes: e.postes,
      sous_total: e.sous_total,
    })
    if (ceErr) return { ok: false, contratId, error: 'Insertion contrat_enfants : ' + ceErr.message }
  }

  // ── 3. cheques_prevus : DELETE puis INSERT via genererLignesEcheancier
  const { error: delChqErr } = await s.from('cheques_prevus').delete().eq('contrat_id', contratId)
  if (delChqErr) return { ok: false, contratId, error: 'Purge échéancier : ' + delChqErr.message }
  const lignesEch = genererLignesEcheancier({
    totalAnnuel: montantTotal, nbEcheances, anneeScolaire, jourEcheance, modeReglement,
  })
  if (lignesEch.length > 0) {
    const { error: chqErr } = await s.from('cheques_prevus').insert(
      lignesEch.map(l => ({ ...l, contrat_id: contratId, famille_id: familleId, ecole_id: ecoleId })),
    )
    if (chqErr) return { ok: false, contratId, error: 'Insertion échéancier : ' + chqErr.message }
  }

  // ── 4. Résoudre exercice_id via annee_scolaire (exercices.code) + backfill sur le contrat
  let exerciceId: string | null = null
  {
    const { data: ex, error: exLookErr } = await s
      .from('exercices').select('id').eq('ecole_id', ecoleId).eq('code', anneeScolaire).maybeSingle()
    if (exLookErr) console.warn('Résolution exercice échouée :', exLookErr.message)
    exerciceId = ex?.id || null
    if (exerciceId) {
      const { error: bfErr } = await s
        .from('contrats_scolarisation').update({ exercice_id: exerciceId }).eq('id', contratId)
      if (bfErr) console.warn('Backfill exercice_id échoué :', bfErr.message)
    }
  }

  // ── 5. Facture (le contrat doit être rechargé avec ses jointures pour construireLignesFacture)
  let factureId: string | undefined
  let factureNumero: string | undefined
  let factureDejaExistante: boolean | undefined
  {
    const { data: contratFull, error: cfErr } = await s
      .from('contrats_scolarisation')
      .select('*, contrat_enfants(*, enfants(prenom, nom))')
      .eq('id', contratId)
      .single()
    if (cfErr || !contratFull) return { ok: false, contratId, error: 'Relecture du contrat : ' + (cfErr?.message || 'introuvable') }
    const factRes = await creerFactureDepuisContrat(s, contratFull, ecoleId, anneeScolaire)
    if (!factRes.ok) return { ok: false, contratId, error: 'Facture : ' + (factRes.error || 'inconnue') }
    factureId = factRes.facture_id
    factureNumero = factRes.numero
    factureDejaExistante = factRes.deja_existante
  }

  // ── 6. Upsert scolarites N+1 pour chaque enfant (copie de la logique de contrat/[id]/page.tsx valider)
  try {
    if (exerciceId) {
      const rows = enfantsValides
        .map(e => ({
          enfant_id: e.enfant_id,
          exercice_id: exerciceId,
          ecole_id: ecoleId,
          classe_id: e.classe_id || null,
          statut_inscription: 'inscrit',
          annee_scolaire: anneeScolaire,
        }))
        .filter(r => r.enfant_id && r.exercice_id)
      if (rows.length > 0) {
        const { error: scErr } = await s.from('scolarites').upsert(rows, { onConflict: 'enfant_id,exercice_id' })
        if (scErr) console.warn('Upsert scolarités N+1 échoué :', scErr.message)
      }
    }
  } catch (e) { console.warn('Création scolarités N+1 échouée :', e) }

  // ── 7. familles : scolarité N+1 (comme le portail après soumission)
  {
    const { error: famErr } = await s
      .from('familles')
      .update({ scolarite_n1: montantTotal, scolarite_n1_annee: anneeScolaire })
      .eq('id', familleId)
    if (famErr) console.warn('Mise à jour familles.scolarite_n1 échouée :', famErr.message)
  }

  // Audit log (ne throw jamais)
  await logAction(s, ecoleId, 'contrat_valide', {
    contrat_id: contratId,
    famille_id: familleId,
    exercice_id: exerciceId,
    montant_total: montantTotal,
    saisi_papier: true,
  })

  return { ok: true, contratId, factureId, factureNumero, factureDejaExistante }
}
