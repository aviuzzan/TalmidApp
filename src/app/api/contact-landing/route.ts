import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * POST /api/contact-landing
 * Body: { email, school }
 *
 * Reçoit les demandes de contact depuis la landing page publique et envoie
 * un email vers contact@talmidapp.fr (ou l'adresse configurée).
 * Le visiteur reçoit toujours un succès UI (non bloquant si le serveur a un souci d'email).
 */
export async function POST(req: NextRequest) {
  try {
    const { email, school } = await req.json()
    const cleanEmail = String(email || '').trim()
    const cleanSchool = String(school || '').trim()

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Email invalide' }, { status: 400 })
    }

    if (!isEmailConfigured()) {
      // Pas d'erreur visiteur si la config email manque côté serveur
      console.warn('[contact-landing] Email service non configuré, demande non envoyée:', { email: cleanEmail, school: cleanSchool })
      return NextResponse.json({ ok: true, warning: 'Email service not configured' })
    }

    const to = process.env.CONTACT_LANDING_TO || process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || ''
    if (!to) {
      return NextResponse.json({ ok: true, warning: 'No recipient configured' })
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1E293B">
        <h2 style="color:#2563EB;margin-bottom:8px">📨 Nouvelle demande de contact TalmidApp</h2>
        <p style="color:#64748B;margin-top:0">Depuis le formulaire de la landing page publique.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px">
          <tr><td style="padding:10px 14px;font-weight:700;width:140px;background:#F8FAFC">Email</td><td style="padding:10px 14px"><a href="mailto:${cleanEmail}">${cleanEmail}</a></td></tr>
          <tr><td style="padding:10px 14px;font-weight:700;background:#F8FAFC">École / Organisation</td><td style="padding:10px 14px">${cleanSchool || '<em>Non renseigné</em>'}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:700;background:#F8FAFC">Date</td><td style="padding:10px 14px">${new Date().toLocaleString('fr-FR')}</td></tr>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#94A3B8">Pour répondre, utilisez "Répondre" — le Reply-To est configuré sur l'email du visiteur.</p>
      </div>
    `

    const res = await sendEmail({
      to: { email: to },
      subject: `[TalmidApp] Demande de contact — ${cleanSchool || cleanEmail}`,
      html,
      replyTo: cleanEmail,
    })

    if (!res.ok) {
      console.warn('[contact-landing] sendEmail failed:', res.error)
      return NextResponse.json({ ok: true, warning: res.error })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[contact-landing] error:', e)
    return NextResponse.json({ ok: true, warning: e?.message || 'Server error' })
  }
}
