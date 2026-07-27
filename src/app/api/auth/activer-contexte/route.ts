import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/activer-contexte
 * Body : { rattachementId?: string, ecoleSlug?: string, espace?: 'admin' | 'parent' | 'prof' }
 *
 * Multi-écoles (gggg2) : un même compte peut être rattaché à plusieurs écoles
 * avec des rôles différents (parent à Eschel, admin à Beth Hanna...).
 * Cette route bascule le CONTEXTE ACTIF (= la ligne `profiles`) vers l'un des
 * rattachements du compte — jamais vers autre chose (vérification d'appartenance).
 *
 * Résolution :
 *  - rattachementId fourni → ce rattachement précis (s'il appartient bien au user)
 *  - ecoleSlug + espace → le rattachement du user pour cette école et ce type
 *    d'espace ('admin' = admin/agent/super_admin, 'prof' = teacher/prof,
 *    'parent' = parent). C'est ce qui permet "le même email est parent OU admin
 *    selon la porte par laquelle il entre".
 */
export async function POST(req: NextRequest) {
  try {
    const { rattachementId, ecoleSlug, espace } = await req.json()

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const token = req.headers.get('authorization')?.replace('Bearer ', '') || ''
    if (!token) return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 })
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ ok: false, error: 'Session invalide' }, { status: 401 })

    // Tous les rattachements du compte
    const { data: rattachements } = await sb
      .from('profils_rattachements')
      .select('id, ecole_id, role, famille_id, parent_slot, actif, ecoles(nom, slug)')
      .eq('user_id', user.id)
      .eq('actif', true)

    const liste = (rattachements || []) as any[]
    if (liste.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucun rattachement pour ce compte' }, { status: 404 })
    }

    let cible: any = null
    if (rattachementId) {
      cible = liste.find(r => r.id === rattachementId)
    } else if (ecoleSlug) {
      const parEcole = liste.filter(r => r.ecoles?.slug === ecoleSlug)
      const rolesEspace: Record<string, string[]> = {
        admin: ['admin', 'agent', 'super_admin'],
        prof: ['teacher', 'prof'],
        parent: ['parent'],
      }
      const roles = rolesEspace[espace || ''] || []
      cible = roles.length > 0
        ? parEcole.find(r => roles.includes(r.role))
        : parEcole[0]
    } else if (liste.length === 1) {
      cible = liste[0]
    }

    if (!cible) {
      return NextResponse.json({ ok: false, error: 'Aucun accès correspondant', contextes: liste.length }, { status: 403 })
    }

    // Bascule du contexte actif — profiles reste la source lue par toute l'app + la RLS
    const { error: upErr } = await sb.from('profiles').upsert({
      id: user.id,
      role: cible.role,
      ecole_id: cible.ecole_id,
      famille_id: cible.famille_id,
      parent_slot: cible.parent_slot,
    })
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      role: cible.role,
      ecole: { id: cible.ecole_id, nom: cible.ecoles?.nom, slug: cible.ecoles?.slug },
      famille_id: cible.famille_id,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
