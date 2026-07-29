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
    const { data: paiement, error: paiementErr } = await supabaseAdmin
      .from('paiements_en_ligne')
      .select('*')
      .eq('stripe_session_id', orderId)
      .eq('provider', 'paypal')
      .maybeSingle()
    // FIX audit RLS 29/07/2026 : ne pas confondre « introuvable » et « lecture refusee ».
    if (paiementErr) {
      console.error('[paypal capture] lecture paiements_en_ligne failed:', paiementErr.message)
      return NextResponse.json({ error: 'Lecture du paiement impossible : ' + paiementErr.message }, { status: 500 })
    }
    if (!paiement) return NextResponse.json({ error: 'Paiement introuvable' }, { status: 404 })
    // FIX audit 24/07/2026 pt 13 : la garde comparait 'paid' alors que le statut
    // ecrit est 'succeeded' -> garde inoperante, double capture possible
    if (paiement.statut === 'succeeded' || paiement.statut === 'paid') {
      return NextResponse.json({ success: true, alreadyPaid: true })
    }

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
      // FIX audit RLS 29/07/2026 (suite) : ne pas marquer 'failed' un paiement
      // deja encaisse. Si l'update final vers 'succeeded' avait echoue (500) et
      // que la famille re-clique, PayPal repond ORDER_ALREADY_CAPTURED (statut
      // != COMPLETED) alors que l'argent est bien pris et que le reglement
      // existe deja en base -> etat trompeur au rapprochement.
      const refPaypal = 'PayPal ' + orderId
      const { data: reglementExistant, error: reglLookupErr } = await supabaseAdmin
        .from('reglements')
        .select('id')
        .eq('facture_id', paiement.facture_id)
        .eq('reference', refPaypal)
        .maybeSingle()
      if (reglLookupErr) {
        // Lecture impossible : on ne peut pas trancher, on ne degrade donc pas
        // le statut (marquer 'failed' a tort est irreversible cote rapprochement).
        console.error('[paypal capture] lecture reglement existant failed:', reglLookupErr.message)
        return NextResponse.json({
          error: 'Capture PayPal non confirmée et vérification du règlement impossible : ' + reglLookupErr.message + '. Ne pas relancer le paiement, prévenir l\'école.',
        }, { status: 500 })
      }
      if (reglementExistant?.id) {
        // Le reglement est deja enregistre : la capture avait bien abouti.
        // On se contente de rattraper le statut du paiement en ligne.
        const { error: upRattrapErr } = await supabaseAdmin.from('paiements_en_ligne')
          .update({ statut: 'succeeded', metadata: { ...(paiement.metadata || {}), paypal_capture: cap } })
          .eq('id', paiement.id)
        if (upRattrapErr) {
          console.error('[paypal capture] rattrapage statut succeeded failed:', upRattrapErr.message)
          return NextResponse.json({
            error: 'Paiement déjà encaissé et règlement enregistré, mais le statut du paiement en ligne n\'a pas pu être mis à jour : ' + upRattrapErr.message + '. Ne pas relancer le paiement, prévenir l\'école.',
          }, { status: 500 })
        }
        return NextResponse.json({ success: true, alreadyPaid: true })
      }
      const { error: upFailErr } = await supabaseAdmin.from('paiements_en_ligne')
        .update({ statut: 'failed', metadata: { ...(paiement.metadata || {}), paypal_capture: cap } })
        .eq('id', paiement.id)
      if (upFailErr) console.error('[paypal capture] update statut failed non enregistre:', upFailErr.message)
      return NextResponse.json({ error: 'Capture PayPal échouée : ' + (cap.message || capRes.status) }, { status: 502 })
    }

    const montant = Number(paiement.montant_centimes || 0) / 100

    // Enregistre le règlement sur la facture (FIX pt 13 : verifier l'erreur d'insert)
    const { error: reglErr } = await supabaseAdmin.from('reglements').insert({
      facture_id: paiement.facture_id,
      famille_id: paiement.famille_id,
      montant,
      date_reglement: new Date().toISOString().split('T')[0],
      mode_paiement: 'cb',
      reference: 'PayPal ' + orderId,
      notes: 'Paiement en ligne PayPal',
    })
    if (reglErr) {
      console.error('[paypal capture] insert reglement failed:', reglErr.message)
      return NextResponse.json({ error: 'Paiement capturé mais enregistrement du règlement échoué : ' + reglErr.message }, { status: 500 })
    }
    // Statut facture : recalcule automatiquement par le trigger BDD trg_reglements_statut

    // FIX audit RLS 29/07/2026 : sans ce test, l'argent est capture chez PayPal
    // et le paiement reste 'pending' cote TalmidApp — la garde anti-double-capture
    // ci-dessus (statut === 'succeeded') devient alors inoperante.
    const { error: upOkErr } = await supabaseAdmin.from('paiements_en_ligne')
      .update({ statut: 'succeeded', metadata: { ...(paiement.metadata || {}), paypal_capture_id: cap.id } })
      .eq('id', paiement.id)
    if (upOkErr) {
      console.error('[paypal capture] update statut succeeded failed:', upOkErr.message)
      return NextResponse.json({
        error: 'Paiement capture et reglement enregistre, mais le statut du paiement en ligne n\'a pas pu etre mis a jour : ' + upOkErr.message + '. Ne pas relancer le paiement, prevenir l\'ecole.',
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur PayPal capture' }, { status: 500 })
  }
}
