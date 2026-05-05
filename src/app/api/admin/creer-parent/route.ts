import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, password, familleId, ecoleId } = await req.json()

    if (!email || !password || !familleId || !ecoleId) {
      return NextResponse.json({ error: 'Tous les champs sont obligatoires' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérifier que l'appelant est admin/super_admin
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single()

    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Vérifier si un compte existe déjà avec cet email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email === email)

    if (existing) {
      // Le compte existe déjà — on met juste à jour le profil
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
        id: existing.id,
        role: 'parent',
        famille_id: familleId,
        ecole_id: ecoleId,
      })
      if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

      return NextResponse.json({
        success: true,
        userId: existing.id,
        existed: true,
        message: `Compte existant lié à la famille`,
      })
    }

    // Créer le compte
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }

    // Créer le profil parent lié à la famille
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id,
      role: 'parent',
      famille_id: familleId,
      ecole_id: ecoleId,
    })
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    // Logger
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: caller.id,
      ecole_id: ecoleId,
      action: 'parent_cree',
      details: { email, famille_id: familleId },
    })

    return NextResponse.json({
      success: true,
      userId: newUser.user.id,
      existed: false,
      message: `Compte parent créé pour ${email}`,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
