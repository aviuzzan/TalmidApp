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

/**
 * ssss2 — ecrans masques pour un etablissement Yeter (audit valide par Avi le
 * 18/08/2026) : tout ce qui est purement scolaire (pedagogie, vie scolaire,
 * passages de classe, UAI/RNE, paie DSN) ou compta avancee. Les dons/recus
 * fiscaux ont ete volontairement ecartes (les etablissements ont d'autres
 * plateformes pour ca) : Yeter gere les inscriptions et la gestion, point.
 */
const ROUTES_MASQUEES_YETER = [
  // categories entierement cachees (protege aussi l'acces direct par URL)
  'pedagogie', 'professeurs', 'emplois-du-temps', 'devoirs', 'bulletins',
  'conseils-de-classe', 'notes', 'lsu', 'connecteurs-en',
  'vie-scolaire', 'presences', 'sanctions', 'transport', 'cantine', 'casiers', 'prets',
  // modules retires a l'interieur des categories visibles
  'passages-de-classe',
  'finances/rapprochement', 'finances/analytique', 'finances/sepa', 'finances/cloture', 'paie',
  'parametres/ecole-infos', 'parametres/chatbot', 'aide',
]

/** Un module (href relatif au slug) est-il visible pour ce profil ? */
export function moduleVisible(href: string, type?: string | null): boolean {
  if (!estYeter(type)) return true
  const clean = href.split('?')[0]
  return !ROUTES_MASQUEES_YETER.some(r => clean === r || clean.startsWith(r + '/'))
}

/** Garde d'acces direct par URL (utilisee par EcoleAppLayout). */
export function routeMasquee(pathname: string, slug: string, type?: string | null): boolean {
  if (!estYeter(type)) return false
  const prefix = '/' + slug + '/'
  if (!pathname.startsWith(prefix)) return false
  const rest = pathname.slice(prefix.length)
  return ROUTES_MASQUEES_YETER.some(r => rest === r || rest.startsWith(r + '/'))
}
