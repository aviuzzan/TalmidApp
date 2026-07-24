import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/famille/demander-option
 * Body : { enfantId, tarifId, anneeScolaire, note? }
 *
 * Cree une demande d'ajout d'option (statut 'en_attente') pour un enfant de
 * la famille du user connecte. L'admin doit accepter la demande pour que
 * l'option soit reellement ajoutee au contrat + a la facture.
 */
export async function POST(req: NextRequest) {
  try {
    const { enfantId, tarifId, anneeScolaire, note } = await req.json()
    if (!enfantId || !tarifId || !anneeScolaire) {
      return NextResponse.json({ ok: false, error: 'enfantId, tarifId, anneeScolaire requis' }, { status: 400 })
    }

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

    const { data: profile } = await sb.from('profiles').select('role, famille_id, ecole_id').eq('id', userData.user.id).single()
    if (!profile || profile.role !== 'parent' || !profile.famille_id) {
      return NextResponse.json({ ok: false, error: 'Reserve aux parents' }, { status: 403 })
    }

    // Verifier que l'enfant appartient bien a la famille du parent
    const { data: enfant } = await sb.from('enfants').select('id, famille_id').eq('id', enfantId).maybeSingle()
    if (!enfant || enfant.famille_id !== profile.famille_id) {
      return NextResponse.json({ ok: false, error: 'Enfant non autorise' }, { status: 403 })
    }

    // Charger tarif pour figer le nom / montant
    const { data: tarif } = await sb.from('tarifs_secteur')
      .select('id, ecole_id, nom_poste, montant')
      .eq('id', tarifId).maybeSingle()
    if (!tarif) return NextResponse.json({ ok: false, error: 'Tarif introuvable' }, { status: 404 })

    // Verifier qu'il n'y a pas deja une demande en attente pour ce meme enfant/tarif/annee
    const { data: existante } = await sb.from('demandes_option')
      .select('id').eq('enfant_id', enfantId).eq('tarif_id', tarifId).eq('annee_scolaire', anneeScolaire)
      .eq('statut', 'en_attente').maybeSingle()
    if (existante) {
      return NextResponse.json({ ok: false, error: 'Une demande est deja en attente pour cette option' }, { status: 400 })
    }

    const { data: inserted, error } = await sb.from('demandes_option').insert({
      enfant_id: enfantId,
      famille_id: profile.famille_id,
      ecole_id: (tarif as any).ecole_id,
      annee_scolaire: anneeScolaire,
      tarif_id: tarifId,
      tarif_nom: (tarif as any).nom_poste,
      tarif_montant: parseFloat((tarif as any).montant) || 0,
      statut: 'en_attente',
      note_famille: note || null,
      demande_par: userData.user.id,
    }).select().single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, demande: inserted })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
