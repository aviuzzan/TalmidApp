/**
 * Helper d'audit log.
 * Tracer une action administrateur dans la table admin_logs (lecture via /parametres/audit).
 *
 * Utilisation côté client :
 *   import { logAction } from '@/lib/audit-log'
 *   await logAction(supabase, ecoleId, 'contrat_valide', { contrat_id, famille_id })
 *
 * Utilisation côté route API (service role) :
 *   import { logActionServer } from '@/lib/audit-log'
 *   await logActionServer(sb, ecoleId, adminId, 'contrat_valide', { contrat_id })
 *
 * L'helper ne throw jamais — si l'écriture échoue, on log en console mais l'action principale continue.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'contrat_valide'
  | 'contrat_annule'
  | 'ddr_accordee'
  | 'ddr_refusee'
  | 'demande_inscription_acceptee'
  | 'demande_inscription_refusee'
  | 'facture_creee'
  | 'facture_annulee'
  | 'facture_verrouillee'
  | 'reglement_cree'
  | 'reglement_supprime'
  | 'famille_creee'
  | 'famille_supprimee'
  | 'eleve_sortie'
  | 'eleve_reintegre'
  | 'tranche_assignee_famille'
  | 'export_csv'
  | 'envoi_engagement'
  | 'reinscription_famille'
  | 'exercice_cloture'
  | 'compte_parent_cree'
  | 'connexion_admin'
  | string  // toujours autoriser un string custom

/**
 * Trace une action depuis le côté client (utilise auth.uid() ambiant).
 */
export async function logAction(
  sb: SupabaseClient,
  ecoleId: string | null,
  action: AuditAction,
  details: Record<string, any> = {},
): Promise<void> {
  try {
    const { data: { session } } = await sb.auth.getSession()
    const adminId = session?.user?.id ?? null
    await sb.from('admin_logs').insert({
      admin_id: adminId,
      ecole_id: ecoleId,
      action,
      details,
    })
  } catch (e) {
    // Non bloquant
    console.warn('[audit-log] insert failed:', e)
  }
}

/**
 * Trace une action depuis une route API (l'adminId est explicite, supabase est service role).
 */
export async function logActionServer(
  sb: SupabaseClient,
  ecoleId: string | null,
  adminId: string | null,
  action: AuditAction,
  details: Record<string, any> = {},
): Promise<void> {
  try {
    await sb.from('admin_logs').insert({
      admin_id: adminId,
      ecole_id: ecoleId,
      action,
      details,
    })
  } catch (e) {
    console.warn('[audit-log] insert failed:', e)
  }
}
