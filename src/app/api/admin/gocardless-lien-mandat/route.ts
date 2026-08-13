import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createMandateOnlyFlow } from '@/lib/gocardless'
import { getIntegration } from '@/lib/integrations'

export const runtime = 'nodejs'

/**
 * POST /api/admin/gocardless-lien-mandat  (oooo1)
 * Body: { familleId: string }
 * Auth : admin de l'ecole (Bearer). Genere un lien de signature de mandat SEPA
 * GoCardless pour une famille, SANS que le parent ait besoin de se connecter au
 * portail : le secretariat peut l'envoyer par WhatsApp/email. Le rattachement
 * famille est automatique (ligne pending + webhook billing_requests.fulfilled),
 * exactement comme le parcours du portail. Lien valable 7 jours (regle GoCardless).
 */
export async function POST(req: NextRequest) {
  try {
    const { familleId } = await req.json()
    if (!familleId) return NextResponse.json({ error: 'familleId requis' }, { status: 400 })

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: profile } = await sb
      .from('profiles').select('role, ecole_id').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { data: famille } = await sb
      .from('familles').select('id, nom, ecole_id, parent1_email').eq('id', familleId).single()
    if (!famille) return NextResponse.json({ error: 'Famille introuvable' }, { status: 404 })
    if (profile.role !== 'super_admin' && famille.ecole_id !== profile.ecole_id) {
      return NextResponse.json({ error: 'Famille hors de votre ecole' }, { status: 403 })
    }

    const integration = await getIntegration(famille.ecole_id, 'gocardless')
    const accessToken = integration?.secrets?.access_token
    if (!integration || !accessToken) {
      return NextResponse.json({ error: "GoCardless n'est pas active pour cette ecole" }, { status: 400 })
    }

    const { data: ecole } = await sb.from('ecoles').select('nom').eq('id', famille.ecole_id).single()

    const flow = await createMandateOnlyFlow({
      accessToken,
      mode: integration.mode,
      ecoleNom: ecole?.nom || 'Ecole',
      email: famille.parent1_email || '',
      nomFamille: famille.nom || '',
      metadata: { ecole_id: famille.ecole_id, famille_id: famille.id },
    })

    // Purge des tentatives pending abandonnees puis trace pending (le webhook complete)
    await sb.from('mandats_gocardless')
      .delete()
      .eq('famille_id', famille.id)
      .eq('statut', 'pending')
      .is('gocardless_mandate_id', null)
    const { error: insErr } = await sb.from('mandats_gocardless').insert({
      ecole_id: famille.ecole_id,
      famille_id: famille.id,
      gocardless_billing_request_id: flow.billingRequestId,
      statut: 'pending',
    })
    if (insErr) {
      return NextResponse.json({ error: 'Enregistrement impossible : ' + insErr.message }, { status: 500 })
    }

    return NextResponse.json({ url: flow.redirectUrl, famille: famille.nom })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur lien mandat' }, { status: 500 })
  }
}
