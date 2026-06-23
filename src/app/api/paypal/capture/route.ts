import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getIntegration } from '@/lib/integrations'

/**
 * POST /api/paypal/capture
 * Body: { orderId: string }  (token = PayPal order id retourne par /checkout)
 * Capture une commande PayPal approuvee par la famille, enregistre le reglement
 * sur la facture et marque le paiement en ligne comme payé.
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
    const { orderId } = await req.json()
    if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Retrouve le paiement créé à l'étape checkout
    const { data: paiement } = await supabaseAdmin
      .from('paiements_en_ligne')
      .select('*')
      .eq('stripe_session_id', orderId)
      .eq('provider', 'paypal')
      .maybeSingle()
    if (!paiement) return NextResponse.json({ error: 'Paiement introuvable' }, { status: 404 })
    if (paiement.statut === 'paid') return NextResponse.json({ success: true, alreadyPaid: true })

    const integration = await getIntegration(paiement.ecole_id, 'paypal')
    if (!integration) return NextResponse.json({ error: 'Intégration PayPal inactive' }, { status: 400 })
    const clientId = integration.public.client_id
    const secret = integration.secrets.client_secret
    if (!clientId || !secret) return NextResponse.json({ error: 'Identifiants PayPal manquants' }, { status: 400 })

    const base = paypalBase(integration.mode)
    const accessToken = await getToken(base, clientId, secret)

    const capRes = await fetch(base + '/v2/checkout/orders/' + orderId + '/capture', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    })
    const cap = await capRes.json()
    if (!capRes.ok || cap.status !== 'COMPLETED') {
      await supabaseAdmin.from('paiements_en_ligne')
        .update({ statut: 'failed', metadata: { ...(paiement.metadata || {}), paypal_capture: cap } })
        .eq('id', paiement.id)
      return NextResponse.json({ error: 'Capture PayPal échouée : ' + (cap.message || capRes.status) }, { status: 502 })
    }

    const montant = Number(paiement.montant_centimes || 0) / 100

    // Enregistre le règlement sur la facture
    await supabaseAdmin.from('reglements').insert({
      facture_id: paiement.facture_id,
      famille_id: paiement.famille_id,
      montant,
      date_reglement: new Date().toISOString().split('T')[0],
      mode_paiement: 'cb',
      reference: 'PayPal ' + orderId,
      notes: 'Paiement en ligne PayPal',
    })

    // Recalcule le statut de la facture
    // NOTE : `total_regle` exclut les avoirs imputés (vrais paiements). On utilise
    // `solde_restant` (mathématiquement correct, qui prend en compte les avoirs).
    const { data: fs } = await supabaseAdmin
      .from('factures_solde').select('total_facture, total_regle, solde_restant').eq('id', paiement.facture_id).maybeSingle()
    if (fs) {
      const regle = Number(fs.total_regle || 0)
      const total = Number(fs.total_facture || 0)
      const restant = Number(fs.solde_restant || 0)
      const statut = restant <= 0.01 && total > 0 ? 'paye' : (regle > 0 || restant < total) ? 'partiel' : 'en_attente'
      await supabaseAdmin.from('factures').update({ statut }).eq('id', paiement.facture_id)
    }

    await supabaseAdmin.from('paiements_en_ligne')
      .update({ statut: 'succeeded', metadata: { ...(paiement.metadata || {}), paypal_capture_id: cap.id } })
      .eq('id', paiement.id)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur PayPal capture' }, { status: 500 })
  }
}
