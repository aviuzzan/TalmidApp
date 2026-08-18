/**
 * ssss1 — Yeter by TalmidApp : profils d'etablissement.
 *
 * 'ecole' (defaut) = comportement TalmidApp actuel, rien ne change.
 * 'talmud_torah' / 'club' / 'cantine' = profil Yeter minimum strict (arbitrage
 * Avi 18/08/2026) : seules les categories Administration, Finances,
 * Communication et Parametres sont visibles ; marque « Yeter by TalmidApp » ;
 * vocabulaire adapte via terme() — on dit « formulaire d'inscription »,
 * jamais « contrat » (le reste s'ajustera avec le temps).
 */

export type TypeEtablissement = 'ecole' | 'talmud_torah' | 'club' | 'cantine'

export const TYPE_ETABLISSEMENT_LABEL: Record<TypeEtablissement, string> = {
  ecole: 'Ecole',
  talmud_torah: 'Talmud Torah',
  club: 'Club',
  cantine: 'Cantine',
}

/** Degrade de la marque Yeter (orange -> rose -> violet, fond sombre). */
export const YETER_GRADIENT = 'linear-gradient(135deg, #F59E0B, #EC4899 55%, #8B5CF6)'

export function estYeter(type?: string | null): boolean {
  return !!type && type !== 'ecole'
}

/** Categories du dashboard/sidebar visibles pour un etablissement Yeter. */
const CATEGORIES_YETER = ['administration', 'finances', 'communication', 'configuration']

export function categorieVisible(catCode: string, type?: string | null): boolean {
  if (!estYeter(type)) return true
  return CATEGORIES_YETER.includes(catCode)
}

/** Vocabulaire par profil — a etendre au fil du temps. */
const TERMES_YETER: Record<string, string> = {
  'contrat': "formulaire d'inscription",
  'Contrat': "Formulaire d'inscription",
  'contrat de scolarite': "formulaire d'inscription",
  'eleve': 'enfant',
  'eleves': 'enfants',
  'Eleves': 'Enfants',
  'classe': 'groupe',
  'classes': 'groupes',
  'scolarite': 'cotisation',
  'annee scolaire': 'saison',
}

export function terme(type: string | null | undefined, mot: string): string {
  if (!estYeter(type)) return mot
  return TERMES_YETER[mot] ?? mot
}
