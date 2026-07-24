import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ajouterOptionAuContrat } from '@/lib/ajouter-option-contrat'

/**
 * POST /api/admin/gerer-option
 * Body :
 *  Action 'ajouter_direct' (admin ajoute une option a un enfant, sans passer par une demande) :
 *    { action: 'ajouter_direct', enfantId, tarifId, ecoleId, anneeScolaire }
 *
 *  Action 'accepter_demande' (admin accepte une demande faite par le parent) :
 *    { action: 'accepter_demande', demandeId, noteAdmin? }
 *
 *  Action 'refuser_demande' :
 *    { action: 'refuser_demande', demandeId, noteAdmin? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body
    if (!action) return NextResponse.json({ ok: false, error: 'action requise' }, { status: 400 })

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'Non authentifie' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: userData } = await sb.auth.getUser(token)
    if (!userData?.user?.id) return NextResponse.json({ ok: false, error: 'Session invalide' }, { status: 401 })

    const { data: profile } = await sb.from('profiles').select('role, ecole_id').eq('id', userData.user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ ok: false, error: 'Acces refuse' }, { status: 403 })
    }

    if (action === 'ajouter_direct') {
      const { enfantId, tarifId, ecoleId, anneeScolaire } = body
      if (!enfantId || !tarifId || !ecoleId || !anneeScolaire) {
        return NextResponse.json({ ok: false, error: 'enfantId, tarifId, ecoleId, anneeScolaire requis' }, { status: 400 })
      }
      if (profile.role !== 'super_admin' && profile.ecole_id !== ecoleId) {
        return NextResponse.json({ ok: false, error: 'Acces refuse a cette ecole' }, { status: 403 })
      }
      const res = await ajouterOptionAuContrat(sb, { enfantId, tarifId, ecoleId, anneeScolaire })
      return NextResponse.json(res, { status: res.ok ? 200 : 400 })
    }

    if (action === 'accepter_demande' || action === 'refuser_demande') {
      const { demandeId, noteAdmin } = body
      if (!demandeId) return NextResponse.json({ ok: false, error: 'demandeId requis' }, { status: 400 })

      const { data: demande } = await sb.from('demandes_option')
        .select('id, enfant_id, tarif_id, ecole_id, annee_scolaire, statut')
        .eq('id', demandeId).maybeSingle()
      if (!demande) return NextResponse.json({ ok: false, error: 'Demande introuvable' }, { status: 404 })
      if (demande.statut !== 'en_attente') {
        return NextResponse.json({ ok: false, error: 'Demande deja traitee' }, { status: 400 })
      }
      if (profile.role !== 'super_admin' && profile.ecole_id !== demande.ecole_id) {
        return NextResponse.json({ ok: false, error: 'Acces refuse a cette ecole' }, { status: 403 })
      }

      if (action === 'refuser_demande') {
        await sb.from('demandes_option').update({
          statut: 'refusee',
          note_admin: noteAdmin || null,
          decide_par: userData.user.id,
          decide_le: new Date().toISOString(),
        }).eq('id', demandeId)
        return NextResponse.json({ ok: true, refusee: true })
      }

      // accepter : ajouter au contrat et marquer la demande
      if (!demande.tarif_id) {
        return NextResponse.json({ ok: false, error: 'Tarif manquant sur la demande' }, { status: 400 })
      }
      const res = await ajouterOptionAuContrat(sb, {
        enfantId: demande.enfant_id,
        tarifId: demande.tarif_id,
        ecoleId: demande.ecole_id,
        anneeScolaire: demande.annee_scolaire,
      })
      if (!res.ok) return NextResponse.json(res, { status: 400 })

      await sb.from('demandes_option').update({
        statut: 'acceptee',
        note_admin: noteAdmin || null,
        decide_par: userData.user.id,
        decide_le: new Date().toISOString(),
      }).eq('id', demandeId)

      return NextResponse.json({ ...res, acceptee: true })
    }

    return NextResponse.json({ ok: false, error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
