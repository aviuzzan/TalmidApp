import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Cron quotidien Vercel : supprime les threads de messagerie inactifs.
 *
 * Pour chaque école, on récupère sa durée de rétention (`ecoles.duree_retention_messages_jours`,
 * défaut 15 jours). On supprime les `message_threads` dont `last_message_at` est strictement
 * antérieur à `now - durée_retention`.
 *
 * Cascade manuelle car aucune FK ON DELETE CASCADE n'est garantie : on supprime aussi
 * `messages`, `thread_participants`, puis `message_threads`.
 *
 * Sécurité : header Authorization doit contenir CRON_SECRET.
 */
export async function GET(req: NextRequest)  { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  if (cronSecret && !authHeader.includes(cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Toutes les écoles avec leur durée de rétention
  const { data: ecoles } = await supabaseAdmin
    .from('ecoles')
    .select('id, nom, duree_retention_messages_jours')

  const result = {
    ecoles_traitees: 0,
    threads_supprimes: 0,
    messages_supprimes: 0,
    par_ecole: [] as any[],
    erreurs: [] as string[],
  }

  for (const ecole of ecoles || []) {
    const duree = ecole.duree_retention_messages_jours ?? 15
    const cutoff = new Date(Date.now() - duree * 86400 * 1000).toISOString()

    // 1. Récupérer les ids des threads à supprimer
    const { data: threadsObsoletes, error: errSel } = await supabaseAdmin
      .from('message_threads')
      .select('id')
      .eq('ecole_id', ecole.id)
      .lt('last_message_at', cutoff)

    if (errSel) {
      result.erreurs.push(`${ecole.nom} : ${errSel.message}`)
      continue
    }
    const threadIds = (threadsObsoletes || []).map(t => t.id)
    if (threadIds.length === 0) {
      result.ecoles_traitees++
      result.par_ecole.push({ ecole: ecole.nom, threads_supprimes: 0 })
      continue
    }

    // 2. Compter les messages (pour le rapport)
    const { count: nbMsg } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('thread_id', threadIds)

    // 3. Cascade : messages → thread_participants → threads
    await supabaseAdmin.from('messages').delete().in('thread_id', threadIds)
    await supabaseAdmin.from('thread_participants').delete().in('thread_id', threadIds)
    const { error: errDel } = await supabaseAdmin
      .from('message_threads')
      .delete()
      .in('id', threadIds)

    if (errDel) {
      result.erreurs.push(`${ecole.nom} delete threads : ${errDel.message}`)
      continue
    }

    result.ecoles_traitees++
    result.threads_supprimes += threadIds.length
    result.messages_supprimes += nbMsg || 0
    result.par_ecole.push({
      ecole: ecole.nom,
      duree_jours: duree,
      cutoff,
      threads_supprimes: threadIds.length,
      messages_supprimes: nbMsg || 0,
    })
  }

  return NextResponse.json({ ok: true, today: new Date().toISOString().split('T')[0], ...result })
}
