import { createClient } from './supabase'

/**
 * Récupère l'ecole_id d'un parent de façon fiable :
 * 1. Depuis profiles.ecole_id (nominal)
 * 2. Fallback via familles.ecole_id si absent
 */
export async function getParentEcoleId(userId: string): Promise<string | null> {
  const s = createClient()

  const { data: profile } = await s
    .from('profiles')
    .select('ecole_id, famille_id')
    .eq('id', userId)
    .single()

  if (!profile) return null

  // Cas nominal
  if (profile.ecole_id) return profile.ecole_id

  // Fallback via famille
  if (profile.famille_id) {
    const { data: famille } = await s
      .from('familles')
      .select('ecole_id')
      .eq('id', profile.famille_id)
      .single()

    if (famille?.ecole_id) {
      // Mettre à jour le profil pour les prochaines fois
      await s.from('profiles').update({ ecole_id: famille.ecole_id }).eq('id', userId)
      return famille.ecole_id
    }
  }

  return null
}
