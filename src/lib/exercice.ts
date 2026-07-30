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

  if (!fromCode || !toCode) {
    return { ok: false, cloned, error: "Impossible de lire le code des exercices source et cible : rien n'a été cloné." }
  }

  const erreurs: string[] = []

  for (const tbl of tablesAClone) {
    try {
      // ────────────────────────────────────────────────────────────────────
      // tttt2 : ce clonage ne clonait RIEN, et le disait avec une coche verte.
      //
      // Il lisait sur `exercice_id`, alors qu'AUCUN écran de l'application
      // n'écrit cette colonne sur ces tables — toutes travaillent sur
      // `annee_scolaire`. La requête ne remontait donc jamais aucune ligne,
      // le code passait par la branche `rows.length === 0`, et le wizard
      // affichait « 0 éléments clonés » avec un succès.
      //
      // C'est ce qui a fait que 2026-2027 s'est retrouvée sans questions de
      // dossier de réduction, sans documents à fournir et sans barème famille
      // nombreuse : personne ne les avait recopiés, et l'outil censé le faire
      // ne faisait rien en silence.
      //
      // On lit désormais sur `annee_scolaire`, avec repli sur `exercice_id`
      // pour les tables qui l'auraient renseigné.
      // ────────────────────────────────────────────────────────────────────
      const { data: parAnnee, error: e1 } = await supabase
        .from(tbl).select('*').eq('annee_scolaire', fromCode)
      if (e1) {
        console.error(`clone ${tbl} read`, e1)
        erreurs.push(`${tbl} : ${e1.message}`)
        cloned[tbl] = -1
        continue
      }

      let rows = parAnnee || []
      if (rows.length === 0) {
        const { data: parExercice } = await supabase
          .from(tbl).select('*').eq('exercice_id', fromExerciceId)
        rows = parExercice || []
      }

      if (rows.length === 0) { cloned[tbl] = 0; continue }

      // Ne pas recréer ce qui existe déjà sur l'exercice cible : le wizard doit
      // pouvoir être relancé sans produire de doublons de tarifs.
      const { data: dejaLa } = await supabase
        .from(tbl).select('id').eq('annee_scolaire', toCode).limit(1)
      if (dejaLa && dejaLa.length > 0) { cloned[tbl] = 0; continue }

      const toInsert = rows.map((r: any) => {
        const { id: _id, date_creation: _dc, date_modification: _dm, created_at: _ca, updated_at: _ua, ...rest } = r
        return { ...rest, exercice_id: toExerciceId, annee_scolaire: toCode }
      })
      const { error: e2 } = await supabase.from(tbl).insert(toInsert)
      if (e2) {
        console.error(`clone ${tbl} insert`, e2)
        erreurs.push(`${tbl} : ${e2.message}`)
        cloned[tbl] = -1
        continue
      }
      cloned[tbl] = toInsert.length
    } catch (err: any) {
      console.error(`clone ${tbl} exception`, err)
      erreurs.push(`${tbl} : ${err?.message || 'erreur inconnue'}`)
      cloned[tbl] = -1
    }
  }

  // Un échec partiel ne doit plus passer pour un succès.
  if (erreurs.length > 0) {
    return { ok: false, cloned, error: `Clonage incomplet — ${erreurs.join(' ; ')}` }
  }
  return { ok: true, cloned }
}

export type ResultatCloture = {
  ok: boolean
  error?: string
  /** Message d'alerte non bloquant, à afficher même quand `ok` vaut true. */
  avertissement?: string
  /** Nombre de reports de solde encore au statut 'propose'. */
  reportsEnAttente?: number
}

/**
 * Clôture un exercice (verrouillage).
 *
 * Un trigger PostgreSQL refuse ensuite toute écriture sur `factures`,
 * `facture_lignes`, `reglements`, `cheques_prevus` et `avoirs` rattachés à cet
 * exercice. Ce n'est plus une simple étiquette de statut : le verrou est réel.
 * Il reste réversible via `rouvrirExercice`.
 *
 * CONTRÔLE ssss2-D : on refuse de clôturer tant que des reports de solde sont
 * au statut 'propose'. Un report proposé non arbitré, c'est un reliquat que
 * personne n'a décidé de reprendre ou d'écarter ; clôturer par-dessus revient
 * à le perdre de vue. `options.force` permet de passer outre en connaissance
 * de cause (l'appelant doit alors avoir montré l'avertissement).
 */
export async function cloturerExercice(
  supabase: SupabaseClient,
  exerciceId: string,
  options?: { force?: boolean },
): Promise<ResultatCloture> {
  // 1. Relecture de l'exercice : statut réel + école (filtre explicite ensuite).
  const { data: ex, error: exErr } = await supabase
    .from('exercices')
    .select('id, ecole_id, code, statut')
    .eq('id', exerciceId)
    .maybeSingle()
  if (exErr) return { ok: false, error: 'Lecture de l\'exercice : ' + exErr.message }
  if (!ex) return { ok: false, error: 'Exercice introuvable.' }
  if (ex.statut === 'cloture') return { ok: true, avertissement: 'Cet exercice était déjà clôturé.' }

  // 2. Reports de solde encore à arbitrer.
  const { count, error: cntErr } = await supabase
    .from('reports_solde')
    .select('id', { count: 'exact', head: true })
    .eq('ecole_id', ex.ecole_id)
    .eq('exercice_origine_id', exerciceId)
    .eq('statut', 'propose')
  if (cntErr) {
    // On ne clôture pas à l'aveugle si le contrôle lui-même est indisponible.
    return { ok: false, error: 'Contrôle des reports de solde impossible : ' + cntErr.message }
  }
  const reportsEnAttente = count ?? 0
  if (reportsEnAttente > 0 && !options?.force) {
    return {
      ok: false,
      reportsEnAttente,
      error: `${reportsEnAttente} report${reportsEnAttente > 1 ? 's' : ''} de solde `
        + `${reportsEnAttente > 1 ? 'sont encore' : 'est encore'} au statut « proposé » et n'`
        + `${reportsEnAttente > 1 ? 'ont' : 'a'} pas été arbitré${reportsEnAttente > 1 ? 's' : ''}. `
        + 'Traitez-les dans Finances › Clôture d\'exercice (valider ou écarter) avant de clôturer.',
    }
  }

  // 3. Clôture. Une écriture refusée par la RLS ne lève PAS d'exception sur ce
  //    projet : on vérifie le nombre de lignes réellement modifiées.
  const { data: maj, error } = await supabase
    .from('exercices')
    .update({ statut: 'cloture', date_cloture: new Date().toISOString() })
    .eq('id', exerciceId)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!maj || maj.length === 0) {
    return { ok: false, error: 'Clôture non enregistrée : aucune ligne modifiée (droits insuffisants ?).' }
  }
  return {
    ok: true,
    reportsEnAttente,
    avertissement: reportsEnAttente > 0
      ? `Clôture forcée : ${reportsEnAttente} report(s) de solde restent au statut « proposé ».`
      : undefined,
  }
}

/**
 * Rouvre un exercice clôturé (RPC `rouvrir_exercice`) : lève le verrou et
 * trace le motif dans les notes de l'exercice. Le motif est obligatoire — une
 * réouverture sans justification est exactement ce qu'un contrôle reprocherait.
 */
export async function rouvrirExercice(
  supabase: SupabaseClient,
  exerciceId: string,
  motif: string,
): Promise<{ ok: boolean; error?: string }> {
  const m = (motif || '').trim()
  if (!m) return { ok: false, error: 'Un motif de réouverture est obligatoire.' }
  const { error } = await supabase.rpc('rouvrir_exercice', { p_exercice_id: exerciceId, p_motif: m })
  if (error) return { ok: false, error: error.message }

  // Vérification explicite : la RPC ne rend rien, on relit le statut plutôt que
  // d'afficher « rouvert » sur la foi d'une absence d'erreur.
  const { data: ex } = await supabase
    .from('exercices').select('statut').eq('id', exerciceId).maybeSingle()
  if (ex && ex.statut === 'cloture') {
    return { ok: false, error: 'L\'exercice est toujours clôturé après l\'appel (droits insuffisants ?).' }
  }
  return { ok: true }
}
