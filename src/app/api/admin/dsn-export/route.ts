import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { genererDsnFichier } from '@/lib/dsn'

/**
 * POST /api/admin/dsn-export
 * Body: { ecoleId, mois: 'YYYY-MM' }
 * Génère le fichier DSN du mois pour l'école.
 */
export async function POST(req: NextRequest) {
  try {
    const { ecoleId, mois } = await req.json()
    if (!ecoleId || !mois) return NextResponse.json({ error: 'ecoleId et mois requis' }, { status: 400 })

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

    const { data: ecole } = await sb.from('ecoles').select('nom, adresse, code_postal, ville, siren').eq('id', ecoleId).single()
    if (!ecole?.siren) return NextResponse.json({ error: 'SIREN de l\'école manquant (à renseigner dans Paramètres)' }, { status: 400 })

    const { data: bulletins } = await sb.from('bulletins_paie')
      .select('*').eq('ecole_id', ecoleId).eq('mois', mois + '-01')

    if (!bulletins || bulletins.length === 0) {
      return NextResponse.json({ error: 'Aucun bulletin de paie pour ce mois' }, { status: 400 })
    }

    // Calcul numéro d'ordre (incrément par mois)
    const { count: priorCount } = await sb.from('dsn_exports')
      .select('*', { count: 'exact', head: true })
      .eq('ecole_id', ecoleId).eq('mois', mois + '-01')
    const numeroOrdre = (priorCount || 0) + 1

    const fichier = genererDsnFichier({
      siren: ecole.siren,
      raison_sociale: ecole.nom,
      adresse: ecole.adresse || '',
      code_postal: ecole.code_postal || '',
      commune: ecole.ville || '',
      mois,
      numero_ordre: numeroOrdre,
      salaries: (bulletins as any[]).map(b => ({
        nir: b.nir || '',
        nom: b.nom || '',
        prenoms: b.prenom || '',
        date_naissance: b.date_naissance || '',
        sexe: 'M' as 'M' | 'F',
        salaire_brut: Number(b.salaire_brut),
        salaire_net: Number(b.salaire_net),
        cotisations_salariales: Number(b.cotisations_salariales),
        cotisations_patronales: Number(b.cotisations_patronales),
        csg_crds: Number(b.csg_crds),
        heures: Number(b.heures_travaillees || 151.67),
      })),
    })

    const totalBrut = bulletins.reduce((s: number, b: any) => s + Number(b.salaire_brut), 0)
    const totalCot = bulletins.reduce((s: number, b: any) => s + Number(b.cotisations_salariales) + Number(b.cotisations_patronales), 0)

    await sb.from('dsn_exports').insert({
      ecole_id: ecoleId,
      mois: mois + '-01',
      nb_salaries: bulletins.length,
      total_brut: totalBrut,
      total_cotisations: totalCot,
      fichier_content: fichier,
      numero_ordre: numeroOrdre,
      cree_par: user.id,
    })

    // Marque les bulletins comme exportés
    await sb.from('bulletins_paie')
      .update({ dsn_exported: true, dsn_exported_at: new Date().toISOString() })
      .eq('ecole_id', ecoleId).eq('mois', mois + '-01')

    return NextResponse.json({
      success: true,
      nbSalaries: bulletins.length,
      content: fichier,
      filename: `DSN_${ecole.siren}_${mois.replace('-', '')}_${String(numeroOrdre).padStart(3, '0')}.dsn`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur DSN' }, { status: 500 })
  }
}
