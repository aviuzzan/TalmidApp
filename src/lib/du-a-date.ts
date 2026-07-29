/**
 * Calcul du "du a date" pour une facture annuelle payee par echeancier.
 *
 * Principe metier :
 *  - Une facture annuelle (scolarite) est payee sur 1 a 12 echeances (cheques_prevus)
 *    selon le choix de la famille au contrat.
 *  - "Solde annuel"  = total facture - total regle. Reflete le restant a payer sur l annee.
 *  - "Du a date"     = Sigma echeances echues (date_echeance <= aujourd hui) - total regle (clamp 0).
 *    Reflete uniquement les echeances depassees non couvertes par un reglement.
 *  - Une famille est consideree "en retard" UNIQUEMENT si du_a_date > 0.
 *    Tant qu'aucune echeance n est echue, soldeAnnuel peut etre > 0 sans alarme.
 *
 * Source des donnees :
 *  - cheques_prevus  : echeances generees a la validation du contrat (tous modes).
 *  - reglements      : paiements imputes sur la facture.
 *  - contrats_scolarisation : pour lier facture -> contrat -> echeances
 *    (cheques_prevus.contrat_id reference le contrat, pas la facture).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { chargerParTranchesEtLots, type ResultatChargement } from '@/lib/pagination'

export interface DuADateResult {
  totalFacture: number       // montant_total de la facture
  // ATTENTION : ce `totalRegle` inclut TOUS les reglements (paiements + avoirs imputes).
  // C'est volontaire : on calcule ici un "du a date" qui doit etre reduit par
  // chaque euro qui a deja entame le solde de la facture, peu importe la nature.
  // Diffère donc de `factures_solde.total_regle` qui exclut les avoirs depuis la refonte.
  totalRegle: number         // Sigma reglements imputes sur cette facture (paiements + avoirs)
  soldeAnnuel: number        // max(0, totalFacture - totalRegle)
  totalEcheances: number     // Sigma echeances generees (toutes, echues ou non)
  totalEcheancesEchues: number  // Sigma echeances dont date_echeance <= aujourd hui
  duAdate: number            // max(0, totalEcheancesEchues - totalRegle)
  enRetard: boolean          // duAdate > 0
  nbEcheances: number        // nb total d echeances
  nbEcheancesEchues: number  // nb d echeances echues
  prochaineEcheance: { date: string; montant: number } | null
  echeancierExiste: boolean  // false si aucune echeance n a ete generee (cas a basculer en "tout du")
}

/**
 * Calcule le du a date pour une facture.
 * Si aucun echeancier n existe (echeancierExiste = false), on retombe sur le solde annuel
 * comme "du a date" (comportement actuel) pour eviter de masquer un vrai impaye.
 */
export async function calcDuADate(
  supabase: SupabaseClient,
  factureId: string,
): Promise<DuADateResult | null> {
  // 1. Facture — via la vue factures_solde qui expose total_facture (somme des lignes).
  // FIX audit 24/07/2026 : on lisait factures.montant_total, colonne qui N'EXISTE PAS
  // sur la table factures -> totalFacture etait toujours 0 (impaye masque dans le
  // fallback "pas d'echeancier").
  const { data: facture } = await supabase
    .from('factures_solde')
    .select('id, famille_id, annee_scolaire, total_facture, statut')
    .eq('id', factureId)
    .maybeSingle()
  if (!facture) return null

  // 2. Contrat valide pour cette famille + annee (pour relier aux echeances)
  const { data: contrat } = await supabase
    .from('contrats_scolarisation')
    .select('id')
    .eq('famille_id', facture.famille_id)
    .eq('annee_scolaire', facture.annee_scolaire)
    .eq('statut', 'valide')
    .maybeSingle()

  // 3. Echeances (cheques_prevus) lies au contrat. Exclure les annulees.
  //
  // ssss2 — EXCLUSION DES ECHEANCES DE REPORT (.is('report_solde_id', null)).
  // Depuis le report de solde, un contrat peut porter deux natures d'echeances :
  // celles de la scolarite de l'annee, et celles qui reprennent le reliquat
  // impaye de l'annee PRECEDENTE (report_solde_id renseigne).
  // Les compter ici serait un double comptage : le montant reporte est deja
  // porte par la facture impayee de l'exercice d'origine, qui a son propre
  // calcul de du. La famille apparaitrait en retard DEUX fois, et comme ce
  // helper alimente le cron de relances automatiques, une mise en demeure
  // partirait a des familles a jour. Le report se suit a part, via
  // reports_solde_actifs.
  let echeances: { montant: string | number; date_echeance: string; statut: string }[] = []
  if (contrat?.id) {
    const { data } = await supabase
      .from('cheques_prevus')
      .select('montant, date_echeance, statut')
      .eq('contrat_id', contrat.id)
      .is('report_solde_id', null)
      .neq('statut', 'annule')
      .order('date_echeance', { ascending: true })
    echeances = data || []
  }

  // 4. Reglements imputes sur cette facture
  const { data: reglements } = await supabase
    .from('reglements')
    .select('montant')
    .eq('facture_id', factureId)

  // 5. Calculs
  const today = new Date().toISOString().split('T')[0]
  const totalFacture = Number((facture as any).total_facture) || 0
  const totalRegle = (reglements || []).reduce((s, r) => s + Number(r.montant), 0)
  const echeancesEchues = echeances.filter(e => e.date_echeance <= today)
  const totalEcheances = echeances.reduce((s, e) => s + Number(e.montant), 0)
  const totalEcheancesEchues = echeancesEchues.reduce((s, e) => s + Number(e.montant), 0)
  const echeancierExiste = echeances.length > 0

  // Si pas d echeancier on retombe sur "tout est du" (comportement actuel, pas de regression).
  const duAdate = echeancierExiste
    ? Math.max(0, totalEcheancesEchues - totalRegle)
    : Math.max(0, totalFacture - totalRegle)

  const soldeAnnuel = Math.max(0, totalFacture - totalRegle)
  const prochaine = echeances.find(e => e.date_echeance > today)

  return {
    totalFacture,
    totalRegle,
    soldeAnnuel,
    totalEcheances,
    totalEcheancesEchues,
    duAdate,
    enRetard: duAdate > 0,
    nbEcheances: echeances.length,
    nbEcheancesEchues: echeancesEchues.length,
    prochaineEcheance: prochaine
      ? { date: prochaine.date_echeance, montant: Number(prochaine.montant) }
      : null,
    echeancierExiste,
  }
}

/** Lignes minimales lues par la version batch (typage local : le client Supabase
 *  n'est pas genere avec les types de la base, `select()` rend du `any`). */
type LigneFactureSolde = {
  id: string
  famille_id: string
  annee_scolaire: string
  total_facture: number | string | null
  statut: string | null
}
type LigneReglement = { facture_id: string; montant: number | string | null }
type LigneContrat = { id: string; famille_id: string; annee_scolaire: string }
type LigneEcheance = {
  id: string
  contrat_id: string
  montant: number | string | null
  date_echeance: string
  statut: string | null
}

/**
 * Les erreurs de lecture etaient deja avalees ici avant le fix pagination
 * (destructuration `{ data }` sans `error`). On TRACE systematiquement : un jeu
 * partiel fausse le "du a date", donc les relances.
 * Renvoie `true` si la lecture est inexploitable (erreur Supabase ou troncature
 * au garde-fou de pagination), pour permettre aux appels critiques de s'arreter
 * plutot que de calculer sur des donnees incompletes.
 */
function tracerAnomalie(table: string, res: ResultatChargement<unknown>): boolean {
  if (res.error) {
    console.error(`[du-a-date] lecture ${table} en echec (donnees partielles) : ${res.error}`)
  }
  if (res.tronque) {
    console.error(`[du-a-date] lecture ${table} : garde-fou de pagination atteint, jeu incomplet`)
  }
  return !!res.error || res.tronque
}

/**
 * Version batch pour les pages qui listent N factures.
 * Fait 4 familles de requetes (factures, reglements, contrats, cheques_prevus)
 * plutot que N x 3.
 *
 * FIX pagination 29/07/2026 — POURQUOI c'est critique ici :
 * PostgREST plafonne chaque requete a 1000 lignes SANS erreur. Sur N factures :
 *  - `reglements` n'avait AUCUN tri ni pagination : au-dela de 1000 reglements,
 *    les factures absentes du lot recevaient `totalRegle = 0` -> des familles a
 *    jour etaient declarees en retard (et relancees par email par le cron).
 *  - `cheques_prevus` etait trie `date_echeance ASC` sans pagination : seules
 *    les echeances les plus anciennes revenaient, les echeances de printemps
 *    disparaissaient pour TOUT LE MONDE -> de vrais retards masques.
 * Les 4 lectures passent donc par `chargerParLots` avec un tri DETERMINISTE
 * (colonne metier + `id` en departage : sans cle unique en fin de tri, deux
 * lots peuvent se recouvrir ou sauter des lignes).
 * Les listes d'identifiants sont en plus decoupees en tranches de 200 : un
 * `.in(...)` avec des milliers d'UUID sature l'URL de la requete PostgREST.
 * Aucune regle metier n'est modifiee : seules les lectures sont completees.
 *
 * FAIL CLOSED 29/07/2026 : si la lecture des `reglements` ou des `cheques_prevus`
 * est inexploitable (erreur Supabase ou troncature au garde-fou de pagination),
 * la fonction renvoie `{}` — un resultat vide, jamais un calcul faux. Les
 * appelants traitent deja l'absence d'entree comme « pas de retard » (ecrans :
 * compteurs a 0 / « a jour » ; cron de relances : facture ignoree), ce qui est
 * exactement le comportement voulu : mieux vaut ne relancer personne que
 * relancer une famille a jour. L'anomalie reste tracee en `console.error`.
 */
export async function calcDuADateBatch(
  supabase: SupabaseClient,
  factureIds: string[],
): Promise<Record<string, DuADateResult>> {
  if (factureIds.length === 0) return {}
  const today = new Date().toISOString().split('T')[0]

  // FIX audit 24/07/2026 : lecture via factures_solde (total_facture = somme des
  // lignes) au lieu de factures.montant_total qui n'existe pas en BDD.
  const [resFactures, resReglements] = await Promise.all([
    chargerParTranchesEtLots<LigneFactureSolde>(factureIds, (tranche, debut, fin) =>
      supabase
        .from('factures_solde')
        .select('id, famille_id, annee_scolaire, total_facture, statut')
        .in('id', tranche)
        .order('id', { ascending: true })
        .range(debut, fin)),
    // Tri (facture_id, id) : `id` est la cle unique de departage, indispensable
    // pour que deux lots consecutifs ne se recouvrent pas.
    chargerParTranchesEtLots<LigneReglement>(factureIds, (tranche, debut, fin) =>
      supabase
        .from('reglements')
        .select('facture_id, montant')
        .in('facture_id', tranche)
        .order('facture_id', { ascending: true })
        .order('id', { ascending: true })
        .range(debut, fin)),
  ])
  tracerAnomalie('factures_solde', resFactures)
  // FAIL CLOSED (audit 29/07/2026) : `reglements` manquants => `totalRegle` sous-evalue
  // => `duAdate` surevalue => des familles A JOUR sont declarees en retard et
  // relancees par email (api/cron/relances-auto). Mieux vaut ne relancer personne
  // que relancer a tort : on renvoie un resultat vide plutot qu'un calcul faux.
  if (tracerAnomalie('reglements', resReglements)) {
    console.error('[du-a-date] calcul batch abandonne : lecture reglements inexploitable')
    return {}
  }

  const factures = resFactures.rows
  const reglements = resReglements.rows
  if (factures.length === 0) return {}

  // Contrats valides pour les (famille_id + annee_scolaire) concernes.
  const familleIds = Array.from(new Set(factures.map(f => f.famille_id)))
  const annees = Array.from(new Set(factures.map(f => f.annee_scolaire)))
  const resContrats = await chargerParTranchesEtLots<LigneContrat>(familleIds, (tranche, debut, fin) =>
    supabase
      .from('contrats_scolarisation')
      .select('id, famille_id, annee_scolaire')
      .in('famille_id', tranche)
      .in('annee_scolaire', annees)
      .eq('statut', 'valide')
      .order('famille_id', { ascending: true })
      .order('id', { ascending: true })
      .range(debut, fin))
  tracerAnomalie('contrats_scolarisation', resContrats)

  const contratParCle: Record<string, string> = {}
  for (const c of resContrats.rows) {
    contratParCle[`${c.famille_id}_${c.annee_scolaire}`] = c.id
  }

  const contratIds = Object.values(contratParCle)
  // Tri (date_echeance, id) : `date_echeance` en premier critere car le calcul
  // en aval s'appuie sur l'ordre chronologique (`prochaineEcheance`), `id` en
  // departage des ex aequo pour rendre la pagination sure.
  const resEcheances = await chargerParTranchesEtLots<LigneEcheance>(contratIds, (tranche, debut, fin) =>
    supabase
      .from('cheques_prevus')
      .select('id, contrat_id, montant, date_echeance, statut')
      .in('contrat_id', tranche)
      // ssss2 : voir le commentaire detaille dans calcDuADate. Les echeances
      // qui reprennent un solde reporte de l'annee precedente ne doivent pas
      // entrer dans le du de l'annee en cours — le montant est deja porte par
      // la facture impayee de l'exercice d'origine. Sans ce filtre, ce batch
      // (qui alimente le cron de relances) declencherait des mises en demeure
      // sur des familles a jour.
      .is('report_solde_id', null)
      .neq('statut', 'annule')
      .order('date_echeance', { ascending: true })
      .order('id', { ascending: true })
      .range(debut, fin))
  // FAIL CLOSED (audit 29/07/2026) : un echeancier partiel est encore plus
  // dangereux — les echeances manquantes font tomber `echeancierExiste` a false,
  // ce qui bascule sur le fallback « tout est du » et declenche des relances sur
  // des familles parfaitement a jour.
  if (tracerAnomalie('cheques_prevus', resEcheances)) {
    console.error('[du-a-date] calcul batch abandonne : lecture cheques_prevus inexploitable')
    return {}
  }

  const echeancesParContrat: Record<string, LigneEcheance[]> = {}
  for (const e of resEcheances.rows) {
    if (!echeancesParContrat[e.contrat_id]) echeancesParContrat[e.contrat_id] = []
    echeancesParContrat[e.contrat_id]!.push(e)
  }
  // Les lots/tranches sont concatenes dans l'ordre de lecture : on retrie
  // explicitement chaque echeancier pour garantir l'ordre chronologique dont
  // depend `prochaineEcheance` (comportement identique a l'ancien ORDER BY).
  for (const cle of Object.keys(echeancesParContrat)) {
    echeancesParContrat[cle]!.sort((a, b) =>
      a.date_echeance < b.date_echeance ? -1
        : a.date_echeance > b.date_echeance ? 1
          : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }

  const regleParFacture: Record<string, number> = {}
  for (const r of reglements) {
    regleParFacture[r.facture_id] = (regleParFacture[r.facture_id] || 0) + Number(r.montant)
  }

  const result: Record<string, DuADateResult> = {}
  for (const f of factures) {
    const cle = `${f.famille_id}_${f.annee_scolaire}`
    const contratId = contratParCle[cle]
    const ech = (contratId && echeancesParContrat[contratId]) ? echeancesParContrat[contratId]! : []
    const echEchues = ech.filter(e => e.date_echeance <= today)
    const totalFacture = Number((f as any).total_facture) || 0
    const totalRegle = regleParFacture[f.id] || 0
    const totalEcheances = ech.reduce((s, e) => s + Number(e.montant), 0)
    const totalEcheancesEchues = echEchues.reduce((s, e) => s + Number(e.montant), 0)
    const echeancierExiste = ech.length > 0
    const duAdate = echeancierExiste
      ? Math.max(0, totalEcheancesEchues - totalRegle)
      : Math.max(0, totalFacture - totalRegle)
    const prochaine = ech.find(e => e.date_echeance > today)
    result[f.id] = {
      totalFacture,
      totalRegle,
      soldeAnnuel: Math.max(0, totalFacture - totalRegle),
      totalEcheances,
      totalEcheancesEchues,
      duAdate,
      enRetard: duAdate > 0,
      nbEcheances: ech.length,
      nbEcheancesEchues: echEchues.length,
      prochaineEcheance: prochaine
        ? { date: prochaine.date_echeance, montant: Number(prochaine.montant) }
        : null,
      echeancierExiste,
    }
  }

  return result
}

/** Format court : "511 € (2 echeances)" ou "A jour" */
export function formatDuADate(r: DuADateResult): string {
  if (r.duAdate <= 0) return 'A jour'
  return `${r.duAdate.toLocaleString('fr-FR')} € (${r.nbEcheancesEchues} echeance${r.nbEcheancesEchues > 1 ? 's' : ''})`
}
