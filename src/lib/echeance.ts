/**
 * Helper partagé de génération de dates d'échéance (mmmm2, 28/07/2026).
 *
 * Problème d'origine (audit portail 19/06) : un jour d'encaissement à 29/30/31
 * produisait des dates invalides du type "2027-02-31" injectées telles quelles
 * en BDD (portail contrat + page SEPA admin). Ce helper clampe le jour au
 * dernier jour réel du mois cible.
 */

/** Dernier jour réel d'un mois (mois 1..12). */
export function dernierJourDuMois(annee: number, mois1a12: number): number {
  return new Date(annee, mois1a12, 0).getDate()
}

/**
 * Date d'échéance ISO (YYYY-MM-DD) avec jour clampé :
 * dateEcheance(2027, 2, 31) => "2027-02-28".
 * Jour invalide/absent => 5 par défaut.
 */
export function dateEcheance(annee: number, mois1a12: number, jour: number | null | undefined): string {
  const brut = Number(jour)
  const souhaite = Number.isFinite(brut) && brut >= 1 ? Math.floor(brut) : 5
  const j = Math.min(souhaite, dernierJourDuMois(annee, mois1a12))
  return `${annee}-${String(mois1a12).padStart(2, '0')}-${String(j).padStart(2, '0')}`
}

/**
 * cccc5 (31/08/2026) — LISSAGE serveur de l'échéancier sur le reste dû réel.
 *
 * Règle d'Avi (mmmm1) : quand la facture change (régénération depuis le contrat,
 * ajout d'option), on ne crée JAMAIS d'échéance de régularisation supplémentaire.
 * Le reste dû est réparti sur les échéances ACTIVES existantes (statut prevu /
 * attente_reception) : même nombre, mêmes dates, mêmes modes de paiement, la
 * dernière échéance absorbe l'arrondi. Miroir exact du bouton « Recalculer
 * l'échéancier sur le reste dû » de la page Échéancier famille.
 *
 * Reste dû = somme des solde_restant (vue factures_solde) des factures non
 * annulées de la famille — règlements ET avoirs imputés déjà déduits.
 * Best effort : ne lève jamais ; retourne ok=false + message en cas de souci.
 * NB : un prélèvement SEPA déjà soumis à GoCardless (fenêtre J-7) n'est pas
 * modifié par un changement de montant d'échéance — comme pour le bouton UI.
 */
export async function lisserEcheancierFamille(
  s: any,
  familleId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const [echRes, soldeRes] = await Promise.all([
      s.from('cheques_prevus')
        .select('id, montant, date_echeance, numero_cheque, statut')
        .eq('famille_id', familleId)
        .in('statut', ['prevu', 'attente_reception'])
        .order('date_echeance', { ascending: true })
        .order('numero_cheque', { ascending: true }),
      s.from('factures_solde')
        .select('solde_restant, statut')
        .eq('famille_id', familleId),
    ])
    if (echRes.error) return { ok: false, message: 'lecture echeances : ' + echRes.error.message }
    if (soldeRes.error) return { ok: false, message: 'lecture soldes : ' + soldeRes.error.message }
    const actives = (echRes.data || []) as any[]
    if (actives.length === 0) return { ok: true, message: 'aucune echeance active' }
    const resteDu = Math.round(
      ((soldeRes.data || []) as any[])
        .filter((f: any) => f.statut !== 'annule')
        .reduce((t: number, f: any) => t + (parseFloat(f.solde_restant) || 0), 0) * 100
    ) / 100
    if (resteDu <= 0) return { ok: true, message: 'reste du nul - echeancier laisse tel quel' }
    const totalActives = actives.reduce((t: number, c: any) => t + (parseFloat(c.montant) || 0), 0)
    if (Math.abs(resteDu - totalActives) <= 1) return { ok: true }
    const n = actives.length
    const unit = Math.round((resteDu / n) * 100) / 100
    const dernier = Math.round((resteDu - unit * (n - 1)) * 100) / 100
    for (let i = 0; i < n; i++) {
      const montant = i === n - 1 ? dernier : unit
      const { error } = await s.from('cheques_prevus').update({ montant }).eq('id', actives[i].id)
      if (error) return { ok: false, message: 'maj echeance ' + (i + 1) + '/' + n + ' : ' + error.message }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message || 'erreur inconnue' }
  }
}
