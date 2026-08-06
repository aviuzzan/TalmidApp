// lib/encaissement.ts
//
// SOURCE DE VÉRITÉ UNIQUE de l'encaissement d'une échéance (audit Finances P1,
// volet « sur-encaissement », 06/08/2026).
//
// AVANT ce fichier, trois écrans encaissaient des échéances (cheques_prevus)
// avec trois comportements différents :
//   - Inscriptions > Échéances : créait un règlement (idempotent) PUIS marquait
//     l'échéance encaissée — le seul circuit complet.
//   - Fiche famille > Chèques & échéancier (« Encaisser », « Tout encaisser ») :
//     flippait juste le statut, AUCUN règlement créé.
//   - Bordereau de remise (« Marquer déposé(s) ») : idem, statut seulement.
// Conséquence : de l'argent réellement encaissé (chèque déposé en banque) restait
// invisible de la facture → solde surestimé → relances et nouveaux encaissements
// auprès de familles qui avaient DÉJÀ payé. C'est le mécanisme n°1 du
// sur-encaissement relevé par l'audit.
//
// Mécanisme n°2 : aucun de ces écrans ne comparait l'échéancier aux règlements
// déjà saisis. Exemple réel (école démo) : facture 7 650 €, 500 € déjà réglés
// par CB, et 7 650 € d'échéances encore actives → tout encaisser = 8 150 €
// perçus pour 7 650 € dus. D'où `soldesParFamille` + `calculerDepassement`,
// utilisés par les écrans pour AFFICHER et CONFIRMER avant d'encaisser.
//
// Règles reprises du circuit historique (inscriptions/page.tsx) :
//   - Résolution de facture : facture_id de l'échéance en priorité, sinon
//     (famille, année scolaire du contrat), la plus récente si plusieurs.
//   - Idempotence : référence déterministe par échéance — numero_cheque si
//     présent, sinon `ECH-<8 premiers chars de l'id>` — vérifiée avant l'INSERT
//     pour qu'un double clic / rejeu ne crée jamais deux règlements.
//   - Rollback logique : si l'INSERT du règlement échoue, le statut de
//     l'échéance n'est PAS modifié.
//   - Le recalcul du statut de la facture est porté par le trigger BDD
//     trg_reglements_statut (recalc_statut_facture) — pas de recalcul ici.

import type { SupabaseClient } from '@supabase/supabase-js'

export type EcheanceEncaissable = {
  id: string
  famille_id: string | null
  contrat_id?: string | null
  facture_id?: string | null
  numero_cheque?: string | number | null
  montant: number | string
  mode_paiement?: string | null
  note?: string | null
  contrats_scolarisation?: { annee_scolaire?: string | null } | null
}

export type ResultatEncaissement = {
  ok: boolean
  /** un règlement a été créé par cet appel */
  reglementCree: boolean
  /** un règlement portant la même référence existait déjà (rejeu / double clic) */
  dejaExistant: boolean
  /** aucune facture résoluble : le statut a été mis à jour mais AUCUN règlement créé */
  sansFacture: boolean
  /** montant qui excède le reste dû de la facture au moment de l'encaissement (0 si rien) */
  depassement: number
  erreur?: string
}

export type SoldeFamille = {
  totalFacture: number
  totalRegle: number // règlements + avoirs imputés
  soldeRestant: number
  nbFactures: number
}

/** Référence déterministe d'un règlement issu d'une échéance (clé d'idempotence). */
export function referenceEcheance(ech: Pick<EcheanceEncaissable, 'id' | 'numero_cheque'>): string {
  const num = ech.numero_cheque == null ? '' : String(ech.numero_cheque).trim()
  return num || `ECH-${ech.id.slice(0, 8)}`
}

/**
 * Soldes agrégés par famille via la vue `factures_solde` (factures annulées exclues).
 * Batch par lots de 100 familles pour rester sous les limites PostgREST.
 */
export async function soldesParFamille(
  s: SupabaseClient,
  familleIds: string[],
): Promise<{ soldes: Map<string, SoldeFamille>; erreur?: string }> {
  const soldes = new Map<string, SoldeFamille>()
  const ids = Array.from(new Set(familleIds.filter(Boolean)))
  let erreur: string | undefined
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100)
    const { data, error } = await s
      .from('factures_solde')
      .select('famille_id, total_facture, total_regle, total_avoirs_imputes, solde_restant, statut')
      .in('famille_id', lot)
      .neq('statut', 'annule')
    if (error) { erreur = error.message; continue }
    for (const f of data ?? []) {
      const cur = soldes.get(f.famille_id) ?? { totalFacture: 0, totalRegle: 0, soldeRestant: 0, nbFactures: 0 }
      cur.totalFacture += Number(f.total_facture) || 0
      cur.totalRegle += (Number(f.total_regle) || 0) + (Number(f.total_avoirs_imputes) || 0)
      cur.soldeRestant += Number(f.solde_restant) || 0
      cur.nbFactures += 1
      soldes.set(f.famille_id, cur)
    }
  }
  return { soldes, erreur }
}

/**
 * Dépassement de sur-encaissement pour un jeu d'échéances, famille par famille :
 * ce que l'encaissement du jeu ferait percevoir AU-DELÀ du reste dû.
 * Sert aux confirmations (« Attention : X € au-delà du dû pour N famille(s) »).
 */
export function calculerDepassement(
  echeances: Pick<EcheanceEncaissable, 'famille_id' | 'montant'>[],
  soldes: Map<string, SoldeFamille>,
): { total: number; familles: { familleId: string; depassement: number }[] } {
  const parFamille = new Map<string, number>()
  for (const e of echeances) {
    if (!e.famille_id) continue
    parFamille.set(e.famille_id, (parFamille.get(e.famille_id) ?? 0) + (Number(e.montant) || 0))
  }
  const familles: { familleId: string; depassement: number }[] = []
  let total = 0
  for (const [familleId, somme] of Array.from(parFamille.entries())) {
    const solde = soldes.get(familleId)
    // Famille sans facture connue : pas de base de comparaison, on ne signale rien ici
    // (le résultat d'encaissement remontera `sansFacture`).
    if (!solde) continue
    const dep = Math.round((somme - Math.max(0, solde.soldeRestant)) * 100) / 100
    if (dep > 0.009) { familles.push({ familleId, depassement: dep }); total += dep }
  }
  return { total: Math.round(total * 100) / 100, familles }
}

/**
 * Encaisse UNE échéance : crée le règlement (idempotent) puis marque l'échéance
 * encaissée. `anneeFallback` sert à résoudre la facture via le contrat quand
 * l'échéance ne porte pas de facture_id.
 */
export async function encaisserEcheance(
  s: SupabaseClient,
  ech: EcheanceEncaissable,
  opts?: { anneeFallback?: string; noteOrigine?: string; exigerFacture?: boolean },
): Promise<ResultatEncaissement> {
  const res: ResultatEncaissement = { ok: false, reglementCree: false, dejaExistant: false, sansFacture: false, depassement: 0 }
  const today = new Date().toISOString().split('T')[0]
  const montant = Number(ech.montant) || 0

  // 1) Résoudre la facture cible.
  let factureId: string | null = ech.facture_id || null
  if (!factureId && ech.contrat_id && ech.famille_id) {
    const annee = ech.contrats_scolarisation?.annee_scolaire || opts?.anneeFallback
    let q = s
      .from('factures')
      .select('id, annee_scolaire, date_emission')
      .eq('famille_id', ech.famille_id)
      .neq('statut', 'annule')
      .order('date_emission', { ascending: false })
      .limit(5)
    if (annee) q = q.eq('annee_scolaire', annee)
    const { data: factures, error: errFact } = await q
    if (errFact) { res.erreur = 'Recherche facture : ' + errFact.message; return res }
    factureId = factures?.[0]?.id ?? null
  }

  // 2) Sans facture : on ne crée PAS de règlement sur une facture devinée
  //    (risque d'imputation comptable fausse) — statut seulement, signalé à l'appelant.
  if (!factureId) {
    if (opts?.exigerFacture) {
      res.erreur = 'Aucune facture rattachée à cette échéance'
      return res
    }
    const { error } = await s.from('cheques_prevus').update({ statut: 'encaisse', encaisse_le: today }).eq('id', ech.id)
    if (error) { res.erreur = 'MAJ échéance : ' + error.message; return res }
    res.ok = true
    res.sansFacture = true
    return res
  }

  const reference = referenceEcheance(ech)
  const mode = ech.mode_paiement || 'cheque'

  // 3) Idempotence : règlement déjà présent pour (facture, mode, référence) ?
  const { data: dejaLa, error: errDeja } = await s
    .from('reglements')
    .select('id')
    .eq('facture_id', factureId)
    .eq('mode_paiement', mode)
    .eq('reference', reference)
    .maybeSingle()
  if (errDeja) { res.erreur = 'Vérification doublon : ' + errDeja.message; return res }

  // 4) Dépassement mesuré sur le reste dû de la facture AVANT insertion (information,
  //    pas blocage : la confirmation a eu lieu côté écran, et un chèque en main
  //    doit rester encaissable — le trop-perçu se traite ensuite en avoir).
  const { data: solde } = await s
    .from('factures_solde')
    .select('solde_restant')
    .eq('id', factureId)
    .maybeSingle()
  if (solde && !dejaLa) {
    const dep = Math.round((montant - Math.max(0, Number(solde.solde_restant) || 0)) * 100) / 100
    if (dep > 0.009) res.depassement = dep
  }

  // 5) Créer le règlement si pas de doublon.
  if (!dejaLa) {
    const { error: errIns } = await s.from('reglements').insert({
      facture_id: factureId,
      famille_id: ech.famille_id,
      montant,
      date_reglement: today,
      mode_paiement: mode,
      reference,
      notes: opts?.noteOrigine || (ech.contrat_id ? `Encaissement échéance contrat #${ech.contrat_id}` : 'Encaissement échéance'),
    })
    if (errIns) {
      // Rollback logique : on ne touche pas au statut de l'échéance.
      res.erreur = 'Création règlement : ' + errIns.message
      return res
    }
    res.reglementCree = true
  } else {
    res.dejaExistant = true
  }

  // 6) Marquer l'échéance encaissée.
  const { error: errEch } = await s
    .from('cheques_prevus')
    .update({ statut: 'encaisse', encaisse_le: today })
    .eq('id', ech.id)
  if (errEch) { res.erreur = 'Règlement enregistré mais MAJ échéance échouée : ' + errEch.message; return res }

  res.ok = true
  return res
}

/** Formatte le bilan d'un lot d'encaissements pour un toast / alert. */
export function bilanEncaissements(resultats: ResultatEncaissement[]): string {
  const ok = resultats.filter(r => r.ok)
  const crees = ok.filter(r => r.reglementCree).length
  const doublons = ok.filter(r => r.dejaExistant).length
  const sansFact = ok.filter(r => r.sansFacture).length
  const echecs = resultats.length - ok.length
  const parts = [`${ok.length}/${resultats.length} échéance(s) encaissée(s)`, `${crees} règlement(s) créé(s)`]
  if (doublons) parts.push(`${doublons} déjà enregistré(s)`)
  if (sansFact) parts.push(`${sansFact} sans facture liée (AUCUN règlement créé — à saisir à la main)`)
  if (echecs) parts.push(`${echecs} échec(s)`)
  return parts.join(' · ')
}
