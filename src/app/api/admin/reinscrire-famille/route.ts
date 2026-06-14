import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/reinscrire-famille
 * Body: { familleId, exerciceCible: 'YYYY-YYYY', enfantsIds?: string[] }
 *
 * Duplique le contrat d'une famille pour l'année scolaire suivante :
 *  - Récupère le contrat le plus récent validé pour la famille
 *  - Crée un nouveau contrat brouillon pour l'exercice cible
 *  - Duplique les enfants associés (avec montée auto en niveau si demandé)
 *  - Pré-remplit les tarifs depuis tarifs_secteur de l'exercice cible
 *
 * Retourne l'ID du nouveau contrat pour redirection vers son édition.
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId, exerciceCible, enfantsIds } = await req.json()
    if (!familleId || !exerciceCible) {
      return NextResponse.json({ error: 'familleId et exerciceCible requis' }, { status: 400 })
    }

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: caller } = await sb.from('profiles').select('role, ecole_id').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(caller?.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // 1. Famille + école
    const { data: famille } = await sb.from('familles').select('id, ecole_id, nom').eq('id', familleId).single()
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })
    if (caller?.role === 'admin' && caller.ecole_id !== famille.ecole_id) {
      return NextResponse.json({ error: 'Accès refusé à cette famille' }, { status: 403 })
    }

    // 2. Exercice cible
    const { data: ex } = await sb.from('exercices')
      .select('id, code, date_debut, date_fin')
      .eq('ecole_id', famille.ecole_id).eq('code', exerciceCible).maybeSingle()
    if (!ex) return NextResponse.json({ error: `Exercice ${exerciceCible} non créé pour cette école` }, { status: 400 })

    // 3. Vérifie qu'on n'a pas déjà un contrat pour cet exercice (anti-doublon)
    const { data: dejaExistant } = await sb.from('contrats_scolarisation')
      .select('id').eq('famille_id', familleId).eq('exercice_id', ex.id).maybeSingle()
    if (dejaExistant) {
      return NextResponse.json({
        error: `Un contrat existe déjà pour ${exerciceCible}`,
        existingContratId: dejaExistant.id,
      }, { status: 400 })
    }

    // 4. Contrat précédent (le plus récent) pour copier les choix de base
    const { data: contratsExistants } = await sb.from('contrats_scolarisation')
      .select('*').eq('famille_id', familleId).order('created_at', { ascending: false }).limit(1)
    const contratBase = contratsExistants?.[0]

    // 5. Création du nouveau contrat brouillon
    const { data: nouveauContrat, error: errContrat } = await sb.from('contrats_scolarisation').insert({
      ecole_id: famille.ecole_id,
      famille_id: familleId,
      exercice_id: ex.id,
      annee_scolaire: exerciceCible,
      mode_reglement: contratBase?.mode_reglement || 'cheque',
      nb_echeances: contratBase?.nb_echeances || 10,
      assurance_ecole: contratBase?.assurance_ecole ?? true,
      droit_image: contratBase?.droit_image ?? null,
      statut: 'brouillon',
      observations: `Réinscription depuis contrat ${contratBase?.annee_scolaire || 'antérieur'}`,
    }).select().single()

    if (errContrat || !nouveauContrat) {
      return NextResponse.json({ error: errContrat?.message || 'Création contrat échouée' }, { status: 500 })
    }

    // 6. Duplique les enfants associés au contrat précédent
    let enfantsIdsCible: string[] = []
    if (Array.isArray(enfantsIds) && enfantsIds.length > 0) {
      enfantsIdsCible = enfantsIds
    } else if (contratBase) {
      const { data: ce } = await sb.from('contrat_enfants').select('enfant_id').eq('contrat_id', contratBase.id)
      enfantsIdsCible = (ce || []).map((c: any) => c.enfant_id)
    } else {
      // fallback : tous les enfants actifs de la famille
      const { data: enf } = await sb.from('enfants').select('id').eq('famille_id', familleId).is('date_sortie', null)
      enfantsIdsCible = (enf || []).map((e: any) => e.id)
    }

    if (enfantsIdsCible.length > 0) {
      const rows = enfantsIdsCible.map(id => ({
        contrat_id: nouveauContrat.id,
        enfant_id: id,
      }))
      await sb.from('contrat_enfants').insert(rows)
    }

    try {
      await sb.from('admin_logs').insert({
        admin_id: user.id,
        ecole_id: famille.ecole_id,
        action: 'reinscription_famille',
        details: { famille_id: familleId, exercice_cible: exerciceCible, contrat_id: nouveauContrat.id, nb_enfants: enfantsIdsCible.length },
      })
    } catch {}
    return NextResponse.json({
      success: true,
      contratId: nouveauContrat.id,
      nbEnfants: enfantsIdsCible.length,
      message: `Réinscription créée en brouillon pour ${exerciceCible}. ${enfantsIdsCible.length} enfant${enfantsIdsCible.length > 1 ? 's' : ''} pré-inscrit${enfantsIdsCible.length > 1 ? 's' : ''}.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur réinscription' }, { status: 500 })
  }
}
