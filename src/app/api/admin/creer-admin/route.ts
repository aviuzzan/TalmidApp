import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { TEMPLATES } from '@/lib/permissions'

/**
 * POST /api/admin/creer-admin
 * Body: { prenom, nom, email, ecoleId, template? }
 * - template par défaut : 'admin_principal' (toutes les permissions admin)
 * - Crée le user via inviteUserByEmail (magic link)
 * - Upsert profile role=admin + ecole_id
 * - Applique le template de permissions choisi sur l'école
 */
export async function POST(req: NextRequest) {
  try {
    const { prenom, nom, email, ecoleId, template } = await req.json()
    if (!prenom || !nom || !email || !ecoleId) {
      return NextResponse.json({ error: 'prenom, nom, email, ecoleId requis' }, { status: 400 })
    }

    const tplKey = template || 'admin_principal'
    if (!TEMPLATES[tplKey]) {
      return NextResponse.json({ error: `Template inconnu : ${tplKey}` }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérif appelant admin/super_admin
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Vérif appelant = admin principal sur cette école
    const { data: callerParam } = await supabaseAdmin
      .from('permissions_modules')
      .select('niveau')
      .eq('profile_id', caller.id)
      .eq('ecole_id', ecoleId)
      .eq('module_code', 'parametres')
      .maybeSingle()
    if (callerProfile?.role !== 'super_admin' && callerParam?.niveau !== 'admin') {
      return NextResponse.json({ error: 'Seul un admin principal peut inviter un autre admin sur cette école' }, { status: 403 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const redirectTo = `${baseUrl}/auth/set-password?invited=1`

    // Cherche un user existant
    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let userId: string
    let invited = false

    if (existing) {
      userId = existing.id
    } else {
      const { data: invited2, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { role: 'admin', ecole_id: ecoleId },
      })
      if (inviteErr || !invited2?.user) {
        return NextResponse.json({ error: inviteErr?.message || 'Erreur invitation' }, { status: 500 })
      }
      userId = invited2.user.id
      invited = true
    }

    // Upsert profile role=admin + ecole_id + prenom/nom
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: userId, role: 'admin', ecole_id: ecoleId, prenom, nom,
    })
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    // Appliquer le template de permissions
    const tpl = TEMPLATES[tplKey].permissions
    const rows = Object.entries(tpl).map(([code, niveau]) => ({
      profile_id: userId, ecole_id: ecoleId, module_code: code, niveau,
      updated_by: caller.id, updated_at: new Date().toISOString(),
    }))
    const { error: permsErr } = await supabaseAdmin.from('permissions_modules').upsert(rows)
    if (permsErr) {
      return NextResponse.json({ error: `User créé mais permissions échouées : ${permsErr.message}`, userId, invited }, { status: 500 })
    }

    // Audit log
    await supabaseAdmin.from('permissions_audit').insert({
      acteur_id: caller.id, cible_profile_id: userId, ecole_id: ecoleId,
      action: 'invite_admin',
      details: { template: tplKey, invited_by_email: invited, email },
    })

    return NextResponse.json({
      success: true,
      userId,
      invited,
      message: invited
        ? `Invitation envoyée à ${email} — il recevra un email pour définir son mot de passe.`
        : `Compte existant promu admin sur cette école.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}
