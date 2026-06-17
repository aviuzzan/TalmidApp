import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Création d'un compte professeur :
 * - Crée le user Supabase Auth via admin.createUser (sans envoyer l'email Supabase EN)
 * - Génère un lien de reset password via admin.generateLink(type:'recovery')
 * - Envoie un email FR chaleureux custom via sendEmail (SMTP Gmail Workspace)
 * - Upsert profile + professeurs + assignations classes
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function buildInviteEmail(prenom: string, ecoleNom: string, link: string): string {
  const p = escapeHtml(prenom)
  const e = escapeHtml(ecoleNom)
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Bienvenue</title></head>',
    '<body style="margin:0;padding:0;background:#F0F4FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1E293B;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F0F4FA;padding:32px 16px;"><tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">',
    '<tr><td style="padding:36px 36px 8px;">',
    '<div style="font-size:14px;color:#64748B;margin-bottom:6px;">' + e + '</div>',
    '<h1 style="font-size:24px;font-weight:700;color:#1E293B;margin:0 0 16px;">Bonjour ' + p + ',</h1>',
    '<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;">Bienvenue dans l\'équipe pédagogique de <strong>' + e + '</strong> !</p>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 22px;">Pour activer votre accès à <strong>TalmidApp</strong> et consulter vos classes, vos emplois du temps et vos élèves, cliquez sur le bouton ci-dessous et choisissez votre mot de passe.</p>',
    '<div style="text-align:center;margin:30px 0;"><a href="' + link + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Activer mon compte</a></div>',
    '<p style="font-size:13px;line-height:1.6;color:#64748B;margin:0 0 6px;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>',
    '<p style="font-size:12px;color:#94A3B8;word-break:break-all;margin:0 0 22px;">' + link + '</p>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 8px;">À très bientôt !</p>',
    '<p style="font-size:14px;line-height:1.6;color:#1E293B;margin:0;font-weight:600;">L\'équipe ' + e + '</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 36px 28px;border-top:1px solid #F1F5F9;background:#FAFAFB;">',
    '<p style="font-size:11px;color:#94A3B8;line-height:1.5;margin:0;">Ce message vous a été envoyé suite à votre intégration dans l\'équipe enseignante. Si vous n\'attendiez pas cet email, vous pouvez l\'ignorer ou contacter votre administration.</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join('')
}

export async function POST(req: NextRequest) {
  try {
    const { prenom, nom, email, telephone, ecoleId, classeIds, matieres } = await req.json()

    if (!prenom || !nom || !email || !ecoleId) {
      return NextResponse.json({ error: 'prenom, nom, email, ecoleId requis' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { data: ecoleRec } = await supabaseAdmin
      .from('ecoles').select('nom').eq('id', ecoleId).single()
    const ecoleNom = ecoleRec?.nom || 'votre école'

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const redirectTo = baseUrl + '/auth/set-password?invited=1'

    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let userId: string
    let inviteLink: string | null = null
    let invited = false

    if (existing) {
      userId = existing.id
      const hasPassword = (existing.user_metadata as any)?.password_set
      if (!hasPassword) {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery', email, options: { redirectTo },
        })
        inviteLink = linkData?.properties?.action_link || null
        invited = true
      }
    } else {
      const randomPwd = 'Tmp!' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase()
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password: randomPwd, email_confirm: true,
        user_metadata: { role: 'teacher', ecole_id: ecoleId, prenom, nom },
      })
      if (createErr || !created?.user) {
        return NextResponse.json({ error: createErr?.message || 'Erreur création user' }, { status: 500 })
      }
      userId = created.user.id

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo },
      })
      if (linkErr || !linkData?.properties?.action_link) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
        return NextResponse.json({ error: linkErr?.message || 'Impossible de générer le lien' }, { status: 500 })
      }
      inviteLink = linkData.properties.action_link
      invited = true
    }

    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: userId, role: 'teacher', ecole_id: ecoleId, prenom, nom,
    })
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    const { data: existingProf } = await supabaseAdmin
      .from('professeurs').select('id').eq('profile_id', userId).maybeSingle()

    let profId: string
    if (existingProf?.id) {
      profId = existingProf.id
      await supabaseAdmin.from('professeurs').update({
        prenom, nom, email, telephone: telephone || null, statut: 'actif',
      }).eq('id', profId)
    } else {
      const { data: prof, error: profErr } = await supabaseAdmin.from('professeurs').insert({
        profile_id: userId, ecole_id: ecoleId,
        prenom, nom, email, telephone: telephone || null, statut: 'actif',
      }).select().single()
      if (profErr || !prof) {
        return NextResponse.json({ error: profErr?.message || 'Erreur création prof' }, { status: 500 })
      }
      profId = prof.id
    }

    if (Array.isArray(classeIds)) {
      await supabaseAdmin.from('professeur_classes').delete().eq('professeur_id', profId)
      if (classeIds.length > 0) {
        const rows = classeIds.map((cid: string) => ({
          professeur_id: profId, classe_id: cid,
          matieres: Array.isArray(matieres) ? matieres : [],
        }))
        await supabaseAdmin.from('professeur_classes').insert(rows)
      }
    }

    let emailSent = false
    let emailError: string | undefined
    if (invited && inviteLink) {
      if (!isEmailConfigured()) {
        emailError = 'SMTP non configuré'
      } else {
        const res = await sendEmail({
          fromName: ecole?.nom || 'TalmidApp',
          to: { email, name: prenom + ' ' + nom },
          subject: 'Bienvenue dans l\'équipe pédagogique de ' + ecoleNom,
          html: buildInviteEmail(prenom, ecoleNom, inviteLink),
        })
        emailSent = res.ok
        emailError = res.error
      }
    }

    return NextResponse.json({
      success: true,
      professeurId: profId,
      userId,
      invited,
      emailSent,
      emailError,
      message: invited
        ? (emailSent ? 'Invitation envoyée à ' + email : 'Compte créé. Lien : ' + inviteLink)
        : 'Compte existant lié au prof',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
