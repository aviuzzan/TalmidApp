// lib/scolarite.ts
// Couche "scolarité par année" — modèle type AGATE.
//   enfants    = identité stable de l'élève
//   scolarites = une ligne par (élève × exercice) : classe, statut, dates, régime…
// Toute opération année-sensible (liste élèves, passage de classe, clôture)
// passe par scolarites ; enfants reste un miroir de l'exercice ouvert.

import type { SupabaseClient } from '@supabase/supabase-js'

export type StatutScolarite = 'en_attente' | 'inscrit' | 'refuse' | 'sorti'

export type Scolarite = {
  id: string
  enfant_id: string
  exercice_id: string
  ecole_id: string | null
  classe_id: string | null
  statut_inscription: StatutScolarite
  regime: string | null
  transport: string | null
  date_entree: string | null
  date_sortie: string | null
  motif_sortie: string | null
  instruction_religieuse: boolean
  etude_garderie: boolean
  annee_scolaire: string | null
  created_at?: string
  updated_at?: string
}

export type ScolariteAvecEnfant = Scolarite & {
  enfants: {
    id: string; prenom: string; nom: string; deuxieme_prenom: string | null
    date_naissance: string | null; genre: string | null; famille_id: string
  } | null
  classes: { id: string; nom: string; ordre: number; secteur_id: string | null } | null
}

export const STATUT_SCOLARITE_LABEL: Record<StatutScolarite, string> = {
  en_attente: 'En attente',
  inscrit: 'Inscrit',
  refuse: 'Refusé',
  sorti: 'Sorti',
}

export const STATUT_SCOLARITE_STYLE: Record<StatutScolarite, { bg: string; fg: string }> = {
  en_attente: { bg: '#FFFBEB', fg: '#D97706' },
  inscrit: { bg: '#ECFDF5', fg: '#059669' },
  refuse: { bg: '#F1F5F9', fg: '#64748B' },
  sorti: { bg: '#FEF2F2', fg: '#B91C1C' },
}

// ────────────────────────────────────────────────────────────────────────────
// Passage de classe : quelle est la classe SUIVANTE ?
// ────────────────────────────────────────────────────────────────────────────
// Règle de référence = celle de la page « Passages de classe »
// (src/app/[ecole]/passages-de-classe/page.tsx, calcul des cibles par défaut) :
//   next = classes du MÊME SECTEUR dont `ordre` est strictement supérieur,
//          triées par `ordre` croissant → la première.
// En production `classes.ordre` vaut 0 partout : cette règle ne renvoie alors
// rien. On lui ajoute donc un départage par LIBELLÉ, numérique et non
// alphabétique (« Kita 10 » vient après « Kita 9 », un tri alphabétique
// donnerait l'inverse), limité à la même « famille » de nom (préfixe) pour ne
// jamais enchaîner deux progressions différentes (CM2 ne devient pas Kita 1).
// Ce départage cherche dans TOUTE l'école : une classe suivante peut changer de
// secteur/site (ex. Kita 5 → Kita 6).

export type ClasseOrdonnable = {
  id: string
  nom: string | null
  ordre?: number | null
  secteur_id?: string | null
}

/** « Kita 10 » → { prefixe: 'kita', numero: 10 } ; « Grande section » → numero null. */
const decomposerNomClasse = (nom: string | null): { prefixe: string; numero: number | null } => {
  const norm = (nom || '').toLowerCase().replace(/[\s._-]+/g, ' ').trim()
  const m = norm.match(/^(.*?)(\d+)$/)
  if (!m) return { prefixe: norm, numero: null }
  return { prefixe: m[1].trim(), numero: parseInt(m[2], 10) }
}

/**
 * Classe suivante d'un élève au sein d'une école.
 * @param classes toutes les classes de l'école (id, nom, ordre, secteur_id)
 * @param classeActuelleId classe de l'année en cours
 * @returns la classe suivante, ou null (dernière classe de l'école, classe inconnue…)
 */
export function trouverClasseSuivante<T extends ClasseOrdonnable>(
  classes: T[],
  classeActuelleId: string | null | undefined,
): T | null {
  if (!classeActuelleId || !Array.isArray(classes) || classes.length === 0) return null
  const actuelle = classes.find(c => c.id === classeActuelleId)
  if (!actuelle) return null

  // 1. Règle historique « Passages de classe » : même secteur, ordre supérieur.
  const parOrdre = classes
    .filter(c => c.secteur_id === actuelle.secteur_id && (c.ordre ?? 0) > (actuelle.ordre ?? 0))
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
  if (parOrdre.length > 0) return parOrdre[0]

  // 2. `ordre` à plat : progression par le libellé (numérique), même préfixe,
  //    toute l'école (le secteur peut changer), le même secteur l'emportant à
  //    numéro égal.
  const ref = decomposerNomClasse(actuelle.nom)
  if (ref.numero === null) return null
  const candidats: { classe: T; numero: number; memeSecteur: boolean }[] = []
  for (const c of classes) {
    if (c.id === actuelle.id) continue
    const d = decomposerNomClasse(c.nom)
    if (d.numero === null || d.prefixe !== ref.prefixe || d.numero <= ref.numero) continue
    candidats.push({ classe: c, numero: d.numero, memeSecteur: c.secteur_id === actuelle.secteur_id })
  }
  if (candidats.length === 0) return null
  candidats.sort((a, b) => (a.numero - b.numero) || (Number(b.memeSecteur) - Number(a.memeSecteur)))
  return candidats[0].classe
}

/** Liste des scolarités d'une école pour un exercice donné (avec identité élève + classe). */
export async function getScolarites(
  supabase: SupabaseClient,
  ecoleId: string,
  exerciceId: string,
): Promise<ScolariteAvecEnfant[]> {
  const { data } = await supabase
    .from('scolarites')
    .select('*, enfants(id, prenom, nom, deuxieme_prenom, date_naissance, genre, famille_id), classes(id, nom, ordre, secteur_id)')
    .eq('ecole_id', ecoleId)
    .eq('exercice_id', exerciceId)
  return (data ?? []) as ScolariteAvecEnfant[]
}

/** Scolarité d'un enfant pour un exercice précis. */
export async function getScolarite(
  supabase: SupabaseClient,
  enfantId: string,
  exerciceId: string,
): Promise<Scolarite | null> {
  const { data } = await supabase
    .from('scolarites')
    .select('*')
    .eq('enfant_id', enfantId)
    .eq('exercice_id', exerciceId)
    .maybeSingle()
  return (data as Scolarite) ?? null
}

/** Toutes les scolarités d'un enfant, toutes années — la "timeline" de l'élève. */
export async function getScolaritesEnfant(
  supabase: SupabaseClient,
  enfantId: string,
): Promise<(Scolarite & { exercices: { code: string; statut: string } | null; classes: { nom: string } | null })[]> {
  const { data } = await supabase
    .from('scolarites')
    .select('*, exercices(code, statut), classes(nom)')
    .eq('enfant_id', enfantId)
  const rows = (data ?? []) as any[]
  rows.sort((a, b) => (b.exercices?.code || '').localeCompare(a.exercices?.code || ''))
  return rows
}

/** Crée ou met à jour la scolarité (enfant × exercice). */
export async function upsertScolarite(
  supabase: SupabaseClient,
  payload: Partial<Scolarite> & { enfant_id: string; exercice_id: string },
): Promise<{ ok: boolean; error?: string; data?: Scolarite }> {
  const { data, error } = await supabase
    .from('scolarites')
    .upsert(payload, { onConflict: 'enfant_id,exercice_id' })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as Scolarite }
}
