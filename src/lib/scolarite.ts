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
