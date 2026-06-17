import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, isEmailConfigured } from '@/lib/email'

/**
 * Invitation groupee des familles : cree les comptes parents pour toutes les
 * familles de l'ecole qui n'en ont pas encore, et envoie l'email de bienvenue.
 *
 * Traitement par LOTS : le client appelle cette route en boucle jusqu'a `done`.
 * Chaque appel traite jusqu'a `batchSize` familles (defaut 8).
 */

export const maxDuration = 60

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function buildBienvenueEmail(prenom: string, ecoleNom: string, link: string): string {
  const p = escapeHtml(prenom || '')
  const e = escapeHtml(ecoleNom)
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Bienvenue</title></head>',
    '<body style="margin:0;padding:0;background:#F0F4FA;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1E293B;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F0F4FA;padding:32px 16px;"><tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">',
    '<tr><td style="padding:36px 36px 8px;">',
    '<div style="font-size:14px;color:#64748B;margin-bottom:6px;">' + e + '</div>',
    '<h1 style="font-size:24px;font-weight:700;color:#1E293B;margin:0 0 16px;">Bonjour ' + p + ',</h1>',
    '<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;"><strong>' + e + '</strong> met a votre disposition un espace famille en ligne.</p>',
    '<p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 22px;">Activez votre <strong>espace famille</strong> pour suivre la scolarite de vos enfants, gerer vos inscriptions, consulter vos factures et vos documents. Cliquez sur le bouton ci-dessous et choisissez votre mot de passe.</p>',
    '<div style="text-align:center;margin:30px 0;"><a href="' + link + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">Activer mon espace famille</a></div>',
    '<p style="font-size:13px;line-height:1.6;color:#64748B;margin:0 0 6px;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>',
    '<p style="font-size:12px;color:#94A3B8;word-break:break-all;margin:0 0 22px;">' + link + '</p>',
    '<p style="font-size:14px;line-height:1.6;color:#1E293B;margin:0;font-weight:600;">L\'equipe ' + e + '</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 36px 28px;border-top:1px solid #F1F5F9;background:#FAFAFB;">',
    '<p style="font-size:11px;color:#94A3B8;line-height:1.5;margin:0;">Ce message vous a ete envoye par l\'administration de ' + e + '.</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join('')
}

export async function POST(req: NextRequest) {
  try {
    const { ecoleId, batchSize } = await req.json()
    if (!ecoleId) return NextResponse.json({ error: 'ecoleId requis' }, { status: 400 })
    const limit = Math.min(Math.max(Number(batchSize) || 8, 1), 20)

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

    const { data: ecoleRec } = await supabaseAdmin
      .from('ecoles').select('nom').eq('id', ecoleId).single()
    const ecoleNom = ecoleRec?.nom || 'votre ecole'

    // Familles de l'ecole + familles deja dotees d'un compte parent
    const [{ data: familles }, { data: parentProfiles }] = await Promise.all([
      supabaseAdmin.from('familles')
        .select('id, nom, parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email, situation_maritale')
        .eq('ecole_id', ecoleId),
      supabaseAdmin.from('profiles')
        .select('famille_id, parent_slot').eq('ecole_id', ecoleId).eq('role', 'parent'),
    ])
    // Slots déjà pourvus : "familleId:parent1" / "familleId:parent2"
    const slotsPris = new Set((parentProfiles || []).map((p: any) => `${p.famille_id}:${p.parent_slot || 'parent1'}`))
    // Cibles d'invitation : parent1 toujours, parent2 uniquement pour les familles séparées
    const cibles: { f: any; slot: 'parent1' | 'parent2'; email: string; prenom: string; nom: string }[] = []
    for (const f of (familles || []) as any[]) {
      if (f.parent1_email && !slotsPris.has(`${f.id}:parent1`)) {
        cibles.push({ f, slot: 'parent1', email: String(f.parent1_email).trim(), prenom: f.parent1_prenom, nom: f.parent1_nom })
      }
      const sep = f.situation_maritale === 'divorce' || f.situation_maritale === 'separe'
      if (sep && f.parent2_email && f.parent2_email !== f.parent1_email && !slotsPris.has(`${f.id}:parent2`)) {
        cibles.push({ f, slot: 'parent2', email: String(f.parent2_email).trim(), prenom: f.parent2_prenom, nom: f.parent2_nom })
      }
    }
    const sansEmail = (familles || []).filter((f: any) => !f.parent1_email && !slotsPris.has(`${f.id}:parent1`)).length

    const lot = cibles.slice(0, limit)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const redirectTo = baseUrl + '/auth/set-password?invited=1'
    const emailOk = isEmailConfigured()

    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const usersByEmail = new Map<string, string>()
    for (const u of existingList?.users || []) {
      if (u.email) usersByEmail.set(u.email.toLowerCase(), u.id)
    }

    let invited = 0
    const erreurs: string[] = []

    for (const c of lot) {
      const f = c.f
      const email = c.email
      try {
        let userId = usersByEmail.get(email.toLowerCase()) || null
        if (!userId) {
          const randomPwd = 'Tmp!' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase()
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email, password: randomPwd, email_confirm: true,
            user_metadata: { role: 'parent', ecole_id: ecoleId },
          })
          if (createErr || !created?.user) {
            erreurs.push(`${f.nom} (${email}) : ${createErr?.message || 'creation echouee'}`)
            continue
          }
          userId = created.user.id
        }

        const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
          id: userId, role: 'parent', ecole_id: ecoleId, famille_id: f.id,
          parent_slot: c.slot,
          prenom: c.prenom || null, nom: c.nom || null, email,
        })
        if (profErr) {
          erreurs.push(`${f.nom} (${email}) : ${profErr.message}`)
          continue
        }

        if (emailOk) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery', email, options: { redirectTo },
          })
          const inviteLink = linkData?.properties?.action_link
          if (inviteLink) {
            await sendEmail({ fromName: ecole?.nom || 'TalmidApp',
              to: { email, name: `${c.prenom || ''} ${c.nom || ''}`.trim() },
              subject: 'Bienvenue sur le portail famille - ' + ecoleNom,
              html: buildBienvenueEmail(c.prenom, ecoleNom, inviteLink),
            })
          }
        }
        invited++
      } catch (e: any) {
        erreurs.push(`${f.nom} (${email}) : ${e.message || 'erreur'}`)
      }
    }

    const restant = cibles.length - lot.length
    return NextResponse.json({
      success: true,
      processed: lot.length,
      invited,
      restant,
      done: restant === 0,
      sansEmail,
      erreurs,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
