import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getIntegration } from '@/lib/integrations'

/**
 * POST /api/paypal/checkout
 * Body: { factureId: string, montantCentimes?: number }
 * Cree une commande PayPal sur le compte marchand de l'ecole (cle chiffree en BDD).
 * Retourne l'URL d'approbation PayPal.
 */

function paypalBase(mode: string) {
  return mode === 'test' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
}

async function getToken(base: string, clientId: string, secret: string): Promise<string> {
  const res = await fetch(base + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!res.ok) throw new Error('PayPal auth : ' + (data.error_description || res.status))
  return data.access_token as string
}

export async function POST(req: NextRequest) {
  try {
    const { factureId, montantCentimes } = await req.json()
    if (!factureId) return NextResponse.json({ error: 'factureId requis' }, { status: 400 })

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id, famille_id').eq('id', user.id).single()
    if (!profile?.famille_id) return NextResponse.json({ error: 'Famille introuvable' }, { status: 403 })

    const { data: facture } = await supabaseAdmin
      .from('factures_solde')
      .select('id, numero, famille_id, ecole_id, solde_restant, statut')
      .eq('id', factureId).maybeSingle()
    if (!facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    if (facture.famille_id !== profile.famille_id) {
      return NextResponse.json({ error: 'Facture non rattachée à votre famille' }, { status: 403 })
    }
    if (facture.statut === 'solde' || facture.statut === 'annule') {
      return NextResponse.json({ error: 'Facture déjà soldée ou annulée' }, { status: 400 })
    }

    const solde = Number(facture.solde_restant) || 0
    if (solde <= 0) return NextResponse.json({ error: 'Aucun solde à régler' }, { status: 400 })
    const montantC = Number.isFinite(montantCentimes) && montantCentimes > 0
      ? Math.min(Math.round(montantCentimes), Math.round(solde * 100))
      : Math.round(solde * 100)
    const montant = (montantC / 100).toFixed(2)

    const integration = await getIntegration(facture.ecole_id, 'paypal')
    if (!integration) {
      return NextResponse.json({ error: "Le paiement PayPal n'est pas activé pour cette école" }, { status: 400 })
    }
    const clientId = integration.public.client_id
    const secret = integration.secrets.client_secret
    if (!clientId || !secret) {
      return NextResponse.json({ error: 'Identifiants PayPal manquants — à configurer dans Paramètres → Intégrations.' }, { status: 400 })
    }

    const base = paypalBase(integration.mode)
    const accessToken = await getToken(base, clientId, secret)

    const { data: ecole } = await supabaseAdmin
      .from('ecoles').select('nom, slug').eq('id', facture.ecole_id).single()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'

    const orderRes = await fetch(base + '/v2/checkout/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: facture.id,
          description: ('Facture ' + facture.numero + ' - ' + (ecole?.nom || 'École')).slice(0, 127),
          amount: { currency_code: 'EUR', value: montant },
        }],
        application_context: {
          brand_name: (ecole?.nom || 'TalmidApp').slice(0, 127),
          user_action: 'PAY_NOW',
          return_url: baseUrl + '/portail/factures/paiement-success?provider=paypal',
          cancel_url: baseUrl + '/portail/factures/paiement-cancel',
        },
      }),
    })
    const order = await orderRes.json()
    if (!orderRes.ok) {
      return NextResponse.json({ error: 'PayPal : ' + (order.message || orderRes.status) }, { status: 502 })
    }
    const approve = (order.links || []).find((l: any) => l.rel === 'approve')
    if (!approve) return NextResponse.json({ error: 'Lien de paiement PayPal introuvable' }, { status: 502 })

    await supabaseAdmin.from('paiements_en_ligne').insert({
      ecole_id: facture.ecole_id,
      facture_id: facture.id,
      famille_id: profile.famille_id,
      profile_id: profile.id,
      montant_centimes: montantC,
      devise: 'eur',
      provider: 'paypal',
      stripe_session_id: order.id,
      statut: 'created',
      metadata: { user_email: user.email, paypal_order_id: order.id },
    })

    return NextResponse.json({ url: approve.href, orderId: order.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur PayPal checkout' }, { status: 500 })
  }
}
