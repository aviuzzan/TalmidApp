// lib/effectifs.ts
// ────────────────────────────────────────────────────────────────────────────
// SOURCE DE VÉRITÉ UNIQUE DES EFFECTIFS (décision d'architecture du 28/07/2026)
// ────────────────────────────────────────────────────────────────────────────
// Un élève « actif » se définit TOUJOURS par sa ligne de `scolarites` sur
// l'exercice considéré, jamais par `enfants.statut_inscription` :
//
//   - `enfants`    = identité stable de l'élève, sans notion d'année. Sa colonne
//                    `statut_inscription` n'est qu'un miroir de l'exercice ouvert :
//                    l'utiliser donne un effectif SANS filtre d'année (donc faux
//                    dès qu'on le rapproche de chiffres financiers filtrés par
//                    exercice — ex. « facturé par élève »).
//   - `scolarites` = une ligne par (élève × exercice) : c'est la seule table qui
//                    porte l'affectation d'un élève à une année donnée.
//
// La page de référence `/[ecole]/enfants` compte exactement ainsi :
// scolarités de l'école ET de l'exercice, statut_inscription ≠ 'sorti'
// (cf. enfants/page.tsx : requête lignes 48-53 + filtre `showSortis` ligne 104).
// Ce module reproduit cette définition pour que /direction et /bilan-quotidien
// affichent le MÊME nombre que la liste des élèves.
//
// Statuts possibles (cf. lib/scolarite.ts) : 'en_attente' | 'inscrit' | 'refuse'
// | 'sorti'. Sont considérés INACTIFS : 'sorti' et 'radie' ('radie' n'est pas
// encore utilisé en base, il est exclu par anticipation). 'en_attente' et
// 'refuse' restent comptés, exactement comme sur la page /enfants — ne pas
// changer ce périmètre sans changer aussi /enfants, sinon les écrans divergent.

import type { SupabaseClient } from '@supabase/supabase-js'
import { chargerParLots } from '@/lib/pagination'

/** Statuts de scolarité qui NE comptent PAS dans l'effectif actif. */
export const STATUTS_SCOLARITE_INACTIFS: readonly string[] = ['sorti', 'radie']

export type Effectifs = {
  /** Nombre d'élèves actifs sur l'exercice (= lignes de scolarité non sorties). */
  eleves: number
  /** Nombre de familles distinctes ayant au moins un élève actif sur l'exercice. */
  familles: number
}

/** Ligne minimale de `scolarites` nécessaire au comptage. */
type LigneScolarite = {
  statut_inscription: string | null
  enfants: { famille_id: string | null } | { famille_id: string | null }[] | null
}

/** `enfants` peut être renvoyé par PostgREST comme objet ou comme tableau selon la relation. */
const familleIdDeLaLigne = (ligne: LigneScolarite): string | null => {
  const e = ligne.enfants
  if (!e) return null
  if (Array.isArray(e)) return e.length > 0 ? (e[0]?.famille_id ?? null) : null
  return e.famille_id ?? null
}

const estActive = (ligne: LigneScolarite): boolean =>
  // statut null => considéré actif (on ne perd pas un élève à cause d'une donnée
  // incomplète ; un filtre SQL `neq`/`not in` l'aurait silencieusement exclu).
  !STATUTS_SCOLARITE_INACTIFS.includes(String(ligne.statut_inscription ?? ''))

/**
 * Effectifs actifs (élèves + familles) d'une école sur un exercice donné.
 *
 * FIX pagination 29/07/2026 — POURQUOI deux stratégies différentes ici :
 * la version précédente chargeait TOUTES les lignes de `scolarites` puis
 * comptait en JavaScript. Or PostgREST plafonne SILENCIEUSEMENT une requête à
 * 1000 lignes : l'effectif se figeait donc à 1000 élèves et n'aurait plus jamais
 * bougé, sans la moindre erreur (cf. src/lib/pagination.ts).
 *  - ÉLÈVES : compté en SQL (`count: 'exact', head: true`), aucune ligne n'est
 *    rapatriée, aucun plafond possible. Comme un filtre SQL `not.in.(...)`
 *    exclurait aussi les lignes à `statut_inscription` NULL (sémantique NULL de
 *    SQL) alors que la règle métier les compte comme ACTIVES, on fait
 *    `total − inactifs` (deux counts) plutôt qu'un filtre de négation : le
 *    périmètre reste EXACTEMENT celui de `estActive`.
 *  - FAMILLES DISTINCTES : PostgREST n'expose pas de `COUNT(DISTINCT …)` et on
 *    ne veut pas introduire de RPC/vue SQL pour ça (migration + déploiement
 *    base, hors périmètre). On rapatrie donc les `famille_id` — mais PAGINÉS
 *    via `chargerParLots`, avec un tri déterministe sur `id`. Un plafond
 *    silencieux serait pire qu'un aller-retour de plus. Si un jour le volume le
 *    justifie, le bon correctif est une vue/RPC `effectifs_par_exercice`.
 * Les deux compteurs proviennent du même filtre (école + exercice + jointure
 * interne sur `enfants`) : ils restent cohérents entre eux.
 *
 * @param supabase  client Supabase (browser ou service)
 * @param ecoleId   école — filtre EXPLICITE, on ne s'appuie jamais sur la seule RLS
 * @param exerciceId exercice (année) — obligatoire : un effectif sans année n'a pas de sens
 *
 * LIMITE CONNUE : `scolarites.ecole_id` est nullable (données historiques, cf.
 * db/migrations/2026-07-28-rpc-classe-passage-fait-foi.sql qui tolère NULL). Une
 * scolarité avec `ecole_id` NULL n'est donc pas comptée ici — exactement comme
 * sur la page /enfants, qui filtre elle aussi sur `ecole_id`. C'est un choix
 * assumé : mieux vaut un écran cohérent avec la liste des élèves. Le vrai
 * correctif est côté données (backfill de `scolarites.ecole_id`).
 */
export const compterEffectifs = async (
  supabase: SupabaseClient,
  ecoleId: string,
  exerciceId: string,
): Promise<Effectifs> => {
  if (!ecoleId || !exerciceId) return { eleves: 0, familles: 0 }

  // Même périmètre que la lecture ci-dessous : école + exercice + jointure
  // interne sur `enfants` (une scolarité orpheline ne compte pas).
  const compte = () => supabase
    .from('scolarites')
    .select('id, enfants!inner(famille_id)', { count: 'exact', head: true })
    .eq('ecole_id', ecoleId)
    .eq('exercice_id', exerciceId)

  const [totalRes, inactifsRes, famillesRes] = await Promise.all([
    compte(),
    compte().in('statut_inscription', [...STATUTS_SCOLARITE_INACTIFS]),
    // `famille_id` paginé : tri sur `id` (clé unique) pour que deux lots ne se
    // recouvrent pas et ne sautent aucune ligne.
    chargerParLots<LigneScolarite>((debut, fin) => supabase
      .from('scolarites')
      .select('statut_inscription, enfants!inner(famille_id)')
      .eq('ecole_id', ecoleId)
      .eq('exercice_id', exerciceId)
      .order('id', { ascending: true })
      .range(debut, fin)),
  ])

  const erreur = totalRes.error || inactifsRes.error
  if (erreur || famillesRes.error) {
    console.error('compterEffectifs error', erreur || famillesRes.error)
    return { eleves: 0, familles: 0 }
  }
  if (famillesRes.tronque) {
    // Ne devrait jamais arriver (200 000 lignes) : on trace plutôt que de
    // renvoyer en silence un nombre de familles sous-évalué.
    console.error('compterEffectifs : garde-fou de pagination atteint sur scolarites')
  }

  // Élèves = toutes les scolarités de l'exercice MOINS celles explicitement
  // inactives ('sorti'/'radie'). Un `statut_inscription` NULL reste donc compté
  // comme actif, exactement comme `estActive`.
  const eleves = Math.max(0, (totalRes.count ?? 0) - (inactifsRes.count ?? 0))

  const familles = new Set<string>()
  for (const l of famillesRes.rows.filter(estActive)) {
    const fid = familleIdDeLaLigne(l)
    if (fid) familles.add(fid)
  }
  return { eleves, familles: familles.size }
}

/** Élèves actifs de l'école sur l'exercice (cf. `compterEffectifs`). */
export const compterElevesActifs = async (
  supabase: SupabaseClient,
  ecoleId: string,
  exerciceId: string,
): Promise<number> => (await compterEffectifs(supabase, ecoleId, exerciceId)).eleves

/** Familles ayant au moins un élève actif sur l'exercice (cf. `compterEffectifs`). */
export const compterFamillesActives = async (
  supabase: SupabaseClient,
  ecoleId: string,
  exerciceId: string,
): Promise<number> => (await compterEffectifs(supabase, ecoleId, exerciceId)).familles

/**
 * Élèves sortis EN COURS D'EXERCICE (statut de scolarité 'sorti' sur cet exercice).
 * Volontairement scopé à l'année : un cumul toutes années confondues, affiché à
 * côté d'effectifs annuels, n'est pas interprétable.
 */
export const compterSorties = async (
  supabase: SupabaseClient,
  ecoleId: string,
  exerciceId: string,
): Promise<number> => {
  if (!ecoleId || !exerciceId) return 0
  const { count, error } = await supabase
    .from('scolarites')
    .select('id', { count: 'exact', head: true })
    .eq('ecole_id', ecoleId)
    .eq('exercice_id', exerciceId)
    .eq('statut_inscription', 'sorti')
  if (error) {
    console.error('compterSorties error', error)
    return 0
  }
  return count ?? 0
}
