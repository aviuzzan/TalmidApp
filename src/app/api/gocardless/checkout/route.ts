import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createBillingRequestFlow } from '@/lib/gocardless'
import { getIntegration } from '@/lib/integrations'

/**
 * POST /api/gocardless/checkout
 * Body: { factureId: string, montantCentimes?: number }
 * - Famille connectée uniquement
 * - Crée un Billing Request + flow GoCardless propre à l'école
 * - Retourne l'URL hébergée GoCardless (mandat + paiement)
 */
export async function POST(req: NextRequest) {
  try {
    const { factureId, montantCentimes } = await req.json()
    if (!factureId) return NextResponse.json({ error: 'factureId requis' }, { status: 400 })

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user } } = await sb.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: profile } = await sb
      .from('profiles').select('id, famille_id, nom').eq('id', user.id).single()
    if (!profile?.famille_id) return NextResponse.json({ error: 'Famille introuvable' }, { status: 403 })

    const { data: facture } = await sb
      .from('factures_solde')
      .select('id, numero, famille_id, ecole_id, solde_restant, statut')
      .eq('id', factureId)
      .maybeSingle()
    if (!facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    if (facture.famille_id !== profile.famille_id) {
      return NextResponse.json({ error: 'Facture non rattachée à votre famille' }, { status: 403 })
    }
    if (facture.statut === 'solde' || facture.statut === 'annule') {
      return NextResponse.json({ error: 'Facture déjà soldée ou annulée' }, { status: 400 })
    }

    const solde = Number(facture.solde_restant) || 0
    if (solde <= 0) return NextResponse.json({ error: 'Aucun solde à régler' }, { status: 400 })

    const montant = Number.isFinite(montantCentimes) && montantCentimes > 0
      ? Math.min(Math.round(montantCentimes), Math.round(solde * 100))
      : Math.round(solde * 100)

    const integration = await getIntegration(facture.ecole_id, 'gocardless')
    if (!integration) {
      return NextResponse.json({ error: 'GoCardless non activé pour cette école' }, { status: 400 })
    }
    const accessToken = integration.secrets.access_token
    if (!accessToken) {
      return NextResponse.json({ error: 'Access Token GoCardless manquant' }, { status: 400 })
    }

    const { data: ecole } = await sb.from('ecoles').select('nom').eq('id', facture.ecole_id).single()
    const { data: famille } = await sb.from('familles').select('nom').eq('id', profile.famille_id).single()

    const flow = await createBillingRequestFlow({
      accessToken,
      mode: integration.mode,
      factureId: facture.id,
      factureNumero: facture.numero,
      ecoleNom: ecole?.nom || 'École',
      montantCentimes: montant,
      email: user.email || '',
      nomFamille: famille?.nom || profile.nom || '',
      metadata: {
        ecole_id: facture.ecole_id,
        famille_id: profile.famille_id,
        profile_id: profile.id,
      },
    })

    await sb.from('paiements_en_ligne').insert({
      ecole_id: facture.ecole_id,
      facture_id: facture.id,
      famille_id: profile.famille_id,
      profile_id: profile.id,
      montant_centimes: montant,
      devise: 'eur',
      provider: 'gocardless',
      gocardless_billing_request_id: flow.billingRequestId,
      statut: 'created',
      metadata: { flow_id: flow.flowId, user_email: user.email },
    })

    return NextResponse.json({ url: flow.redirectUrl, billingRequestId: flow.billingRequestId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur GoCardless checkout' }, { status: 500 })
  }
}
