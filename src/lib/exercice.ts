// lib/exercice.ts
// Gestion des exercices (année admin/facturation/comptable unifiée)
// Une seule entité pilote tout pour éviter les désynchros style AGATE

import type { SupabaseClient } from '@supabase/supabase-js'

export type StatutExercice = 'preparation' | 'ouvert' | 'cloture'

export type Exercice = {
  id: string
  ecole_id: string
  code: string                  // ex '2025-2026'
  libelle: string | null         // ex 'Année 2025-2026'
  date_debut: string             // YYYY-MM-DD
  date_fin: string               // YYYY-MM-DD
  statut: StatutExercice
  exercice_suivant_id: string | null
  date_cloture: string | null
  notes: string | null
}

const STATUT_LABELS: Record<StatutExercice, string> = {
  preparation: 'En préparation',
  ouvert: 'Ouvert',
  cloture: 'Clôturé',
}

const STATUT_COLORS: Record<StatutExercice, { bg: string; fg: string }> = {
  preparation: { bg: '#FEF3C7', fg: '#92400E' },
  ouvert: { bg: '#ECFDF5', fg: '#059669' },
  cloture: { bg: '#F1F5F9', fg: '#475569' },
}

export function statutLabel(s: StatutExercice): string {
  return STATUT_LABELS[s] ?? s
}

export function statutColor(s: StatutExercice): { bg: string; fg: string } {
  return STATUT_COLORS[s] ?? { bg: '#F1F5F9', fg: '#475569' }
}

/**
 * Détecte l'exercice courant en fonction de la date du jour.
 * Logique : sept→août. Si on est en sept ou plus tard, c'est l'année qui commence.
 */
export function detectCodeExerciceCourant(): string {
  const d = new Date()
  const m = d.getMonth() + 1
  const y = d.getFullYear()
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/**
 * Charge tous les exercices d'une école, triés par date_debut DESC.
 */
export async function listExercices(supabase: SupabaseClient, ecoleId: string): Promise<Exercice[]> {
  const { data, error } = await supabase
    .from('exercices')
    .select('*')
    .eq('ecole_id', ecoleId)
    .order('date_debut', { ascending: false })
  if (error) {
    console.error('listExercices error', error)
    return []
  }
  return (data ?? []) as Exercice[]
}

/**
 * Charge l'exercice courant d'une école (via ecoles.exercice_courant_id).
 * Fallback : si pas défini, détecte par date.
 */
export async function getExerciceCourant(supabase: SupabaseClient, ecoleId: string): Promise<Exercice | null> {
  // Lecture ecoles.exercice_courant_id
  const { data: ecole } = await supabase
    .from('ecoles')
    .select('exercice_courant_id')
    .eq('id', ecoleId)
    .single()

  if (ecole?.exercice_courant_id) {
    const { data: ex } = await supabase
      .from('exercices')
      .select('*')
      .eq('id', ecole.exercice_courant_id)
      .single()
    if (ex) return ex as Exercice
  }

  // Fallback : détection par date sur les exercices existants
  const code = detectCodeExerciceCourant()
  const { data: ex } = await supabase
    .from('exercices')
    .select('*')
    .eq('ecole_id', ecoleId)
    .eq('code', code)
    .maybeSingle()
  return (ex as Exercice) ?? null
}

/**
 * Change l'exercice courant d'une école (admin uniquement).
 */
export async function setExerciceCourant(
  supabase: SupabaseClient,
  ecoleId: string,
  exerciceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ecoles')
    .update({ exercice_courant_id: exerciceId })
    .eq('id', ecoleId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Crée un nouvel exercice (admin).
 * Si une école n'a pas d'exercice courant, le nouvel exercice devient courant.
 */
export async function createExercice(
  supabase: SupabaseClient,
  ecoleId: string,
  data: { code: string; libelle?: string; date_debut: string; date_fin: string; statut?: StatutExercice },
): Promise<{ ok: boolean; exercice?: Exercice; error?: string }> {
  const { data: newEx, error } = await supabase
    .from('exercices')
    .insert({
      ecole_id: ecoleId,
      code: data.code,
      libelle: data.libelle || `Année ${data.code}`,
      date_debut: data.date_debut,
      date_fin: data.date_fin,
      statut: data.statut || 'preparation',
    })
    .select('*')
    .single()
  if (error || !newEx) return { ok: false, error: error?.message }
  return { ok: true, exercice: newEx as Exercice }
}

/**
 * Clone la configuration d'un exercice vers un autre :
 * tarifs, tarifs_secteur, reductions_famille_nombreuse, frais_inscription_config,
 * reduction_documents_config, reduction_questions_config.
 *
 * Note : on ne clone PAS les enfants, factures, contrats, DDR — c'est la donnée
 * opérationnelle de l'année précédente, à orienter/refaire dans le nouvel exercice.
 */
export async function cloneExerciceConfig(
  supabase: SupabaseClient,
  fromExerciceId: string,
  toExerciceId: string,
): Promise<{ ok: boolean; cloned: Record<string, number>; error?: string }> {
  const cloned: Record<string, number> = {}

  // Récupère code des deux exercices pour conserver annee_scolaire legacy
  const { data: exs } = await supabase
    .from('exercices')
    .select('id, code')
    .in('id', [fromExerciceId, toExerciceId])
  const fromCode = exs?.find(e => e.id === fromExerciceId)?.code ?? ''
  const toCode = exs?.find(e => e.id === toExerciceId)?.code ?? ''

  const tablesAClone = [
    'tarifs',
    'tarifs_secteur',
    'reductions_famille_nombreuse',
    'frais_inscription_config',
    'reduction_documents_config',
    'reduction_questions_config',
    'inscriptions_config',
  ]

  for (const tbl of tablesAClone) {
    try {
      const { data: rows, error: e1 } = await supabase.from(tbl).select('*').eq('exercice_id', fromExerciceId)
      if (e1) { console.error(`clone ${tbl} read`, e1); continue }
      if (!rows || rows.length === 0) { cloned[tbl] = 0; continue }
      const toInsert = rows.map((r: any) => {
        const { id: _id, date_creation: _dc, date_modification: _dm, ...rest } = r
        return { ...rest, exercice_id: toExerciceId, annee_scolaire: toCode }
      })
      const { error: e2 } = await supabase.from(tbl).insert(toInsert)
      if (e2) { console.error(`clone ${tbl} insert`, e2); cloned[tbl] = -1; continue }
      cloned[tbl] = toInsert.length
    } catch (err) {
      console.error(`clone ${tbl} exception`, err)
      cloned[tbl] = -1
    }
  }

  return { ok: true, cloned }
}

/**
 * Clôture un exercice (verrouillage). Action quasi-irréversible.
 */
export async function cloturerExercice(
  supabase: SupabaseClient,
  exerciceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('exercices')
    .update({ statut: 'cloture', date_cloture: new Date().toISOString() })
    .eq('id', exerciceId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
