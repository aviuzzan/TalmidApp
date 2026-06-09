import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/anonymiser-famille
 * Body: { familleId, motif?, confirmNom }
 *
 * Anonymise une famille (RGPD article 17, droit à l'oubli).
 * - Remplace les champs nominatifs par "Anonymisé #IDX" / null
 * - Anonymise les enfants liés
 * - Conserve les factures pour la compta (mais le nom devient anonymisé)
 * - Trace l'action dans admin_logs (action = 'famille_supprimee')
 *
 * Sécurité :
 * - Caller doit être admin/super_admin
 * - Caller doit envoyer confirmNom qui correspond au nom de la famille
 *   (anti-fausse-manip)
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId, motif, confirmNom } = await req.json()
    if (!familleId) {
      return NextResponse.json({ error: 'familleId requis' }, { status: 400 })
    }
    if (!confirmNom || typeof confirmNom !== 'string' || !confirmNom.trim()) {
      return NextResponse.json({ error: 'confirmNom requis (nom famille pour confirmer)' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Vérification auth caller
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await sb.auth.getUser(authToken)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await sb
      .from('profiles').select('role, ecole_id').eq('id', caller.id).single()
    if (!['admin', 'super_admin'].includes(callerProfile?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Charger la famille
    const { data: famille } = await sb
      .from('familles')
      .select('id, ecole_id, nom, anonymized_at')
      .eq('id', familleId)
      .single()
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })
    if (famille.anonymized_at) {
      return NextResponse.json({ error: 'Famille déjà anonymisée' }, { status: 409 })
    }

    // Permission tenant
    if (callerProfile?.role === 'admin' && callerProfile?.ecole_id !== famille.ecole_id) {
      return NextResponse.json({ error: 'Accès refusé à cette école' }, { status: 403 })
    }

    // Anti-fausse-manip : confirmNom doit correspondre
    if (confirmNom.trim().toLowerCase() !== (famille.nom || '').trim().toLowerCase()) {
      return NextResponse.json({
        error: 'Le nom saisi ne correspond pas. Tapez exactement : ' + famille.nom,
      }, { status: 400 })
    }

    const now = new Date().toISOString()
    const shortId = familleId.slice(0, 8)
    const placeholder = `Anonymisé #${shortId}`

    // 1. Anonymiser la famille
    const { error: errF } = await sb
      .from('familles')
      .update({
        nom: placeholder,
        email: null,
        telephone: null,
        parent1_prenom: null,
        parent1_nom: placeholder,
        parent1_email: null,
        parent1_telephone: null,
        parent1_emploi: null,
        parent1_adresse: null,
        parent1_code_postal: null,
        parent1_ville: null,
        parent2_prenom: null,
        parent2_nom: null,
        parent2_email: null,
        parent2_telephone: null,
        parent2_emploi: null,
        parent2_adresse: null,
        parent2_code_postal: null,
        parent2_ville: null,
        anonymized_at: now,
        anonymized_by: caller.id,
        motif_anonymisation: motif || null,
      })
      .eq('id', familleId)
    if (errF) return NextResponse.json({ error: 'Anonymisation famille : ' + errF.message }, { status: 500 })

    // 2. Anonymiser les enfants liés
    const { data: enfants } = await sb
      .from('enfants').select('id').eq('famille_id', familleId)
    const enfantIds = (enfants ?? []).map((e: any) => e.id)
    if (enfantIds.length > 0) {
      const { error: errE } = await sb
        .from('enfants')
        .update({
          prenom: 'Anonymisé',
          deuxieme_prenom: null,
          nom: placeholder,
          lieu_naissance: null,
          anonymized_at: now,
        })
        .in('id', enfantIds)
      if (errE) console.warn('Anonymisation enfants partielle :', errE.message)
    }

    // 3. Supprimer/anonymiser les comptes auth liés (parents)
    //    On ne hard-delete pas pour éviter de casser des FK. On invalide juste l'email.
    const { data: profilsParents } = await sb
      .from('profiles')
      .select('id')
      .eq('famille_id', familleId)
      .eq('role', 'parent')
    for (const p of (profilsParents ?? []) as any[]) {
      try {
        // disable user (Supabase auth)
        await sb.auth.admin.updateUserById(p.id, {
          email: `anonyme-${p.id.slice(0, 8)}@deleted.local`,
          user_metadata: { anonymized: true, anonymized_at: now },
          // ban via Supabase admin
        })
        await sb.from('profiles').update({
          nom: placeholder, prenom: null, email: null,
        }).eq('id', p.id)
      } catch (e: any) {
        console.warn('Anonymisation compte parent', p.id, ':', e?.message)
      }
    }

    // 4. Audit log
    try {
      await sb.from('admin_logs').insert({
        admin_id: caller.id,
        ecole_id: famille.ecole_id,
        action: 'famille_anonymisee',
        details: {
          famille_id: familleId,
          nom_original: famille.nom,
          motif: motif || null,
          nb_enfants_anonymises: enfantIds.length,
          nb_parents_anonymises: (profilsParents ?? []).length,
        },
      })
    } catch (e) { console.warn('admin_logs insert failed:', e) }

    return NextResponse.json({
      success: true,
      famille_id: familleId,
      nb_enfants: enfantIds.length,
      nb_parents: (profilsParents ?? []).length,
      message: `Famille anonymisée. ${enfantIds.length} enfant(s) et ${(profilsParents ?? []).length} compte(s) parent traités.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
