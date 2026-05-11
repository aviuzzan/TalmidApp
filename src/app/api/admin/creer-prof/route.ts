import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

    // Vérif appelant admin
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
    const redirectTo = `${baseUrl}/auth/set-password?invited=1`

    // Cherche un user existant avec cet email
    const { data: existingList } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingList?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let userId: string
    let invited = false

    if (existing) {
      userId = existing.id
    } else {
      // Invitation par email (lien de mot de passe envoyé)
      const { data: invited2, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
         data: { role: 'teacher', ecole_id: ecoleId },
      })
      if (inviteErr || !invited2?.user) {
        return NextResponse.json({ error: inviteErr?.message || 'Erreur invitation' }, { status: 500 })
      }
      userId = invited2.user.id
      invited = true
    }

    // Upsert profile avec role teacher
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: userId, role: 'teacher', ecole_id: ecoleId, prenom, nom,
    })
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    // Créer la fiche professeur
    const { data: prof, error: profErr } = await supabaseAdmin.from('professeurs').insert({
      profile_id: userId,
      ecole_id: ecoleId,
      prenom, nom, email, telephone: telephone || null,
      statut: 'actif',
    }).select().single()
    if (profErr || !prof) {
      return NextResponse.json({ error: profErr?.message || 'Erreur création prof' }, { status: 500 })
    }

    // Assignation des classes
    if (Array.isArray(classeIds) && classeIds.length > 0) {
      const rows = classeIds.map((cid: string) => ({
        professeur_id: prof.id,
        classe_id: cid,
        matieres: Array.isArray(matieres) ? matieres : [],
      }))
      await supabaseAdmin.from('professeur_classes').insert(rows)
    }

    return NextResponse.json({
      success: true,
      professeurId: prof.id,
      userId,
      invited,
      message: invited ? `Invitation envoyée à ${email}` : `Compte existant lié au prof`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
