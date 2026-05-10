import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Notification email lors d'un nouveau message ou d'une réponse dans un thread.
 *
 * Body POST :
 *   { thread_id: string, type: 'nouveau' | 'reponse' }
 *
 * Logique destinataires :
 *  - Si le dernier message vient d'un parent → notifier tous les agents du service.
 *  - Si le dernier message vient d'un agent ET le thread est lié à une famille → notifier les parents.
 *  - Si le dernier message vient d'un agent ET thread interne (sans famille) → notifier les autres agents du service.
 */
export async function POST(req: NextRequest) {
  try {
    const { thread_id, type } = await req.json()
    if (!thread_id) return NextResponse.json({ error: 'thread_id manquant' }, { status: 400 })
    if (!isEmailConfigured()) return NextResponse.json({ skipped: true, reason: 'SMTP non configuré' })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Récup thread + dernière message + service + famille + ecole
    const [{ data: thread }, { data: lastMsgs }] = await Promise.all([
      supabase
        .from('message_threads')
        .select('id, sujet, ecole_id, service_id, famille_id, ecoles(nom, slug), services(nom), familles(parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email)')
        .eq('id', thread_id)
        .single(),
      supabase
        .from('messages')
        .select('id, contenu, created_at, auteur_profile_id, profiles:auteur_profile_id(role, prenom, nom)')
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    if (!thread) return NextResponse.json({ error: 'Thread introuvable' }, { status: 404 })
    const lastMsg = lastMsgs?.[0]
    if (!lastMsg) return NextResponse.json({ skipped: true, reason: 'Aucun message' })

    const auteur = (lastMsg as any).profiles
    const auteurRole = auteur?.role
    const auteurNom = `${auteur?.prenom ?? ''} ${auteur?.nom ?? ''}`.trim() || (auteurRole === 'parent' ? 'Famille' : 'École')
    const ecoleNom = (thread as any).ecoles?.nom || 'École'
    const ecoleSlug = (thread as any).ecoles?.slug || ''
    const serviceNom = (thread as any).services?.nom || 'Service'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'

    const dests: { email: string; name?: string; threadUrl: string }[] = []

    if (auteurRole === 'parent') {
      // Auteur = parent → notifier les agents du service
      const { data: agents } = await supabase
        .from('service_agents')
        .select('profile_id, profiles(prenom, nom)')
        .eq('service_id', thread.service_id || '')
      const threadUrl = `${baseUrl}/${ecoleSlug}/messages/${thread_id}`
      for (const ag of agents || []) {
        // Récup email via auth.admin.getUserById
        const { data: userData } = await supabase.auth.admin.getUserById(ag.profile_id)
        const email = userData?.user?.email
        if (email) {
          const p = (ag as any).profiles
          dests.push({ email, name: `${p?.prenom ?? ''} ${p?.nom ?? ''}`.trim(), threadUrl })
        }
      }
    } else {
      // Auteur = agent
      if (thread.famille_id) {
        // Notifier les parents
        const fam = (thread as any).familles
        const threadUrl = `${baseUrl}/portail/messages/${thread_id}`
        if (fam?.parent1_email) dests.push({ email: fam.parent1_email, name: `${fam.parent1_prenom ?? ''} ${fam.parent1_nom ?? ''}`.trim(), threadUrl })
        if (fam?.parent2_email && fam.parent2_email !== fam.parent1_email) dests.push({ email: fam.parent2_email, name: `${fam.parent2_prenom ?? ''} ${fam.parent2_nom ?? ''}`.trim(), threadUrl })
      } else {
        // Thread interne → notifier les autres agents du service
        const { data: agents } = await supabase
          .from('service_agents')
          .select('profile_id, profiles(prenom, nom)')
          .eq('service_id', thread.service_id || '')
          .neq('profile_id', lastMsg.auteur_profile_id)
        const threadUrl = `${baseUrl}/${ecoleSlug}/messages/${thread_id}`
        for (const ag of agents || []) {
          const { data: userData } = await supabase.auth.admin.getUserById(ag.profile_id)
          const email = userData?.user?.email
          if (email) {
            const p = (ag as any).profiles
            dests.push({ email, name: `${p?.prenom ?? ''} ${p?.nom ?? ''}`.trim(), threadUrl })
          }
        }
      }
    }

    if (!dests.length) return NextResponse.json({ skipped: true, reason: 'Aucun destinataire' })

    const subject = type === 'nouveau' ? `[${ecoleNom}] Nouvelle conversation : ${thread.sujet}` : `[${ecoleNom}] Nouveau message : ${thread.sujet}`
    const extrait = (lastMsg.contenu || '').substring(0, 250) + ((lastMsg.contenu || '').length > 250 ? '…' : '')

    let sent = 0
    for (const d of dests) {
      const html = `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fff;">
          <div style="background: #2563EB; color: #fff; padding: 16px 22px; border-radius: 8px 8px 0 0;">
            <div style="font-size: 12px; opacity: 0.85; letter-spacing: 0.05em;">💬 MESSAGERIE — ${ecoleNom.toUpperCase()}</div>
            <div style="font-size: 18px; font-weight: 700; margin-top: 4px;">${type === 'nouveau' ? 'Nouvelle conversation' : 'Nouveau message'}</div>
          </div>
          <div style="background: #F8FAFC; padding: 18px 22px; border: 1px solid #E2E8F0; border-top: none;">
            <div style="font-size: 13px; color: #64748B; margin-bottom: 8px;">Service : <strong>${serviceNom}</strong></div>
            <div style="font-size: 16px; font-weight: 700; color: #1E293B; margin-bottom: 12px;">${thread.sujet}</div>
            <div style="background: #fff; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px 14px;">
              <div style="font-size: 11px; color: #94A3B8; font-weight: 600; margin-bottom: 6px;">${auteurNom} ${auteurRole === 'parent' ? '(famille)' : '(école)'}</div>
              <div style="font-size: 14px; color: #1E293B; white-space: pre-wrap; line-height: 1.5;">${extrait.replace(/</g, '&lt;')}</div>
            </div>
          </div>
          <div style="background: #fff; padding: 22px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
            <a href="${d.threadUrl}" style="background: #2563EB; color: #fff; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 700; display: inline-block;">Voir la conversation</a>
            <div style="font-size: 11px; color: #94A3B8; margin-top: 14px;">Vous pouvez répondre directement depuis votre espace TalmidApp.</div>
          </div>
        </div>
      `
      const res = await sendEmail({ to: { email: d.email, name: d.name }, subject, html })
      if (res.ok) sent++
    }

    return NextResponse.json({ ok: true, sent, total: dests.length })
  } catch (e: any) {
    console.error('notify-message error:', e)
    return NextResponse.json({ error: e?.message || 'Erreur ' }, { status: 500 })
  }
}
