import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * eeee5 (31/08/2026) — client navigateur SINGLETON (« rester connecté »).
 *
 * Avant : chaque appel créait un client neuf (435 appels dans 139 fichiers),
 * donc autant de GoTrueClient rafraîchissant le MÊME jeton en parallèle. Avec
 * la rotation des refresh tokens de Supabase, deux refresh simultanés (retour
 * de veille sur mobile typiquement) invalident la session par sécurité →
 * déconnexions aléatoires, mot de passe redemandé sur téléphone (constat
 * d'Avi le 31/08).
 *
 * Un seul client par onglet = un seul refresh à la fois ; la session Supabase
 * persiste (localStorage + auto-refresh) : on reste connecté, sans case à
 * cocher. Côté serveur (pré-rendu d'un composant client), pas de singleton
 * partagé entre requêtes : client jetable, comme avant.
 */
let clientNavigateur: SupabaseClient | null = null

export function createClient() {
  if (typeof window === 'undefined') {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  if (!clientNavigateur) {
    clientNavigateur = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    )
  }
  return clientNavigateur
}
