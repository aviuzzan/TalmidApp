/**
 * Helper unifié pour lire/écrire les credentials d'intégrations par école.
 *
 * Stockage : table `parametres_integrations` (ecole_id, provider, config_public, config_secrets_chiffres, config_hints)
 * Chiffrement : AES-256-GCM via MASTER_ENCRYPTION_KEY (cf lib/crypto.ts)
 *
 * Côté serveur uniquement (les fonctions decrypt nécessitent MASTER_ENCRYPTION_KEY).
 */

import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { encrypt, decrypt, lastChars } from './crypto'

export type ProviderName = 'stripe' | 'gocardless' | 'brevo_sms' | 'brevo_email' | 'twilio' | 'yousign'

export interface IntegrationConfig {
  actif: boolean
  mode: 'test' | 'live'
  public: Record<string, any>
  secrets: Record<string, string>   // valeurs déchiffrées
  hints: Record<string, string>     // 4 derniers chars pour UI
}

function admin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Récupère la config complète d'un provider pour une école, secrets déchiffrés.
 * Retourne null si pas configuré ou inactif.
 */
export async function getIntegration(ecoleId: string, provider: ProviderName): Promise<IntegrationConfig | null> {
  const supa = admin()
  const { data } = await supa
    .from('parametres_integrations')
    .select('actif, mode, config_public, config_secrets_chiffres, config_hints')
    .eq('ecole_id', ecoleId)
    .eq('provider', provider)
    .maybeSingle()

  if (!data || !data.actif) return null

  const secretsChiffres = (data.config_secrets_chiffres || {}) as Record<string, string>
  const secrets: Record<string, string> = {}
  for (const [k, v] of Object.entries(secretsChiffres)) {
    const plain = decrypt(v)
    if (plain != null) secrets[k] = plain
  }

  return {
    actif: data.actif,
    mode: (data.mode || 'live') as 'test' | 'live',
    public: data.config_public || {},
    secrets,
    hints: data.config_hints || {},
  }
}

/**
 * Variante : ne déchiffre pas, retourne juste la config publique + hints + actif.
 * Pour l'affichage UI où on n'a pas besoin des secrets.
 */
export async function getIntegrationMeta(ecoleId: string, provider: ProviderName): Promise<{
  actif: boolean
  mode: 'test' | 'live'
  public: Record<string, any>
  hints: Record<string, string>
} | null> {
  const supa = admin()
  const { data } = await supa
    .from('parametres_integrations')
    .select('actif, mode, config_public, config_hints')
    .eq('ecole_id', ecoleId)
    .eq('provider', provider)
    .maybeSingle()
  if (!data) return null
  return {
    actif: data.actif,
    mode: (data.mode || 'live') as 'test' | 'live',
    public: data.config_public || {},
    hints: data.config_hints || {},
  }
}

export interface SaveIntegrationParams {
  ecoleId: string
  provider: ProviderName
  actif?: boolean
  mode?: 'test' | 'live'
  publicConfig?: Record<string, any>          // valeurs en clair, ex: { publishable_key, expediteur }
  secrets?: Record<string, string | null>     // valeurs en clair à chiffrer. null = supprime.
}

/**
 * Upsert la config d'un provider. Les secrets passés sont chiffrés. Les secrets non passés sont conservés.
 * Pour supprimer un secret, passer null comme valeur.
 */
export async function saveIntegration(p: SaveIntegrationParams): Promise<{ ok: boolean; error?: string }> {
  const supa = admin()

  // Récupère l'existant pour merger les secrets
  const { data: existing } = await supa
    .from('parametres_integrations')
    .select('config_secrets_chiffres, config_hints, config_public')
    .eq('ecole_id', p.ecoleId)
    .eq('provider', p.provider)
    .maybeSingle()

  const existingSecrets = (existing?.config_secrets_chiffres || {}) as Record<string, string>
  const existingHints = (existing?.config_hints || {}) as Record<string, string>
  const existingPublic = (existing?.config_public || {}) as Record<string, any>

  // Merge secrets
  const newSecrets = { ...existingSecrets }
  const newHints = { ...existingHints }
  if (p.secrets) {
    for (const [k, v] of Object.entries(p.secrets)) {
      if (v == null) {
        delete newSecrets[k]
        delete newHints[k]
      } else {
        const cipher = encrypt(v)
        if (cipher) {
          newSecrets[k] = cipher
          newHints[k] = lastChars(v, 4)
        }
      }
    }
  }

  const newPublic = { ...existingPublic, ...(p.publicConfig || {}) }

  const payload: any = {
    ecole_id: p.ecoleId,
    provider: p.provider,
    config_secrets_chiffres: newSecrets,
    config_hints: newHints,
    config_public: newPublic,
    updated_at: new Date().toISOString(),
  }
  if (p.actif != null) payload.actif = p.actif
  if (p.mode) payload.mode = p.mode

  const { error } = await supa
    .from('parametres_integrations')
    .upsert(payload, { onConflict: 'ecole_id,provider' })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Désactive (sans supprimer les secrets) — utile pour pause temporaire.
 */
export async function disableIntegration(ecoleId: string, provider: ProviderName): Promise<void> {
  await admin()
    .from('parametres_integrations')
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq('ecole_id', ecoleId)
    .eq('provider', provider)
}

/**
 * Supprime totalement (secrets compris) une intégration.
 */
export async function deleteIntegration(ecoleId: string, provider: ProviderName): Promise<void> {
  await admin()
    .from('parametres_integrations')
    .delete()
    .eq('ecole_id', ecoleId)
    .eq('provider', provider)
}

/**
 * Trouve l'école associée à un webhook entrant via slug en query string.
 * Ex : /api/stripe/webhook?ecole=heder → retourne l'école avec slug "heder".
 */
export async function findEcoleBySlug(slug: string): Promise<{ id: string; nom: string; slug: string } | null> {
  const { data } = await admin()
    .from('ecoles')
    .select('id, nom, slug')
    .eq('slug', slug)
    .maybeSingle()
  return data as any
}
