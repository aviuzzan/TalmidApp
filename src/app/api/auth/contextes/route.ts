import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/auth/contextes
 * Liste les rattachements (école × rôle) du compte connecté + le contexte actif.
 * Sert au sélecteur "Changer d'espace" (portail + admin).
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const token = req.headers.get('authorization')?.replace('Bearer ', '') || ''
    if (!token) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 })
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ ok: false, error: 'Session invalide' }, { status: 401 })

    const [{ data: rattachements }, { data: profil }] = await Promise.all([
      sb.from('profils_rattachements')
        .select('id, ecole_id, role, famille_id, ecoles(nom, slug), familles(nom)')
        .eq('user_id', user.id)
        .eq('actif', true),
      sb.from('profiles').select('role, ecole_id, famille_id').eq('id', user.id).maybeSingle(),
    ])

    const contextes = ((rattachements || []) as any[]).map(r => ({
      id: r.id,
      role: r.role,
      ecole_id: r.ecole_id,
      ecole_nom: r.ecoles?.nom || '',
      ecole_slug: r.ecoles?.slug || '',
      famille_nom: r.familles?.nom || null,
      actuel: !!profil && profil.ecole_id === r.ecole_id && profil.role === r.role,
    }))

    return NextResponse.json({ ok: true, contextes })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
