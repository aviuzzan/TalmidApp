// lib/pagination.ts
// ────────────────────────────────────────────────────────────────────────────
// PAGINATION SUPABASE / POSTGREST — POURQUOI CE FICHIER EXISTE
// ────────────────────────────────────────────────────────────────────────────
// PostgREST (donc Supabase) plafonne SILENCIEUSEMENT chaque requête à
// `db-max-rows` = 1000 lignes. Au-delà, la réponse n'est ni une erreur ni un
// avertissement : on reçoit simplement 1000 lignes, et le code appelant croit
// avoir tout lu. C'est la pire forme de bug de données — TRONCATURE SILENCIEUSE :
//   - un export CSV/FEC s'arrête à 1000 lignes en affichant « ✓ terminé » ;
//   - un compteur d'effectif se fige à 1000 élèves et n'augmente plus jamais ;
//   - un `SUM()` fait en JavaScript sur le résultat rend un total FAUX, plus
//     petit que la réalité, sans que rien ne le signale.
// Ce n'est pas théorique : `cheques_prevus` de l'école pilote a franchi les
// 1000 lignes (1022 au 29/07/2026), donc les calculs de « dû à date » et les
// exports comptables sont impactés en production.
//
// La parade : demander la donnée par tranches de 1000 (`.range(debut, fin)`)
// jusqu'à recevoir un lot INCOMPLET (< 1000 lignes), qui signe la fin du jeu.
//
// ⚠️ RÈGLE ABSOLUE : TOUTE REQUÊTE PAGINÉE DOIT AVOIR UN TRI DÉTERMINISTE.
// Chaque lot est une requête SQL indépendante. Sans `ORDER BY` stable, Postgres
// n'a AUCUNE obligation de renvoyer les lignes dans le même ordre d'un lot à
// l'autre (plan d'exécution, parallélisme, mises à jour concurrentes) : des
// lignes seraient alors DUPLIQUÉES entre deux lots et d'autres SAUTÉES. Un tri
// sur une colonne non unique (`date_echeance`, `nom`…) ne suffit pas : les
// ex æquo peuvent se réordonner. Il faut donc TOUJOURS terminer le tri par une
// colonne unique — en pratique `.order('id')` en dernier critère :
//     .order('date_echeance', { ascending: true }).order('id', { ascending: true })
//
// ⚠️ SECONDE LIMITE, distincte du plafond de lignes : un filtre
// `.in('x', ids)` avec des milliers d'identifiants produit une URL énorme
// (PostgREST lit les filtres dans la query string) et finit en HTTP 414 ou en
// timeout. D'où `decouperEnTranches` ci-dessous : on découpe la liste d'ids et
// on agrège les résultats côté client.
// ────────────────────────────────────────────────────────────────────────────

/** Taille d'un lot = plafond PostgREST par défaut. */
export const TAILLE_LOT = 1000

/**
 * Garde-fou : nombre maximum de lots par appel (200 × 1000 = 200 000 lignes).
 * Empêche toute boucle infinie si un jour le serveur renvoyait indéfiniment des
 * lots pleins (bug de `.range()`, vue instable, filtre inopérant…).
 */
export const MAX_LOTS = 200

/**
 * Taille de découpe des listes d'identifiants passées à `.in(...)`.
 * 200 ids ≈ 7 ko d'URL avec des UUID : très en dessous des limites usuelles.
 */
export const TAILLE_TRANCHE_IN = 200

/**
 * Forme minimale d'une réponse PostgREST. On ne type volontairement pas avec
 * `PostgrestResponse` : les builders Supabase produisent des types génériques
 * capricieux (unions succès/erreur, relations imbriquées), et l'appelant
 * construit souvent sa requête conditionnellement. On reste structurel.
 */
export type ReponseLot<T> = {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Une requête paginable : reçoit les bornes du lot et rend la réponse Supabase.
 * La requête est (RE)CONSTRUITE à chaque lot — un builder Supabase déjà attendu
 * ne se rejoue pas proprement, et `.range()` change d'un lot à l'autre.
 */
export type RequeteLot<T> = (debut: number, fin: number) => PromiseLike<ReponseLot<T>>

export type ResultatChargement<T> = {
  /** Lignes accumulées. Non vide même en cas d'erreur sur un lot tardif. */
  rows: T[]
  /** Message d'erreur Supabase du premier lot en échec, sinon `null`. */
  error: string | null
  /**
   * `true` si le garde-fou `maxLots` a été atteint alors que le dernier lot
   * était encore plein : le jeu de données est plus grand que ce qui a été lu.
   * À traiter comme une anomalie (log/alerte), jamais à ignorer.
   */
  tronque: boolean
}

/**
 * Charge l'intégralité d'une requête Supabase par lots de 1000 lignes.
 *
 * Exemple d'appel :
 *
 *     const { rows, error } = await chargerParLots(
 *       (debut, fin) => supabase
 *         .from('cheques_prevus')
 *         .select('id, montant')
 *         .eq('contrat_id', contratId)
 *         .order('date_echeance', { ascending: true })
 *         .order('id', { ascending: true })   // <- départage : tri déterministe
 *         .range(debut, fin),
 *     )
 *     // si `error` : remonter, ne JAMAIS calculer sur un jeu partiel.
 *
 * L'erreur Supabase n'est jamais avalée : elle est remontée dans `error` et la
 * boucle s'arrête immédiatement (pas de calcul sur un jeu incomplet).
 */
export async function chargerParLots<T = any>(
  requeteLot: RequeteLot<T>,
  options?: { tailleLot?: number; maxLots?: number },
): Promise<ResultatChargement<T>> {
  const tailleLot = options?.tailleLot && options.tailleLot > 0 ? options.tailleLot : TAILLE_LOT
  const maxLots = options?.maxLots && options.maxLots > 0 ? options.maxLots : MAX_LOTS

  const rows: T[] = []
  for (let i = 0; i < maxLots; i++) {
    const debut = i * tailleLot
    // Défensif : selon la façon dont l'appelant construit sa requête, le type
    // inféré peut être `any` ; on ne suppose donc rien de la forme reçue.
    const res = (await requeteLot(debut, debut + tailleLot - 1)) as ReponseLot<T> | null | undefined
    if (res?.error) return { rows, error: res.error.message || 'Erreur Supabase', tronque: false }
    const lot: T[] = Array.isArray(res?.data) ? res!.data! : []
    for (const ligne of lot) rows.push(ligne)
    // Lot incomplet = dernier lot. (Si le total est un multiple exact de
    // `tailleLot`, un lot vide supplémentaire est demandé : c'est voulu, c'est
    // la seule façon fiable de savoir qu'on a fini.)
    if (lot.length < tailleLot) return { rows, error: null, tronque: false }
  }
  // Garde-fou atteint : le dernier lot lu était plein, il reste donc des lignes.
  return { rows, error: null, tronque: true }
}

/**
 * Découpe une liste d'identifiants en tranches pour des filtres `.in(...)`.
 * Retourne `[]` pour une liste vide (l'appelant évite ainsi la requête).
 */
export function decouperEnTranches<T>(items: readonly T[], taille: number = TAILLE_TRANCHE_IN): T[][] {
  const pas = taille > 0 ? taille : TAILLE_TRANCHE_IN
  const tranches: T[][] = []
  for (let i = 0; i < items.length; i += pas) {
    tranches.push(items.slice(i, i + pas) as T[])
  }
  return tranches
}

/**
 * Combine les deux parades : découpe une liste d'ids en tranches, et pagine
 * chaque tranche par lots de 1000. Les résultats sont concaténés dans l'ordre
 * des tranches (l'appelant qui dépend d'un ordre global doit retrier lui-même
 * — cf. `du-a-date.ts` qui retrie les échéances par `date_echeance`).
 *
 * La première erreur rencontrée arrête le chargement et est remontée.
 */
export async function chargerParTranchesEtLots<T = any, Id = string>(
  ids: readonly Id[],
  requeteLot: (tranche: Id[], debut: number, fin: number) => PromiseLike<ReponseLot<T>>,
  options?: { tailleLot?: number; maxLots?: number; tailleTranche?: number },
): Promise<ResultatChargement<T>> {
  const rows: T[] = []
  let tronque = false
  if (ids.length === 0) return { rows, error: null, tronque }

  for (const tranche of decouperEnTranches(ids, options?.tailleTranche ?? TAILLE_TRANCHE_IN)) {
    const res = await chargerParLots<T>(
      (debut, fin) => requeteLot(tranche, debut, fin),
      options,
    )
    for (const ligne of res.rows) rows.push(ligne)
    if (res.tronque) tronque = true
    if (res.error) return { rows, error: res.error, tronque }
  }
  return { rows, error: null, tronque }
}
