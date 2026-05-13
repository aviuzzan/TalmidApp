import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendPush } from '@/lib/web-push-server'

export const runtime = 'nodejs'

/**
 * POST /api/push/send
 * Body: {
 *   ecoleId: string,
 *   cibleType: 'unitaire' | 'classe' | 'famille' | 'tous',
 *   cibleId?: string,
 *   titre: string,
 *   body: string,
 *   url?: string,
 * }
 * Admin uniquement. Envoie push notif aux profils ciblés (multi-devices).
 */
export async function POST(req: NextRequest) {
  try {
    const { ecoleId, cibleType, cibleId, titre, body, url } = await req.json()
    if (!ecoleId || !cibleType || !titre || !body) {
      return NextResponse.json({ error: 'ecoleId, cibleType, titre, body requis' }, { status: 400 })
    }

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: caller } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(caller?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Détermine les profile_ids cibles
    let profileIds: string[] = []
    if (cibleType === 'unitaire') {
      if (!cibleId) return NextResponse.json({ error: 'cibleId requis' }, { status: 400 })
      profileIds = [cibleId]
    } else if (cibleType === 'famille') {
      if (!cibleId) return NextResponse.json({ error: 'cibleId requis' }, { status: 400 })
      const { data: ps } = await supabaseAdmin.from('profiles').select('id').eq('famille_id', cibleId).eq('ecole_id', ecoleId)
      profileIds = (ps || []).map((p: any) => p.id)
    } else if (cibleType === 'classe') {
      if (!cibleId) return NextResponse.json({ error: 'cibleId requis' }, { status: 400 })
      const { data: enfants } = await supabaseAdmin.from('enfants').select('famille_id').eq('classe_id', cibleId).eq('ecole_id', ecoleId)
      const famIds = [...new Set((enfants || []).map((e: any) => e.famille_id).filter(Boolean))]
      if (famIds.length > 0) {
        const { data: ps } = await supabaseAdmin.from('profiles').select('id').in('famille_id', famIds).eq('ecole_id', ecoleId)
        profileIds = (ps || []).map((p: any) => p.id)
      }
    } else if (cibleType === 'tous') {
      const { data: ps } = await supabaseAdmin.from('profiles').select('id').eq('ecole_id', ecoleId)
      profileIds = (ps || []).map((p: any) => p.id)
    } else {
      return NextResponse.json({ error: `cibleType inconnu : ${cibleType}` }, { status: 400 })
    }

    if (profileIds.length === 0) return NextResponse.json({ error: 'Aucun destinataire' }, { status: 400 })

    // Récupère subscriptions
    const { data: subs } = await supabaseAdmin
      .from('web_push_subscriptions')
      .select('id, profile_id, endpoint, p256dh, auth')
      .in('profile_id', profileIds)

    if (!subs || subs.length === 0) {
      return NextResponse.json({ error: 'Aucun device abonné aux notifications', total: 0, envoyes: 0 }, { status: 200 })
    }

    let envoyes = 0
    let echecs = 0
    const expiredEndpoints: string[] = []

    for (const sub of subs) {
      const res = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { titre, body, url, tag: 'talmidapp-' + Date.now() }
      )
      await supabaseAdmin.from('notifications_push_envoyees').insert({
        ecole_id: ecoleId,
        envoye_par: user.id,
        destinataire_profile: sub.profile_id,
        titre,
        body,
        url,
        statut: res.ok ? 'sent' : (res.expired ? 'expired' : 'failed'),
        erreur: res.error || null,
      })
      if (res.ok) envoyes++
      else echecs++
      if (res.expired) expiredEndpoints.push(sub.endpoint)
    }

    // Nettoie endpoints expirés
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin.from('web_push_subscriptions').delete().in('endpoint', expiredEndpoints)
    }

    return NextResponse.json({ total: subs.length, envoyes, echecs, expires: expiredEndpoints.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur push' }, { status: 500 })
  }
}
