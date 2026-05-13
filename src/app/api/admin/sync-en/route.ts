import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { genererOndeCsv, genererSiecleXml, genererParcoursupCsv, OndeEleveData } from '@/lib/education-nationale'

/**
 * POST /api/admin/sync-en
 * Body: { ecoleId, provider: 'onde'|'siecle'|'parcoursup', direction: 'export'|'import', classeId?, fichierContent? }
 *
 * Pour direction=export : génère un fichier conforme au provider (CSV ONDE, XML SIECLE, CSV Parcoursup)
 * Pour direction=import : parse un fichier reçu de l'académie et met à jour les enfants (TODO)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ecoleId, provider, direction, classeId } = body
    if (!ecoleId || !provider || !direction) {
      return NextResponse.json({ error: 'ecoleId, provider, direction requis' }, { status: 400 })
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

    if (direction === 'export') {
      // Charge les enfants ciblés (classe ou tous)
      let query = sb.from('enfants').select(`
        id, ine, nom, prenom, date_naissance, sexe, adresse, code_postal, commune,
        classe_id, classes(nom, niveau),
        familles(profiles(prenom, nom, telephone, email))
      `).eq('ecole_id', ecoleId)
      if (classeId) query = query.eq('classe_id', classeId)
      const { data: enfants } = await query
      if (!enfants || enfants.length === 0) {
        return NextResponse.json({ error: 'Aucun élève à exporter' }, { status: 400 })
      }

      const { data: ecole } = await sb.from('ecoles').select('nom, code_uai').eq('id', ecoleId).single()

      const eleves: OndeEleveData[] = (enfants as any[]).map(e => ({
        ine: e.ine,
        nom: e.nom,
        prenoms: e.prenom,
        date_naissance: e.date_naissance || '',
        lieu_naissance: '',
        pays_naissance: 'FRA',
        sexe: (e.sexe === 'F' ? 'F' : 'M') as 'M' | 'F',
        adresse: e.adresse,
        code_postal: e.code_postal,
        commune: e.commune,
        classe_nom: e.classes?.nom || '',
        niveau_onde: e.classes?.niveau,
        responsables: (e.familles?.profiles || []).slice(0, 2).map((p: any) => ({
          lien: 'parent', nom: p.nom, prenom: p.prenom, tel: p.telephone, email: p.email,
        })),
      }))

      let content = ''
      let filename = ''
      let mime = 'text/plain'

      if (provider === 'onde') {
        content = genererOndeCsv(eleves)
        filename = `ONDE_export_${new Date().toISOString().slice(0, 10)}.csv`
        mime = 'text/csv'
      } else if (provider === 'siecle') {
        content = genererSiecleXml(eleves, { code_uai: ecole?.code_uai || '', nom: ecole?.nom || '' })
        filename = `SIECLE_BEE_${new Date().toISOString().slice(0, 10)}.xml`
        mime = 'application/xml'
      } else if (provider === 'parcoursup') {
        // Parcoursup nécessiterait moyennes terminales — stub minimal
        content = genererParcoursupCsv((enfants as any[]).map(e => ({
          ine: e.ine || '',
          nom: e.nom,
          prenoms: e.prenom,
          date_naissance: e.date_naissance || '',
          sexe: (e.sexe === 'F' ? 'F' : 'M') as 'M' | 'F',
          classe_terminale: e.classes?.nom || '',
          moyennes_par_matiere: [],
        })))
        filename = `Parcoursup_${new Date().toISOString().slice(0, 10)}.csv`
        mime = 'text/csv'
      } else {
        return NextResponse.json({ error: `Provider inconnu : ${provider}` }, { status: 400 })
      }

      await sb.from('sync_education_nationale').insert({
        ecole_id: ecoleId,
        provider,
        direction: 'export',
        nb_eleves_traites: eleves.length,
        nb_succes: eleves.length,
        cree_par: user.id,
      })

      return NextResponse.json({ success: true, content, filename, mime, nbEleves: eleves.length })
    }

    return NextResponse.json({ error: 'Import non encore implémenté — uploader le fichier reçu de l\'académie depuis l\'UI (sera dispo prochainement)' }, { status: 501 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur sync EN' }, { status: 500 })
  }
}
