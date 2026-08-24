import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

/**
 * POST /api/demande-demo  (aaaa2 — public, sans auth)
 * Formulaire « Demander une démo » des vitrines talmidapp.fr et yeter.fr.
 * Envoie un email à admin@talmidapp.fr avec Reply-To = le demandeur (répondre
 * au mail répond directement au prospect). Anti-robots : champ pot de miel
 * « website » — s'il est rempli, on répond OK sans rien envoyer.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })

    if (String(body.website || '').trim()) return NextResponse.json({ ok: true })

    const nom = String(body.nom || '').trim().slice(0, 120)
    const etablissement = String(body.etablissement || '').trim().slice(0, 160)
    const email = String(body.email || '').trim().slice(0, 160)
    const telephone = String(body.telephone || '').trim().slice(0, 40)
    const message = String(body.message || '').trim().slice(0, 2000)
    const produit = body.produit === 'yeter' ? 'Yeter' : 'TalmidApp'

    if (!nom || !etablissement || !email) {
      return NextResponse.json({ error: 'Merci de renseigner votre nom, votre établissement et votre email.' }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
    }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const ligne = (label: string, valeur: string) =>
      valeur ? `<tr><td style="padding: 6px 14px 6px 0; color: #64748B; white-space: nowrap;">${label}</td><td style="padding: 6px 0; font-weight: bold;">${esc(valeur)}</td></tr>` : ''

    const res = await sendEmail({
      to: { email: 'admin@talmidapp.fr', name: 'TalmidApp' },
      replyTo: email,
      subject: `Demande de demo ${produit} — ${etablissement}`,
      html: [
        '<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1E293B; line-height: 1.6;">',
        `  <h2 style="color: ${produit === 'Yeter' ? '#EC4899' : '#2563EB'};">Nouvelle demande de démo ${produit}</h2>`,
        '  <table style="border-collapse: collapse; font-size: 14px;">',
        ligne('Nom', nom),
        ligne('Établissement', etablissement),
        ligne('Email', email),
        ligne('Téléphone', telephone),
        '  </table>',
        message ? `<p style="background: #F1F5F9; border-radius: 8px; padding: 12px 16px; font-size: 14px; white-space: pre-wrap;">${esc(message)}</p>` : '',
        '  <p style="font-size: 12px; color: #94A3B8;">Envoyé depuis le formulaire de la vitrine. Répondre à ce mail répond directement au demandeur (Reply-To).</p>',
        '</div>',
      ].join('\n'),
    })
    if (!res.ok) {
      return NextResponse.json({ error: "L'envoi a échoué, réessayez dans quelques minutes." }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inattendue' }, { status: 500 })
  }
}
