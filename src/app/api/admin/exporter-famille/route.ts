import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/exporter-famille
 * Body: { familleId }
 *
 * Génère un export des données d'une famille (RGPD article 20, droit à la portabilité).
 * Renvoie un JSON structuré contenant :
 *   - infos famille (parents, adresses, situation)
 *   - liste enfants (avec date naissance, classe, statut)
 *   - factures + lignes
 *   - règlements
 *   - chèques
 *   - documents uploadés (avec URL signées 1h)
 *   - scolarités
 *   - inscriptions pédagogiques
 *
 * Format de retour : JSON (le client le télécharge en .json).
 * Pour un vrai ZIP, on pourrait wrapper avec une lib JSZip côté client.
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId } = await req.json()
    if (!familleId) {
      return NextResponse.json({ error: 'familleId requis' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Auth caller
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: { user: caller } } = await sb.auth.getUser(authToken)
    if (!caller) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    const { data: callerProfile } = await sb
      .from('profiles').select('role, ecole_id, famille_id').eq('id', caller.id).single()

    // Charger la famille
    const { data: famille } = await sb
      .from('familles').select('*').eq('id', familleId).single()
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })

    // Permission :
    // - admin / super_admin de la même école
    // - parent appartenant à cette famille (droit d'accès à ses propres données)
    const isAdmin = ['admin', 'super_admin'].includes(callerProfile?.role)
    const isOwnParent = callerProfile?.role === 'parent' && callerProfile?.famille_id === familleId
    if (!isAdmin && !isOwnParent) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    if (isAdmin && callerProfile?.role === 'admin' && callerProfile?.ecole_id !== famille.ecole_id) {
      return NextResponse.json({ error: 'Accès refusé à cette école' }, { status: 403 })
    }

    // Charger les données liées
    const [
      { data: enfants },
      { data: factures },
      { data: lignes },
      { data: reglements },
      { data: cheques },
      { data: documents },
      { data: scolarites },
      { data: pedago },
      { data: contrats },
      { data: ecole },
    ] = await Promise.all([
      sb.from('enfants').select('*').eq('famille_id', familleId),
      sb.from('factures').select('*').eq('famille_id', familleId),
      sb.from('facture_lignes').select('*, factures!inner(famille_id)').eq('factures.famille_id', familleId),
      sb.from('reglements').select('*').eq('famille_id', familleId),
      sb.from('cheques').select('*').eq('famille_id', familleId),
      sb.from('documents_famille').select('*').eq('famille_id', familleId),
      sb.from('scolarites').select('*').eq('famille_id', familleId),
      sb.from('inscriptions_pedagogiques').select('*').eq('famille_id', familleId),
      sb.from('contrats_scolarisation').select('*').eq('famille_id', familleId),
      sb.from('ecoles').select('id, nom, adresse, email_contact, telephone').eq('id', famille.ecole_id).single(),
    ])

    const now = new Date().toISOString()
    const exportObj = {
      _meta: {
        generated_at: now,
        generated_by: caller.id,
        format: 'TalmidApp Family Export v1',
        article: 'RGPD - Article 20 - Droit à la portabilité',
      },
      ecole: ecole || null,
      famille,
      enfants: enfants || [],
      factures: factures || [],
      facture_lignes: lignes || [],
      reglements: reglements || [],
      cheques: cheques || [],
      documents: documents || [],
      scolarites: scolarites || [],
      inscriptions_pedagogiques: pedago || [],
      contrats: contrats || [],
    }

    // Audit log
    try {
      await sb.from('admin_logs').insert({
        admin_id: caller.id,
        ecole_id: famille.ecole_id,
        action: 'export_famille_rgpd',
        details: { famille_id: familleId, par: isAdmin ? 'admin' : 'parent' },
      })
    } catch {}

    return NextResponse.json(exportObj, {
      headers: {
        'Content-Disposition': `attachment; filename="famille-${familleId.slice(0,8)}-${now.slice(0,10)}.json"`,
        'Content-Type': 'application/json',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
