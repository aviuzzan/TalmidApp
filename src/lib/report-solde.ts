// lib/report-solde.ts
// ────────────────────────────────────────────────────────────────────────────
// CHANTIER ssss2-D — REPORT DU SOLDE D'UN EXERCICE SUR LE SUIVANT
// ────────────────────────────────────────────────────────────────────────────
// CE QUE CE MODULE N'EST PAS, ET NE DOIT JAMAIS DEVENIR
//
// Le solde impayé d'une famille vit sur son compte client 411, qui est un
// compte de BILAN. Il est repris tel quel à l'ouverture de l'exercice suivant
// par les écritures d'à-nouveaux. Il n'y a donc RIEN à reporter comptablement :
// la créance existe déjà, elle n'a pas besoin d'être recréée.
//
// En particulier, il ne faut JAMAIS créer une ligne de facture
// « solde année précédente » :
//   - le produit a été constaté l'année d'origine ; le refacturer le
//     compterait DEUX FOIS et fausserait le compte de résultat ;
//   - une nouvelle facture ferait redémarrer le délai de prescription
//     (2 ans, art. L218-2 du code de la consommation).
// Aucune fonction de ce fichier n'écrit dans `factures` ni `facture_lignes`.
// Si un jour du code d'ici s'y met, c'est une erreur : arrêtez-vous.
//
// CE QUE C'EST : un objet de GESTION, pas de comptabilité.
//   - une reprise du reliquat dans l'ÉCHÉANCIER de l'année suivante
//     (`cheques_prevus.report_solde_id`), pour que la famille sache quoi payer
//     et quand ;
//   - une ligne d'INFORMATION sur le relevé 411 et sur le portail parent.
//
// STRUCTURE EN BASE (déjà migrée, cf. table `reports_solde`) :
//   montant  numeric SIGNÉ : > 0 la famille doit, < 0 trop-perçu à déduire.
//   mode     'etale' | 'premiere_echeance' | 'echeancier_separe' | 'aucun'
//   statut   'propose' | 'valide' | 'annule'
//   source   'calcule' | 'saisi' | 'importe'
// Vue `reports_solde_actifs` : reports validés + `montant_echeance` = somme des
// `cheques_prevus` non annulés portant ce `report_solde_id` (donc « ce qui est
// déjà repris dans l'échéancier »).
// ────────────────────────────────────────────────────────────────────────────

import { chargerParLots, type ResultatChargement } from '@/lib/pagination'

/**
 * Le client Supabase du projet n'est pas généré avec les types de la base :
 * `select()` rend du `any` et les builders sont capricieux à typer. On reste
 * volontairement structurel, comme `contrat-papier.ts` et `facture-contrat.ts`.
 */
type AnySupabase = any

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ModeReport = 'etale' | 'premiere_echeance' | 'echeancier_separe' | 'aucun'
export type StatutReport = 'propose' | 'valide' | 'annule'
export type SourceReport = 'calcule' | 'saisi' | 'importe'

/** Ligne brute de `reports_solde`. */
export interface ReportSolde {
  id: string
  ecole_id: string
  famille_id: string
  exercice_origine_id: string
  exercice_cible_id: string
  /** Numérique SIGNÉ : > 0 la famille doit, < 0 trop-perçu. */
  montant: number | string
  mode: ModeReport | string
  statut: StatutReport | string
  source: SourceReport | string
  detail: Record<string, any> | null
  note: string | null
  cree_le: string
  cree_par: string | null
  valide_le: string | null
  valide_par: string | null
  annule_le: string | null
  annule_par: string | null
  motif_annulation: string | null
}

/** Ligne de `reports_solde` enrichie de la famille (écran de clôture). */
export interface ReportSoldeAvecFamille extends ReportSolde {
  familles: { nom: string | null; numero: string | null; compte_auxiliaire: string | null } | null
}

/** Ligne de la vue `reports_solde_actifs` (reports validés uniquement). */
export interface ReportSoldeActif {
  id: string
  ecole_id: string
  famille_id: string
  exercice_cible_id: string
  exercice_origine_id: string
  exercice_origine_code: string | null
  montant: number | string
  mode: ModeReport | string
  source: SourceReport | string
  note: string | null
  valide_le: string | null
  /** Somme des `cheques_prevus` non annulés portant ce report. */
  montant_echeance: number | string
}

/** Une ligne du tableau rendu par la RPC `calculer_soldes_cloture`. */
export interface SoldeCloture {
  famille_id: string
  famille_nom: string | null
  famille_numero: string | null
  compte_auxiliaire: string | null
  total_facture: number | string
  total_regle: number | string
  solde: number | string
  nb_factures: number
}

/** Résultat de la RPC `proposer_reports_solde`. */
export interface ResultatProposition {
  reports_crees: number
  total_debiteur: number
  total_crediteur: number
}

// ────────────────────────────────────────────────────────────────────────────
// Libellés
// ────────────────────────────────────────────────────────────────────────────

export const MODES_REPORT: ModeReport[] = ['etale', 'premiere_echeance', 'echeancier_separe', 'aucun']

/** Mode retenu quand ni la famille ni l'école n'en imposent un. */
export const MODE_REPORT_DEFAUT: ModeReport = 'etale'

const LABELS_MODE: Record<ModeReport, string> = {
  etale: 'Étalé sur toutes les échéances',
  premiere_echeance: 'Sur la première échéance',
  echeancier_separe: 'Échéancier séparé',
  aucun: 'Aucune reprise dans l\'échéancier',
}

const AIDES_MODE: Record<ModeReport, string> = {
  etale: 'Le reliquat est réparti à parts égales sur toutes les échéances de l\'année, la dernière absorbant l\'arrondi.',
  premiere_echeance: 'La totalité du reliquat est exigible à la première échéance de l\'année.',
  echeancier_separe: 'Le reliquat suit son propre échéancier, aux mêmes dates que celui de la scolarité.',
  aucun: 'Le reliquat reste dû mais n\'est repris dans aucune échéance : le recouvrement se fait hors échéancier.',
}

export function estModeReport(v: unknown): v is ModeReport {
  return typeof v === 'string' && (MODES_REPORT as string[]).includes(v)
}

export function labelModeReport(mode: string | null | undefined): string {
  return estModeReport(mode) ? LABELS_MODE[mode] : '—'
}

export function aideModeReport(mode: string | null | undefined): string {
  return estModeReport(mode) ? AIDES_MODE[mode] : ''
}

/**
 * Libellé métier d'un report, orienté lecteur (relevé 411, portail parent).
 * Ton factuel : on décrit un solde, on ne reproche rien.
 *   « Report de solde 2025-2026 »        (la famille doit)
 *   « Trop-perçu 2025-2026 reporté »     (l'école doit)
 */
export function libelleReport(report: {
  montant: number | string
  exercice_origine_code?: string | null
} | null | undefined): string {
  if (!report) return 'Report de solde antérieur'
  const montant = Number(report.montant) || 0
  const code = report.exercice_origine_code || null
  if (montant < 0) return code ? `Trop-perçu ${code} reporté` : 'Trop-perçu antérieur reporté'
  return code ? `Report de solde ${code}` : 'Report de solde antérieur'
}

/**
 * Un report doit-il être COMPTABILISÉ dans le relevé 411 de la famille, ou
 * seulement affiché pour information ? (chantier ssss2 pt3)
 *
 * Tout dépend de `source`, c'est-à-dire de la présence ou non des factures de
 * l'exercice d'origine dans TalmidApp :
 *   - 'calcule'  : le report a été DÉDUIT des factures de l'exercice d'origine,
 *     lesquelles sont en base et figurent déjà sur le relevé. La créance y est
 *     donc déjà représentée : compter le report en plus la doublerait.
 *   - 'saisi' / 'importe' : l'exercice d'origine n'a PAS été facturé dans
 *     TalmidApp (école pilote : zéro facture sur 2025-2026, facturation faite
 *     dans un autre outil), ou vient d'un autre logiciel. Aucune facture ne
 *     porte cette créance : le report EST le solde d'ouverture, et l'omettre
 *     ferait afficher une dette inférieure à la dette réelle.
 *
 * Une source inconnue est traitée comme 'calcule' — le prudent est de ne pas
 * risquer un double comptage, qui surévaluerait la dette.
 */
export function estReportComptable(report: { source?: SourceReport | string | null } | null | undefined): boolean {
  const s = String(report?.source || '')
  return s === 'saisi' || s === 'importe'
}

// ────────────────────────────────────────────────────────────────────────────
// Arithmétique monétaire
// ────────────────────────────────────────────────────────────────────────────
// Tous les calculs se font en CENTIMES ENTIERS. En flottant, `0.1 + 0.2 !== 0.3`
// et un échéancier de 10 lignes finit par ne plus faire le total exact. Même
// convention que l'export FEC (`api/compta/fec/route.ts`).

/** Convertit un montant en euros vers un entier de centimes. */
export function enCentimes(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) : 0
}

/** Convertit des centimes entiers vers un montant en euros à 2 décimales. */
export function enEuros(centimes: number): number {
  return Math.round(centimes) / 100
}

// ────────────────────────────────────────────────────────────────────────────
// Répartition du report sur l'échéancier — FONCTION PURE
// ────────────────────────────────────────────────────────────────────────────

/** Une échéance en entrée : seules la date et le montant comptent ici. */
export interface EcheanceEntree {
  date_echeance: string
  montant: number
}

/** Une échéance dédiée au report, à créer dans `cheques_prevus`. */
export interface EcheanceReport extends EcheanceEntree {
  /** Rang dans l'échéancier de report (1..n). */
  numero: number
}

export interface RepartitionReport {
  mode: ModeReport
  /**
   * Échéances de scolarité, INCHANGÉES. Conservé pour ne pas casser les
   * appelants : le report ne touche plus jamais aux échéances de l'année,
   * il vit dans ses propres lignes (cf. `echeancesReport`).
   */
  echeancesAjustees: EcheanceEntree[]
  /**
   * Échéances DÉDIÉES au report. Positives pour un solde débiteur, NÉGATIVES
   * pour un trop-perçu. Ce sont elles qui portent
   * `cheques_prevus.report_solde_id` et un libellé distinct.
   * Les lignes de montant nul sont omises.
   */
  echeancesReport: EcheanceReport[]
  /** Montant effectivement repris dans l'échéancier (signé, comme le report). */
  montantRepris: number
  /** Part du report non reprise. Non nulle uniquement en mode 'aucun' ou sans échéancier support. */
  reliquatNonRepris: number
}

/**
 * Répartit `total` centimes sur `n` échéances selon le mode.
 * Convention du projet (cf. `contrat-papier.ts`) : la DERNIÈRE échéance absorbe
 * l'arrondi, de sorte que la somme des parts vaille EXACTEMENT `total`.
 * On divise par `Math.floor` et non `Math.round` : avec `round`, un total de
 * 5 centimes sur 10 échéances donnerait 1 centime par ligne et -4 sur la
 * dernière. `floor` garantit une dernière part positive ou nulle.
 */
function repartirCentimes(total: number, mode: ModeReport, n: number): number[] {
  const parts = new Array<number>(n).fill(0)
  if (n <= 0 || total <= 0) return parts
  if (mode === 'premiere_echeance') {
    parts[0] = total
    return parts
  }
  // 'etale' et 'echeancier_separe' lissent de la même façon ; ils diffèrent par
  // la présentation (libellé / échéancier autonome), pas par les montants.
  const base = Math.floor(total / n)
  for (let i = 0; i < n; i++) parts[i] = base
  parts[n - 1] = total - base * (n - 1)
  return parts
}

/**
 * Calcule comment un report se répartit sur l'échéancier de l'exercice cible.
 *
 * FONCTION PURE : aucun accès réseau, aucune date « maintenant », aucun effet
 * de bord. C'est le seul endroit où se décide la ventilation, pour que l'écran
 * de clôture, le générateur d'échéancier et le portail parent affichent tous
 * les trois exactement les mêmes chiffres.
 *
 * LES DEUX SENS produisent des échéances DÉDIÉES, jamais fusionnées avec la
 * scolarité : positives pour un solde débiteur, NÉGATIVES pour un trop-perçu.
 *
 * La première version diminuait les échéances de scolarité dans le cas
 * créditeur. Trois défauts, tous relevés en revue :
 *   1. rien n'était tagué `report_solde_id`, donc `montant_echeance` valait 0
 *      et l'écran affichait « déjà repris 0,00 € » alors que la totalité
 *      avait été déduite — un chiffre faux présenté comme exact ;
 *   2. un trop-perçu supérieur au total des échéances perdait son reliquat ;
 *   3. la fonction SQL équivalente (`appliquer_report_echeancier`), qui sert
 *      le flux principal, produisait des lignes dédiées : appliquer les deux
 *      aurait crédité la famille DEUX FOIS.
 *
 * Une ligne négative est visible, traçable, et se solde d'elle-même.
 */
export function repartirReportSurEcheances(
  montant: number,
  mode: ModeReport | string | null | undefined,
  echeances: readonly EcheanceEntree[],
): RepartitionReport {
  const m: ModeReport = estModeReport(mode) ? mode : 'aucun'
  const base: EcheanceEntree[] = (echeances || []).map(e => ({
    date_echeance: e.date_echeance,
    montant: enEuros(enCentimes(e.montant)),
  }))
  const centimes = enCentimes(montant)

  // Rien à faire : mode 'aucun', report nul, ou aucun support d'échéance.
  if (m === 'aucun' || centimes === 0 || base.length === 0) {
    return {
      mode: m,
      echeancesAjustees: base,
      echeancesReport: [],
      montantRepris: 0,
      reliquatNonRepris: enEuros(centimes),
    }
  }

  // ── Débiteur ET créditeur : lignes DÉDIÉES, jamais fusionnées ───────────
  // Les échéances de scolarité ne sont plus touchées, dans aucun des deux sens.
  const signe = centimes > 0 ? 1 : -1
  const parts = repartirCentimes(Math.abs(centimes), m, base.length)
  const lignes: EcheanceReport[] = []
  for (let i = 0; i < base.length; i++) {
    if (parts[i] === 0) continue   // pas de ligne à 0 € dans un échéancier
    lignes.push({
      numero: lignes.length + 1,
      date_echeance: base[i].date_echeance,
      montant: enEuros(signe * parts[i]),
    })
  }

  return {
    mode: m,
    echeancesAjustees: base,
    echeancesReport: lignes,
    montantRepris: enEuros(centimes),
    reliquatNonRepris: 0,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Lectures
// ────────────────────────────────────────────────────────────────────────────

const COLONNES_ACTIF =
  'id, ecole_id, famille_id, exercice_cible_id, exercice_origine_id, exercice_origine_code, montant, mode, source, note, valide_le, montant_echeance'

/**
 * Report VALIDÉ d'une famille pour un exercice cible donné.
 *
 * Il peut théoriquement y en avoir plusieurs : la contrainte d'unicité porte
 * sur (famille, exercice_origine, exercice_cible), donc deux exercices
 * d'origine distincts peuvent viser la même cible. On rend donc la liste
 * complète ET le plus récent (`report`), qui est celui à afficher en priorité.
 * Ne masque jamais une erreur : `error` est renseigné et `report` reste null.
 */
export async function chargerReportActif(
  supabase: AnySupabase,
  familleId: string,
  exerciceCibleId: string,
): Promise<{ report: ReportSoldeActif | null; reports: ReportSoldeActif[]; error: string | null }> {
  if (!familleId || !exerciceCibleId) return { report: null, reports: [], error: null }
  const { data, error } = await supabase
    .from('reports_solde_actifs')
    .select(COLONNES_ACTIF)
    .eq('famille_id', familleId)
    .eq('exercice_cible_id', exerciceCibleId)
    .order('valide_le', { ascending: false })
    .order('id', { ascending: true })
  if (error) {
    console.error('[report-solde] chargerReportActif :', error.message)
    return { report: null, reports: [], error: error.message }
  }
  const reports = (data || []) as ReportSoldeActif[]
  return { report: reports[0] ?? null, reports, error: null }
}

/**
 * Tous les reports VALIDÉS d'une école pour un exercice cible.
 * Paginé : `reports_solde` suit le volume des familles et le plafond PostgREST
 * de 1000 lignes est silencieux. Tri déterministe (famille_id puis id unique).
 */
export async function chargerReportsActifs(
  supabase: AnySupabase,
  ecoleId: string,
  exerciceCibleId: string,
): Promise<ResultatChargement<ReportSoldeActif>> {
  if (!ecoleId || !exerciceCibleId) return { rows: [], error: null, tronque: false }
  return chargerParLots<ReportSoldeActif>((debut, fin) =>
    supabase
      .from('reports_solde_actifs')
      .select(COLONNES_ACTIF)
      .eq('ecole_id', ecoleId)
      .eq('exercice_cible_id', exerciceCibleId)
      .order('famille_id', { ascending: true })
      .order('id', { ascending: true })
      .range(debut, fin))
}

/**
 * Reports d'une école pour un couple (origine, cible), filtrés par statut.
 * Sert à l'écran de clôture : propositions à arbitrer, puis reports validés.
 * Paginé, filtre `ecole_id` explicite, tri déterministe.
 */
export async function chargerReports(
  supabase: AnySupabase,
  params: {
    ecoleId: string
    exerciceOrigineId: string
    exerciceCibleId: string
    statuts?: StatutReport[]
  },
): Promise<ResultatChargement<ReportSoldeAvecFamille>> {
  const { ecoleId, exerciceOrigineId, exerciceCibleId, statuts } = params
  if (!ecoleId || !exerciceOrigineId || !exerciceCibleId) {
    return { rows: [], error: null, tronque: false }
  }
  return chargerParLots<ReportSoldeAvecFamille>((debut, fin) => {
    let q = supabase
      .from('reports_solde')
      .select('*, familles(nom, numero, compte_auxiliaire)')
      .eq('ecole_id', ecoleId)
      .eq('exercice_origine_id', exerciceOrigineId)
      .eq('exercice_cible_id', exerciceCibleId)
    if (statuts && statuts.length > 0) q = q.in('statut', statuts)
    return q
      .order('famille_id', { ascending: true })
      .order('id', { ascending: true })
      .range(debut, fin)
  })
}

/** Nombre de reports encore au statut 'propose' pour un exercice d'origine. */
export async function compterReportsProposes(
  supabase: AnySupabase,
  ecoleId: string,
  exerciceOrigineId: string,
): Promise<{ nombre: number; error: string | null }> {
  const { count, error } = await supabase
    .from('reports_solde')
    .select('id', { count: 'exact', head: true })
    .eq('ecole_id', ecoleId)
    .eq('exercice_origine_id', exerciceOrigineId)
    .eq('statut', 'propose')
  if (error) return { nombre: 0, error: error.message }
  return { nombre: count ?? 0, error: null }
}

/** Mode de report par défaut de l'école (`ecoles.mode_report_solde`). */
export async function chargerModeReportEcole(
  supabase: AnySupabase,
  ecoleId: string,
): Promise<ModeReport> {
  const { data, error } = await supabase
    .from('ecoles')
    .select('mode_report_solde')
    .eq('id', ecoleId)
    .maybeSingle()
  if (error) {
    console.error('[report-solde] chargerModeReportEcole :', error.message)
    return MODE_REPORT_DEFAUT
  }
  return estModeReport(data?.mode_report_solde) ? data.mode_report_solde : MODE_REPORT_DEFAUT
}

/**
 * Soldes de clôture d'un exercice (RPC `calculer_soldes_cloture`).
 *
 * PAGINÉ : une RPC qui rend une TABLE passe par PostgREST et subit donc le même
 * plafond silencieux de 1000 lignes qu'une lecture de table. Sans `.range()`,
 * une école de plus de 1000 familles verrait ses soldes tronqués sans le
 * moindre message — et les totaux affichés seraient faux.
 */
export async function calculerSoldesCloture(
  supabase: AnySupabase,
  ecoleId: string,
  exerciceId: string,
): Promise<ResultatChargement<SoldeCloture>> {
  if (!ecoleId || !exerciceId) return { rows: [], error: null, tronque: false }
  return chargerParLots<SoldeCloture>((debut, fin) =>
    supabase
      .rpc('calculer_soldes_cloture', { p_ecole_id: ecoleId, p_exercice_id: exerciceId })
      .order('famille_id', { ascending: true })
      .range(debut, fin))
}

// ────────────────────────────────────────────────────────────────────────────
// Écritures
// ────────────────────────────────────────────────────────────────────────────
// ⚠️ Sur ce projet, une écriture refusée par la RLS NE LÈVE PAS d'exception :
// la réponse est un succès avec zéro ligne touchée. Chaque helper ci-dessous
// teste donc `error` ET le nombre de lignes rendues par `.select()`.

/** Identifiant de l'utilisateur connecté, pour tracer qui valide / annule. */
async function utilisateurCourant(supabase: AnySupabase): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Génère les propositions de report (RPC `proposer_reports_solde`).
 * Idempotente côté SQL : la relancer ne duplique rien.
 */
export async function proposerReportsSolde(
  supabase: AnySupabase,
  params: { ecoleId: string; exerciceOrigineId: string; exerciceCibleId: string; seuil?: number },
): Promise<{ ok: boolean; resultat?: ResultatProposition; error?: string }> {
  const { data, error } = await supabase.rpc('proposer_reports_solde', {
    p_ecole_id: params.ecoleId,
    p_exercice_origine_id: params.exerciceOrigineId,
    p_exercice_cible_id: params.exerciceCibleId,
    p_seuil: params.seuil ?? 1.0,
  })
  if (error) return { ok: false, error: error.message }
  const ligne = Array.isArray(data) ? data[0] : data
  return {
    ok: true,
    resultat: {
      reports_crees: Number(ligne?.reports_crees) || 0,
      total_debiteur: Number(ligne?.total_debiteur) || 0,
      total_crediteur: Number(ligne?.total_crediteur) || 0,
    },
  }
}

/**
 * Saisit directement un report VALIDÉ (RPC `saisir_report_solde`).
 * Cas d'usage : l'année précédente n'a pas été facturée dans TalmidApp (école
 * pilote : aucune facture 2025-2026 en base, la facturation s'est faite
 * ailleurs), ou migration depuis un autre logiciel. Le calcul automatique ne
 * trouve alors rien à reporter, d'où cette saisie manuelle.
 */
export async function saisirReportSolde(
  supabase: AnySupabase,
  params: {
    familleId: string
    exerciceOrigineId: string
    exerciceCibleId: string
    montant: number
    mode?: ModeReport | null
    note?: string | null
    source?: SourceReport
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('saisir_report_solde', {
    p_famille_id: params.familleId,
    p_exercice_origine_id: params.exerciceOrigineId,
    p_exercice_cible_id: params.exerciceCibleId,
    p_montant: params.montant,
    p_mode: params.mode ?? null,
    p_note: params.note ?? null,
    p_source: params.source ?? 'saisi',
  })
  if (error) return { ok: false, error: error.message }
  const id = typeof data === 'string' ? data : (Array.isArray(data) ? data[0] : null)
  if (!id) return { ok: false, error: 'La saisie n\'a rendu aucun identifiant (report non créé).' }
  return { ok: true, id }
}

/** Compte rendu de `appliquer_reports_exercice`. */
export interface ResultatApplicationReports {
  /** Reports matérialisés en échéances dédiées. */
  appliques: number
  /** Nombre total de lignes `cheques_prevus` créées. */
  echeances_creees: number
  /** Familles sans contrat (ou sans échéancier) sur l'exercice cible : ACTION EN ATTENTE, pas un échec. */
  sans_contrat: number
  /** Reports non applicables pour une autre raison (statut, mode 'aucun'…). */
  ignores: number
}

/**
 * Matérialise en échéances dédiées tous les reports VALIDÉS d'un exercice cible
 * (RPC `appliquer_reports_exercice`).
 *
 * IDEMPOTENTE côté SQL : rejouable sans créer de doublon. C'est ce qui permet
 * de proposer un bouton permanent — les contrats N+1 sont très souvent signés
 * APRÈS la clôture, et les familles qui n'en avaient pas encore ressortent en
 * `sans_contrat`. Il faut alors pouvoir relancer l'opération plus tard.
 */
export async function appliquerReportsExercice(
  supabase: AnySupabase,
  ecoleId: string,
  exerciceCibleId: string,
): Promise<{ ok: boolean; resultat?: ResultatApplicationReports; error?: string }> {
  if (!ecoleId || !exerciceCibleId) {
    return { ok: false, error: 'École et exercice cible requis.' }
  }
  const { data, error } = await supabase.rpc('appliquer_reports_exercice', {
    p_ecole_id: ecoleId,
    p_exercice_cible_id: exerciceCibleId,
  })
  if (error) return { ok: false, error: error.message }
  const ligne = Array.isArray(data) ? data[0] : data
  if (!ligne || typeof ligne !== 'object') {
    return { ok: false, error: 'La fonction n\'a rendu aucun compte rendu exploitable.' }
  }
  return {
    ok: true,
    resultat: {
      appliques: Number((ligne as any).appliques) || 0,
      echeances_creees: Number((ligne as any).echeances_creees) || 0,
      sans_contrat: Number((ligne as any).sans_contrat) || 0,
      ignores: Number((ligne as any).ignores) || 0,
    },
  }
}

/**
 * Matérialise UN report validé (RPC `appliquer_report_echeancier`).
 * Rend `{applique:false, motif}` quand rien n'a pu être fait — les motifs
 * connus sont 'report_non_valide', 'mode_aucun', 'contrat_cible_absent',
 * 'echeancier_cible_vide'. Idempotente elle aussi.
 */
export async function appliquerReportEcheancier(
  supabase: AnySupabase,
  reportId: string,
): Promise<{ ok: boolean; applique: boolean; motif?: string; echeances?: number; montant?: number; error?: string }> {
  if (!reportId) return { ok: false, applique: false, error: 'Identifiant de report requis.' }
  const { data, error } = await supabase.rpc('appliquer_report_echeancier', { p_report_id: reportId })
  if (error) return { ok: false, applique: false, error: error.message }
  const ligne: any = Array.isArray(data) ? data[0] : data
  if (!ligne || typeof ligne !== 'object') {
    return { ok: false, applique: false, error: 'La fonction n\'a rendu aucun compte rendu exploitable.' }
  }
  return {
    ok: true,
    applique: Boolean(ligne.applique),
    motif: ligne.motif ? String(ligne.motif) : undefined,
    echeances: Number(ligne.echeances) || 0,
    montant: Number(ligne.montant) || 0,
  }
}

/** Change le mode de reprise d'un report (arbitrage famille par famille). */
export async function changerModeReport(
  supabase: AnySupabase,
  reportId: string,
  mode: ModeReport,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('reports_solde')
    .update({ mode })
    .eq('id', reportId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Mode non enregistré : aucune ligne modifiée (droits insuffisants ?).' }
  }
  return { ok: true }
}

/**
 * Valide des reports ('propose' -> 'valide').
 * Ne valide QUE les lignes encore au statut 'propose' : relancer l'opération
 * n'écrase pas la date de validation d'un report déjà validé.
 */
export async function validerReports(
  supabase: AnySupabase,
  reportIds: string[],
): Promise<{ ok: boolean; valides: number; error?: string }> {
  if (reportIds.length === 0) return { ok: true, valides: 0 }
  const par = await utilisateurCourant(supabase)
  const { data, error } = await supabase
    .from('reports_solde')
    .update({ statut: 'valide', valide_le: new Date().toISOString(), valide_par: par })
    .in('id', reportIds)
    .eq('statut', 'propose')
    .select('id')
  if (error) return { ok: false, valides: 0, error: error.message }
  const valides = data?.length ?? 0
  if (valides === 0) {
    return { ok: false, valides: 0, error: 'Aucun report validé : ils étaient déjà traités, ou l\'écriture a été refusée.' }
  }
  return { ok: true, valides }
}

/** Écarte un report ('propose'|'valide' -> 'annule'), avec motif obligatoire. */
export async function annulerReport(
  supabase: AnySupabase,
  reportId: string,
  motif: string,
): Promise<{ ok: boolean; error?: string }> {
  const m = (motif || '').trim()
  if (!m) return { ok: false, error: 'Un motif est requis pour écarter un report.' }
  const par = await utilisateurCourant(supabase)
  const { data, error } = await supabase
    .from('reports_solde')
    .update({
      statut: 'annule',
      annule_le: new Date().toISOString(),
      annule_par: par,
      motif_annulation: m,
    })
    .eq('id', reportId)
    .neq('statut', 'annule')
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Report non écarté : déjà annulé, ou écriture refusée.' }
  }
  return { ok: true }
}
