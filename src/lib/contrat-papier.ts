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
import { dateEcheance } from '@/lib/echeance'
import {
  chargerReportActif,
  libelleReport,
  repartirReportSurEcheances,
  type ReportSoldeActif,
} from '@/lib/report-solde'

type AnySupabase = any

export interface LigneEcheancier {
  numero_cheque: number
  montant: number
  date_echeance: string
  statut: string
  mode_paiement: string
  /**
   * Renseigné UNIQUEMENT sur les échéances issues d'un report de solde
   * antérieur (ssss2-D). Une échéance de report ne correspond à aucune ligne
   * de facture de l'année : elle reprend une créance déjà constatée l'année
   * d'origine, qui vit sur le compte 411.
   */
  report_solde_id?: string | null
  /** Libellé distinctif, écrit dans `cheques_prevus.note`. */
  note?: string | null
  /**
   * Facture de l'année à laquelle rattacher l'échéance.
   * INDISPENSABLE : le portail famille (`src/app/portail/factures/page.tsx`)
   * lit les échéances PAR `facture_id`. Tant qu'il n'était pas posé,
   * l'échéancier d'un contrat n'apparaissait jamais côté parent.
   */
  facture_id?: string | null
}

/**
 * Génère les lignes d'échéancier — logique du portail :
 *  - départ septembre (année = parseInt(anneeScolaire.split('-')[0]), mois index 8)
 *  - jour du mois = jourEcheance || 5, BORNÉ au dernier jour réel du mois
 *  - statut initial 'attente_reception' si chèque, sinon 'prevu'
 *  - la DERNIÈRE échéance absorbe l'écart d'arrondi pour que la somme = total EXACT.
 *
 * FIX ssss2-D — deux défauts corrigés ici :
 *  1. la date était fabriquée à la main (`${y}-${m}-${jour}`) sans borner le
 *     jour : un échéancier au 31 produisait « 2027-02-31 », date invalide
 *     injectée telle quelle en base. On passe désormais par le helper partagé
 *     `dateEcheance()` (src/lib/echeance.ts), qui clampe comme le fait déjà
 *     la RPC SQL.
 *  2. `facture_id` n'était jamais posé, alors que le portail parent lit les
 *     échéances par `facture_id`. Il est désormais propagé quand il est connu.
 *
 * REPORT DE SOLDE (optionnel) : si un report validé est fourni, il est repris
 * dans l'échéancier via `repartirReportSurEcheances`. Aucune ligne de facture
 * n'est créée — la créance existe déjà sur le compte 411 de la famille.
 */
export function genererLignesEcheancier({
  totalAnnuel,
  nbEcheances,
  anneeScolaire,
  jourEcheance,
  modeReglement,
  report,
  factureId,
}: {
  totalAnnuel: number
  nbEcheances: number
  anneeScolaire: string
  jourEcheance: number | null | undefined
  modeReglement: string
  /** Report de solde validé pour l'exercice cible, ou null. */
  report?: ReportSoldeActif | null
  /** Facture de l'année, si déjà créée. */
  factureId?: string | null
}): LigneEcheancier[] {
  if (!nbEcheances || nbEcheances <= 0) return []
  // Année scolaire "2026-2027" => septembre 2026 (mois index 8)
  const anneeDebut = parseInt(anneeScolaire.split('-')[0]) || new Date().getFullYear()
  const moisDebut = 8
  const statutInitial = modeReglement === 'cheque' ? 'attente_reception' : 'prevu'
  const montantEcheance = Math.round((totalAnnuel / nbEcheances) * 100) / 100

  const lignes: LigneEcheancier[] = []
  for (let i = 0; i < nbEcheances; i++) {
    let m = moisDebut + i; let y = anneeDebut
    while (m > 11) { m -= 12; y++ }
    const dateStr = dateEcheance(y, m + 1, jourEcheance)
    const montant = i === nbEcheances - 1
      ? Math.round((totalAnnuel - montantEcheance * (nbEcheances - 1)) * 100) / 100
      : montantEcheance
    lignes.push({
      numero_cheque: i + 1,
      montant,
      date_echeance: dateStr,
      statut: statutInitial,
      mode_paiement: modeReglement,
      report_solde_id: null,
      note: null,
      facture_id: factureId ?? null,
    })
  }

  const montantReport = Number(report?.montant) || 0
  if (!report || montantReport === 0) return lignes

  const repartition = repartirReportSurEcheances(
    montantReport,
    report.mode,
    lignes.map(l => ({ date_echeance: l.date_echeance, montant: l.montant })),
  )

  // Les échéances de scolarité ne sont plus touchées, dans aucun des deux sens :
  // le report vit dans ses propres lignes (négatives pour un trop-perçu), afin
  // que `montant_echeance` dise la vérité et que ce générateur produise
  // exactement le même résultat que la fonction SQL appliquer_report_echeancier,
  // qui sert le flux principal. Sans cet alignement, une famille créditrice
  // aurait été créditée deux fois.
  repartition.echeancesAjustees.forEach((e, i) => { lignes[i].montant = e.montant })

  // Échéances DÉDIÉES, taguées `report_solde_id`, libellé distinct.
  const libelle = libelleReport(report)
  const suffixe = report.mode === 'echeancier_separe' ? ' (échéancier séparé)'
    : report.mode === 'premiere_echeance' ? ' (première échéance)'
      : ''
  for (const e of repartition.echeancesReport) {
    lignes.push({
      numero_cheque: nbEcheances + e.numero,
      montant: e.montant,
      date_echeance: e.date_echeance,
      statut: statutInitial,
      mode_paiement: modeReglement,
      report_solde_id: report.id,
      note: libelle + suffixe,
      facture_id: factureId ?? null,
    })
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

  // ── 3. Résoudre exercice_id via annee_scolaire (exercices.code) + backfill sur le contrat
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

  // ── 4. Facture (le contrat doit être rechargé avec ses jointures pour construireLignesFacture)
  //
  // ORDRE (ssss2-D) : la facture est créée AVANT l'échéancier, alors qu'elle
  // venait après. Raison : les `cheques_prevus` doivent porter `facture_id`,
  // que le portail parent utilise pour retrouver l'échéancier. Effet de bord
  // favorable : si la facture échoue, l'ancien échéancier n'a pas été purgé.
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

  // ── 5. Report de solde antérieur validé pour cet exercice cible (ssss2-D).
  //      Objet de GESTION : il est repris dans l'échéancier ci-dessous, il ne
  //      crée AUCUNE ligne de facture (la créance vit déjà sur le compte 411).
  let reportActif: ReportSoldeActif | null = null
  if (exerciceId) {
    const { report, error: repErr } = await chargerReportActif(s, familleId, exerciceId)
    if (repErr) {
      // On ne fabrique pas un échéancier amputé du report en silence.
      return { ok: false, contratId, factureId, factureNumero, error: 'Lecture du report de solde : ' + repErr }
    }
    reportActif = report
  }

  // ── 6. cheques_prevus : DELETE puis INSERT via genererLignesEcheancier
  const { error: delChqErr } = await s.from('cheques_prevus').delete().eq('contrat_id', contratId)
  if (delChqErr) return { ok: false, contratId, factureId, factureNumero, error: 'Purge échéancier : ' + delChqErr.message }
  const lignesEch = genererLignesEcheancier({
    totalAnnuel: montantTotal, nbEcheances, anneeScolaire, jourEcheance, modeReglement,
    report: reportActif, factureId: factureId ?? null,
  })
  if (lignesEch.length > 0) {
    const { error: chqErr } = await s.from('cheques_prevus').insert(
      lignesEch.map(l => ({ ...l, contrat_id: contratId, famille_id: familleId, ecole_id: ecoleId })),
    )
    if (chqErr) return { ok: false, contratId, factureId, factureNumero, error: 'Insertion échéancier : ' + chqErr.message }
  }

  // ── 7. Upsert scolarites N+1 pour chaque enfant (copie de la logique de contrat/[id]/page.tsx valider)
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

  // ── 8. familles : scolarité N+1 (comme le portail après soumission)
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
    report_solde_id: reportActif?.id ?? null,
    report_solde_montant: reportActif ? Number(reportActif.montant) : null,
  })

  return { ok: true, contratId, factureId, factureNumero, factureDejaExistante }
}
