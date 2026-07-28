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
