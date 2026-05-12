import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/supprimer-admin
 * Body: { profileId, ecoleId }
 * - Verifie que l'appelant est admin principal sur cette ecole (super_admin OK aussi)
 * - Supprime toutes les permissions_modules de la cible pour cette ecole
 * - Si la cible n'a plus aucune permission sur aucune ecole, retrograde role -> parent
 * - Audit log
 * Ne supprime PAS le user Supabase Auth (preserve l'historique).
 */
export async function POST(req: NextRequest) {
  try {
    const { profileId, ecoleId } = await req.json()
    if (!profileId || !ecoleId) {
      return NextResponse.json({ error: 'profileId, ecoleId requis' }, { status: 400 })
    }

    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    const { data: { user: caller } } = await supa.auth.getUser(token)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: callerProfile } = await supa.from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    // Verifier que l'appelant est admin principal sur cette ecole
    if (callerProfile?.role !== 'super_admin') {
      const { data: callerParam } = await supa
        .from('permissions_modules')
        .select('niveau')
        .eq('profile_id', caller.id)
        .eq('ecole_id', ecoleId)
        .eq('module_code', 'parametres')
        .maybeSingle()
      if (callerParam?.niveau !== 'admin') {
        return NextResponse.json({ error: 'Seul un admin principal peut revoquer un autre admin' }, { status: 403 })
      }
    }

    // Empecher de se supprimer soi-meme
    if (profileId === caller.id) {
      return NextResponse.json({ error: 'Impossible de revoquer votre propre acces' }, { status: 400 })
    }

    // Recup info cible pour audit
    const { data: cible } = await supa.from('profiles').select('prenom, nom, role, ecole_id').eq('id', profileId).single()
    if (!cible) {
      return NextResponse.json({ error: 'Profil cible introuvable' }, { status: 404 })
    }

    // Empecher de revoquer un super_admin (ils ne sont pas sous controle ecole)
    if (cible.role === 'super_admin') {
      return NextResponse.json({ error: 'Impossible de revoquer un super-administrateur depuis cette interface' }, { status: 400 })
    }

    // 1. Supprimer toutes les permissions pour cette ecole
    await supa.from('permissions_modules')
      .delete()
      .eq('profile_id', profileId)
      .eq('ecole_id', ecoleId)

    // 2. Verifier s'il reste des permissions sur d'autres ecoles
    const { data: autresPerms } = await supa
      .from('permissions_modules')
      .select('ecole_id')
      .eq('profile_id', profileId)
      .limit(1)

    // Si plus aucune permission, retrograder en parent et detacher de l'ecole
    if (!autresPerms || autresPerms.length === 0) {
      await supa.from('profiles')
        .update({ role: 'parent', ecole_id: null })
        .eq('id', profileId)
    }

    // 3. Audit log
    await supa.from('permissions_audit').insert({
      acteur_id: caller.id,
      cible_profile_id: profileId,
      ecole_id: ecoleId,
      action: 'revoque_admin',
      details: {
        cible_nom: `${cible.prenom || ''} ${cible.nom || ''}`.trim(),
        retrograde_parent: !autresPerms || autresPerms.length === 0,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Acces admin revoque pour ${cible.prenom || ''} ${cible.nom || ''}`.trim(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}
