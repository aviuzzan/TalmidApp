import type { SupabaseClient } from '@supabase/supabase-js'

// SECTEUR (llll2) : restriction d'un compte agent à un secteur.
// Un profil avec `profiles.secteur_id` renseigné (et role !== 'super_admin')
// ne voit que les enfants dont la classe appartient à ce secteur
// (enfants.classe_id → classes.secteur_id) et les familles ayant au moins
// un enfant scolarisé dans ce secteur.

export type SecteurScope = { secteurId: string | null }

// SECTEUR (llll2) : charge le scope du user courant.
// Retourne { secteurId: null } si aucune restriction (pas de secteur_id,
// ou role super_admin — un admin principal ne devrait pas avoir de secteur_id ;
// s'il en a un, le filtre s'applique aussi, comportement voulu).
export async function getSecteurScope(s: SupabaseClient, userId: string): Promise<SecteurScope> {
  const { data: profil } = await s
    .from('profiles')
    .select('secteur_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (!profil?.secteur_id) return { secteurId: null }
  if (profil.role === 'super_admin') return { secteurId: null }
  return { secteurId: profil.secteur_id as string }
}

// SECTEUR (llll2) : nom du secteur (pour le badge "Secteur : <nom>").
export async function getSecteurNom(s: SupabaseClient, secteurId: string): Promise<string | null> {
  const { data } = await s.from('secteurs').select('nom').eq('id', secteurId).maybeSingle()
  return (data?.nom as string) ?? null
}

// SECTEUR (llll2) : ids des enfants de l'école dont la classe est dans le secteur.
// Jointure inner sur classes → pas de .in() géant, pas de limite d'URL.
export async function getEnfantIdsSecteur(
  s: SupabaseClient,
  ecoleId: string,
  secteurId: string
): Promise<string[]> {
  const { data } = await s
    .from('enfants')
    .select('id, classes!inner(secteur_id)')
    .eq('ecole_id', ecoleId)
    .eq('classes.secteur_id', secteurId)
  return (data ?? []).map((e: any) => e.id as string)
}

// SECTEUR (llll2) : famille_id distincts des enfants du secteur.
export async function getFamilleIdsSecteur(
  s: SupabaseClient,
  ecoleId: string,
  secteurId: string
): Promise<string[]> {
  const { data } = await s
    .from('enfants')
    .select('famille_id, classes!inner(secteur_id)')
    .eq('ecole_id', ecoleId)
    .eq('classes.secteur_id', secteurId)
  const ids = new Set<string>()
  for (const e of data ?? []) {
    if ((e as any).famille_id) ids.add((e as any).famille_id as string)
  }
  return Array.from(ids)
}

// SECTEUR (llll2) : true si l'enfant est scolarisé dans le secteur
// (classe non affectée ⇒ hors secteur ⇒ false).
export async function enfantDansSecteur(
  s: SupabaseClient,
  enfantId: string,
  secteurId: string
): Promise<boolean> {
  const { data } = await s
    .from('enfants')
    .select('id, classes!inner(secteur_id)')
    .eq('id', enfantId)
    .eq('classes.secteur_id', secteurId)
    .maybeSingle()
  return !!data
}

// SECTEUR (llll2) : true si la famille a au moins un enfant dans le secteur.
export async function familleDansSecteur(
  s: SupabaseClient,
  familleId: string,
  secteurId: string
): Promise<boolean> {
  const { data } = await s
    .from('enfants')
    .select('id, classes!inner(secteur_id)')
    .eq('famille_id', familleId)
    .eq('classes.secteur_id', secteurId)
    .limit(1)
  return (data ?? []).length > 0
}
