import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Cette route utilise la SERVICE ROLE KEY (côté serveur uniquement)
// À ajouter dans Vercel : SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest) {
  try {
    const { email, password, ecoleId, ecoleSlug } = await req.json()

    if (!email || !password || !ecoleId) {
      return NextResponse.json({ error: 'email, password et ecoleId obligatoires' }, { status: 400 })
    }

    // Client avec service role (droits admin complets)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérifier que l'appelant est bien super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Créer l'utilisateur Supabase Auth
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Pas besoin de confirmation email
    })

    if (createErr) {
      if (createErr.message.includes('already registered')) {
        return NextResponse.json({ error: 'Cet email est déjà utilisé.' }, { status: 409 })
      }
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }

    // Créer le profil avec rôle admin + ecole_id
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id,
      role: 'admin',
      ecole_id: ecoleId,
    })

    if (profileErr) {
      // Rollback : supprimer l'utilisateur créé
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    // Logger l'action
    await supabaseAdmin.from('admin_logs').insert({
      admin_id: caller.id,
      ecole_id: ecoleId,
      action: 'admin_ecole_cree',
      details: { email, ecole_slug: ecoleSlug },
    })

    return NextResponse.json({
      success: true,
      userId: newUser.user.id,
      message: `Compte admin créé pour ${email}`,
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
