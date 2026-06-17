import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Envoi d'un lien de demande d'inscription a un parent prospect.
 * - L'admin saisit l'email du parent + l'exercice concerne
 * - On genere un token, on cree (ou reutilise) une ligne demandes_inscription (statut 'envoye')
 * - On envoie un email custom avec le lien public /inscription/[token]
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function buildLinkEmail(ecoleNom: string, link: string): string {
  const e = escapeHtml(ecoleNom)
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Demande d\'inscription</title></head>',
    '<body style="margin:0;padding:0;background:#F0F4FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1E293B;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F0F4FA;padding:32px 16px;"><tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">',
    '<tr><td style="padding:36px 36px 8px;">',
    '<div style="font-size:14px;color:#64748B;margin-bottom:6px;">' + e + '</div>',
    '<h1 style="font-size:24px;font-weight:700;color:#1E293B;margin:0 0 16px;">Demande d\'inscription</h1>',
    '<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;">Bonjour,</p>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 22px;"><strong>' + e + '</strong> vous invite a completer la demande d\'inscription de votre enfant. Le formulaire ne prend que quelques minutes, et aucun compte n\'est necessaire pour le remplir.</p>',
    '<div style="text-align:center;margin:30px 0;"><a href="' + link + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Remplir la demande d\'inscription</a></div>',
    '<p style="font-size:13px;line-height:1.6;color:#64748B;margin:0 0 6px;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>',
    '<p style="font-size:12px;color:#94A3B8;word-break:break-all;margin:0 0 22px;">' + link + '</p>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 8px;">Une fois votre demande envoyee, l\'etablissement l\'examinera et vous recevrez un email pour activer votre espace famille.</p>',
    '<p style="font-size:14px;line-height:1.6;color:#1E293B;margin:0;font-weight:600;">L\'equipe ' + e + '</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 36px 28px;border-top:1px solid #F1F5F9;background:#FAFAFB;">',
    '<p style="font-size:11px;color:#94A3B8;line-height:1.5;margin:0;">Ce message vous a ete envoye par l\'administration de ' + e + '. Si vous n\'attendiez pas cet email, vous pouvez l\'ignorer.</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join('')
}

export async function POST(req: NextRequest) {
  try {
    const { email, ecoleId, exerciceId } = await req.json()
    if (!email || !ecoleId || !exerciceId) {
      return NextResponse.json({ error: 'email, ecoleId, exerciceId requis' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authToken)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role, ecole_id').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }
    if (callerProfile?.role === 'admin' && callerProfile?.ecole_id !== ecoleId) {
      return NextResponse.json({ error: 'Acces refuse a cette ecole' }, { status: 403 })
    }

    const { data: exercice } = await supabaseAdmin
      .from('exercices').select('id, code').eq('id', exerciceId).eq('ecole_id', ecoleId).single()
    if (!exercice) return NextResponse.json({ error: 'Exercice introuvable' }, { status: 400 })

    const { data: ecoleRec } = await supabaseAdmin
      .from('ecoles').select('nom').eq('id', ecoleId).single()
    const ecoleNom = ecoleRec?.nom || 'votre ecole'

    const inscToken = randomBytes(32).toString('hex')

    const { data: existing } = await supabaseAdmin
      .from('demandes_inscription')
      .select('id')
      .eq('ecole_id', ecoleId)
      .eq('exercice_id', exerciceId)
      .eq('email_invite', email)
      .eq('statut', 'envoye')
      .maybeSingle()

    let demandeId: string
    if (existing?.id) {
      const { error: updErr } = await supabaseAdmin
        .from('demandes_inscription')
        .update({ token: inscToken, envoye_le: new Date().toISOString(), envoye_par: caller.id })
        .eq('id', existing.id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
      demandeId = existing.id
    } else {
      const { data: created, error: insErr } = await supabaseAdmin
        .from('demandes_inscription')
        .insert({
          ecole_id: ecoleId,
          exercice_id: exerciceId,
          annee_scolaire: exercice.code,
          token: inscToken,
          statut: 'envoye',
          email_invite: email,
          envoye_par: caller.id,
        })
        .select('id')
        .single()
      if (insErr || !created) {
        return NextResponse.json({ error: insErr?.message || 'Erreur creation demande' }, { status: 500 })
      }
      demandeId = created.id
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const link = baseUrl + '/inscription/' + inscToken

    let emailSent = false
    let emailError: string | undefined
    if (!isEmailConfigured()) {
      emailError = 'SMTP non configure'
    } else {
      const res = await sendEmail({
        fromName: ecoleRec?.nom || 'TalmidApp',
        to: { email },
        subject: 'Demande d\'inscription - ' + ecoleNom,
        html: buildLinkEmail(ecoleNom, link),
      })
      emailSent = res.ok
      emailError = res.error
    }

    try {
      await supabaseAdmin.from('admin_logs').insert({
        admin_id: caller.id,
        ecole_id: ecoleId,
        action: 'envoi_lien_inscription',
        details: { email, demande_id: demandeId, exercice_id: exerciceId, email_sent: emailSent },
      })
    } catch {}
    return NextResponse.json({
      success: true,
      demandeId,
      link,
      emailSent,
      emailError,
      message: emailSent ? 'Lien envoye a ' + email : 'Lien cree. ' + (emailError || ''),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
