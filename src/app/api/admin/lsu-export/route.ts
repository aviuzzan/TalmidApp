import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { genererLsuXml, LsuExportData } from '@/lib/lsu'

/**
 * POST /api/admin/lsu-export
 * Body: { ecoleId, exerciceId, classeId, periode }
 * Génère le XML LSU pour une classe + période, enregistre dans lsu_exports, retourne le XML.
 */
export async function POST(req: NextRequest) {
  try {
    const { ecoleId, exerciceId, classeId, periode } = await req.json()
    if (!ecoleId || !exerciceId || !classeId || !periode) {
      return NextResponse.json({ error: 'ecoleId, exerciceId, classeId, periode requis' }, { status: 400 })
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

    const [{ data: ecole }, { data: ex }, { data: classe }] = await Promise.all([
      sb.from('ecoles').select('id, nom, code_uai').eq('id', ecoleId).single(),
      sb.from('exercices').select('id, code').eq('id', exerciceId).single(),
      sb.from('classes').select('id, nom').eq('id', classeId).single(),
    ])
    if (!ecole || !ex || !classe) return NextResponse.json({ error: 'Données introuvables' }, { status: 404 })

    // Récupère les bulletins de la classe + période + exercice
    const { data: bulletins } = await sb
      .from('bulletins')
      .select(`
        id, enfant_id, moyenne_generale, appreciation_generale,
        enfants(prenom, nom, date_naissance, classe_id),
        bulletin_lignes(matiere_nom, moyenne_eleve, appreciation)
      `)
      .eq('ecole_id', ecoleId)
      .eq('exercice_id', exerciceId)
      .eq('trimestre', periode)
      .eq('classe_id', classeId)

    if (!bulletins || bulletins.length === 0) {
      return NextResponse.json({ error: 'Aucun bulletin pour cette classe + période. Générez d\'abord les bulletins.' }, { status: 400 })
    }

    const eleves = (bulletins as any[]).map((b: any) => ({
      nom: b.enfants?.nom || '',
      prenom: b.enfants?.prenom || '',
      date_naissance: b.enfants?.date_naissance || null,
      classe_nom: classe.nom,
      moyenne_generale: b.moyenne_generale != null ? Number(b.moyenne_generale) : null,
      appreciation_generale: b.appreciation_generale || null,
      matieres: (b.bulletin_lignes || []).map((l: any) => ({
        nom: l.matiere_nom,
        moyenne: l.moyenne_eleve != null ? Number(l.moyenne_eleve) : null,
        appreciation: l.appreciation || null,
      })),
    }))

    const exportData: LsuExportData = {
      ecole_nom: ecole.nom,
      code_uai: ecole.code_uai || '',
      annee_scolaire: ex.code,
      periode: Number(periode),
      eleves,
    }

    const xml = genererLsuXml(exportData)

    const { data: row } = await sb.from('lsu_exports').insert({
      ecole_id: ecoleId,
      exercice_id: exerciceId,
      classe_id: classeId,
      periode: Number(periode),
      nb_eleves: eleves.length,
      xml_content: xml,
      statut: 'genere',
      cree_par: user.id,
    }).select('id').single()

    return NextResponse.json({
      success: true,
      exportId: row?.id,
      nbEleves: eleves.length,
      xml,
      filename: `LSU_${classe.nom.replace(/\s+/g, '_')}_P${periode}_${ex.code}.xml`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur génération LSU' }, { status: 500 })
  }
}
