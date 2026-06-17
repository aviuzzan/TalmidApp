import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Supprime un compte parent (auth + profile) sans toucher à la famille.
 *
 * Body :
 *   { profileId: string, ecoleId: string }
 *
 * Auth : Bearer token d'un admin de l'école.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Vérif appelant = admin de l'école
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(auth)
    if (userErr || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const body = await req.json()
    const { profileId, ecoleId } = body
    if (!profileId || !ecoleId) {
      return NextResponse.json({ error: 'profileId et ecoleId requis' }, { status: 400 })
    }

    const { data: caller } = await supabaseAdmin
      .from('profiles')
      .select('role, ecole_id')
      .eq('id', user.id)
      .single()
    const isSuper = caller?.role === 'super_admin'
    const isAdminEcole = caller?.role === 'admin' && caller?.ecole_id === ecoleId
    if (!isSuper && !isAdminEcole) {
      return NextResponse.json({ error: 'Accès refusé (admin école requis)' }, { status: 403 })
    }

    // Vérif le profile cible appartient bien à un parent de cette école
    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('id, role, ecole_id, famille_id')
      .eq('id', profileId)
      .single()
    if (!target) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
    if (target.role !== 'parent') {
      return NextResponse.json({ error: 'Ce compte n\'est pas un compte parent' }, { status: 400 })
    }
    if (target.ecole_id !== ecoleId) {
      return NextResponse.json({ error: 'Ce compte n\'appartient pas à cette école' }, { status: 403 })
    }

    // 1. Supprimer le profile (la famille reste intacte)
    const { error: delProfileErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', profileId)
    if (delProfileErr) {
      return NextResponse.json({ error: 'Erreur suppression profile : ' + delProfileErr.message }, { status: 500 })
    }

    // 2. Supprimer l'auth user (toute l'authentification)
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(profileId)
    if (delAuthErr) {
      return NextResponse.json({
        warning: 'Profile supprimé mais erreur côté auth : ' + delAuthErr.message,
        partial: true,
      })
    }

    // Audit log best-effort
    try {
      await supabaseAdmin.from('audit_log').insert({
        ecole_id: ecoleId,
        acteur_profile_id: user.id,
        action: 'supprimer_compte_parent',
        details: { compte_supprime: profileId, famille_id: target.famille_id },
      })
    } catch {}

    return NextResponse.json({ success: true, message: 'Compte parent supprimé' })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erreur inconnue' }, { status: 500 })
  }
}
