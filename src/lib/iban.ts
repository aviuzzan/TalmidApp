/**
 * Validation et formatage IBAN / BIC — zéro dépendance (audit sécu 28/07).
 *
 * validerIban : contrôle du format (regex) + clé MOD 97-10 (ISO 13616 / ISO 7064).
 * Utilisé par le portail contrat (mandat SEPA). La RPC soumettre_contrat_famille
 * revalide le format côté serveur — ceci est le contrôle UX de première ligne.
 */

/** Forme compacte : retire tous les espaces et met en majuscules. */
export const nettoyerIban = (valeur: string): string =>
  (valeur || '').replace(/\s+/g, '').toUpperCase()

/** true si l'IBAN est valide (format + clé de contrôle MOD 97). */
export const validerIban = (valeur: string): boolean => {
  const iban = nettoyerIban(valeur)
  // 2 lettres pays + 2 chiffres de clé + 11 à 30 caractères BBAN (total 15..34)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  // Réarrangement ISO : les 4 premiers caractères passent à la fin,
  // puis lettres converties en nombres (A=10 … Z=35), modulo 97 itératif
  // (chiffre par chiffre pour éviter tout dépassement numérique).
  const rearrange = iban.slice(4) + iban.slice(0, 4)
  let reste = 0
  for (let i = 0; i < rearrange.length; i++) {
    const c = rearrange[i]
    const chiffres = c >= '0' && c <= '9' ? c : String(c.charCodeAt(0) - 55)
    for (let j = 0; j < chiffres.length; j++) {
      reste = (reste * 10 + (chiffres.charCodeAt(j) - 48)) % 97
    }
  }
  return reste === 1
}

/** Affichage par blocs de 4 : "FR761234…" → "FR76 1234 …". */
export const formaterIban = (valeur: string): string =>
  nettoyerIban(valeur).replace(/(.{4})/g, '$1 ').trim()

/** BIC / SWIFT : 8 ou 11 caractères (banque 4 + pays 2 + localisation 2 [+ agence 3]). */
export const validerBic = (valeur: string): boolean =>
  /^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test((valeur || '').trim())
