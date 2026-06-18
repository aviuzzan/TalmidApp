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

export interface DuADateResult {
  totalFacture: number       // montant_total de la facture
  totalRegle: number         // Sigma reglements imputes sur cette facture
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
  // 1. Facture
  const { data: facture } = await supabase
    .from('factures')
    .select('id, famille_id, annee_scolaire, montant_total, statut')
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
  let echeances: { montant: string | number; date_echeance: string; statut: string }[] = []
  if (contrat?.id) {
    const { data } = await supabase
      .from('cheques_prevus')
      .select('montant, date_echeance, statut')
      .eq('contrat_id', contrat.id)
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
  const totalFacture = Number(facture.montant_total) || 0
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

/**
 * Version batch pour les pages qui listent N factures.
 * Fait 3 grosses requetes (factures, cheques_prevus, reglements) plutot que N x 3.
 */
export async function calcDuADateBatch(
  supabase: SupabaseClient,
  factureIds: string[],
): Promise<Record<string, DuADateResult>> {
  if (factureIds.length === 0) return {}
  const today = new Date().toISOString().split('T')[0]

  const [{ data: factures }, { data: reglements }] = await Promise.all([
    supabase
      .from('factures')
      .select('id, famille_id, annee_scolaire, montant_total, statut')
      .in('id', factureIds),
    supabase
      .from('reglements')
      .select('facture_id, montant')
      .in('facture_id', factureIds),
  ])

  if (!factures || factures.length === 0) return {}

  // Contrats valides pour les (famille_id + annee_scolaire) concernes.
  const familleIds = Array.from(new Set(factures.map(f => f.famille_id)))
  const annees = Array.from(new Set(factures.map(f => f.annee_scolaire)))
  const { data: contrats } = await supabase
    .from('contrats_scolarisation')
    .select('id, famille_id, annee_scolaire')
    .in('famille_id', familleIds)
    .in('annee_scolaire', annees)
    .eq('statut', 'valide')

  const contratParCle: Record<string, string> = {}
  for (const c of contrats || []) {
    contratParCle[`${c.famille_id}_${c.annee_scolaire}`] = c.id
  }

  const contratIds = Object.values(contratParCle)
  const { data: echeances } = contratIds.length > 0
    ? await supabase
        .from('cheques_prevus')
        .select('contrat_id, montant, date_echeance, statut')
        .in('contrat_id', contratIds)
        .neq('statut', 'annule')
        .order('date_echeance', { ascending: true })
    : { data: [] as any[] }

  const echeancesParContrat: Record<string, typeof echeances> = {}
  for (const e of (echeances || [])) {
    if (!echeancesParContrat[e.contrat_id]) echeancesParContrat[e.contrat_id] = []
    echeancesParContrat[e.contrat_id]!.push(e)
  }

  const regleParFacture: Record<string, number> = {}
  for (const r of reglements || []) {
    regleParFacture[r.facture_id] = (regleParFacture[r.facture_id] || 0) + Number(r.montant)
  }

  const result: Record<string, DuADateResult> = {}
  for (const f of factures) {
    const cle = `${f.famille_id}_${f.annee_scolaire}`
    const contratId = contratParCle[cle]
    const ech = (contratId && echeancesParContrat[contratId]) ? echeancesParContrat[contratId]! : []
    const echEchues = ech.filter(e => e.date_echeance <= today)
    const totalFacture = Number(f.montant_total) || 0
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
