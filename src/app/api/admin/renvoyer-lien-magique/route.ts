import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

/**
 * Renvoie un email "Bienvenue parent" avec un nouveau lien magique
 * à un parent qui n'a pas reçu ou pas trouvé le premier email.
 *
 * Body : { email, familleId, ecoleId }
 */
export async function POST(req: NextRequest) {
  try {
    const { email, familleId, ecoleId } = await req.json()
    if (!email || !familleId || !ecoleId) {
      return NextResponse.json({ error: 'email, familleId et ecoleId requis' }, { status: 400 })
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

    // Vérifier que ce parent existe bien
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email === email)
    if (!existing) {
      return NextResponse.json({ error: 'Aucun compte trouvé avec cet email' }, { status: 404 })
    }

    // 1. Générer un nouveau lien magique (recovery) avec redirection vers /auth/set-password
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: baseUrl + '/auth/set-password?invited=1' },
    })
    const lienMagique = linkData?.properties?.action_link || ''
    if (linkErr || !lienMagique) {
      return NextResponse.json({ error: linkErr?.message || 'Lien magique non généré' }, { status: 500 })
    }

    // 2. Charger le template "Bienvenue parent"
    const { data: tpl } = await supabaseAdmin
      .from('email_templates')
      .select('id, sujet, contenu_html')
      .eq('nom', 'Bienvenue parent')
      .eq('actif', true)
      .maybeSingle()
    if (!tpl) {
      return NextResponse.json({ error: 'Template "Bienvenue parent" introuvable' }, { status: 500 })
    }

    // 3. Variables famille + école
    const { data: famille } = await supabaseAdmin
      .from('familles').select('nom, parent1_prenom, parent1_nom, parent2_prenom')
      .eq('id', familleId).maybeSingle()
    const { data: ecole } = await supabaseAdmin
      .from('ecoles').select('nom').eq('id', ecoleId).maybeSingle()

    const variables: Record<string, string> = {
      '{{lien_magique}}': lienMagique,
      '{{nom_famille}}': famille?.nom || '',
      '{{prenom_parent1}}': (famille as any)?.parent1_prenom || '',
      '{{nom_parent1}}': (famille as any)?.parent1_nom || '',
      '{{prenom_parent2}}': (famille as any)?.parent2_prenom || '',
    }
    const remplacer = (s: string) => {
      let out = s
      for (const [k, v] of Object.entries(variables)) out = out.split(k).join(v)
      return out
    }
    const sujet = remplacer(tpl.sujet)
    const html = remplacer(tpl.contenu_html)

    // 4. Envoyer
    const emailResult = await sendEmail({
      to: { email },
      subject: sujet,
      html,
      fromName: ecole?.nom || 'TalmidApp',
    })

    // 5. Log
    await supabaseAdmin.from('email_logs').insert({
      template_id: tpl.id,
      famille_id: familleId,
      destinataire: email,
      sujet,
      statut: emailResult.ok ? 'envoye' : 'echec',
      erreur: emailResult.ok ? null : (emailResult.error || 'inconnu').slice(0, 500),
      envoye_par: caller.id,
      date_envoi: new Date().toISOString(),
    })

    await supabaseAdmin.from('admin_logs').insert({
      admin_id: caller.id,
      ecole_id: ecoleId,
      action: 'renvoi_lien_magique',
      details: { email, famille_id: familleId, ok: emailResult.ok },
    })

    if (!emailResult.ok) {
      return NextResponse.json({ error: emailResult.error || 'Envoi échoué' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Email de réactivation renvoyé à ${email}`,
      canal: emailResult.canal,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
