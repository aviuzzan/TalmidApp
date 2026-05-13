import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, getSignatureRequest } from '@/lib/yousign'
import { getIntegration, findEcoleBySlug } from '@/lib/integrations'

export const runtime = 'nodejs'

/**
 * POST /api/yousign/webhook?ecole=<slug>
 *
 * Events YouSign à gérer :
 *   - signature_request.activated
 *   - signer.notified / signer.consent_given / signer.signed
 *   - signature_request.done (tous signers signés)
 *   - signature_request.declined
 *   - signature_request.expired
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('ecole')
  if (!slug) return NextResponse.json({ error: 'Paramètre ?ecole=<slug> requis' }, { status: 400 })

  const ecole = await findEcoleBySlug(slug)
  if (!ecole) return NextResponse.json({ error: `École introuvable` }, { status: 404 })

  const integration = await getIntegration(ecole.id, 'yousign')
  if (!integration) return NextResponse.json({ error: 'YouSign non configuré' }, { status: 400 })
  const webhookSecret = integration.secrets.webhook_secret
  // Webhook secret optionnel — si présent on vérifie, sinon on accepte

  const payload = await req.text()
  if (webhookSecret) {
    const sig = req.headers.get('x-yousign-signature-256')
    const verified = verifyWebhookSignature(payload, sig, webhookSecret)
    if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 400 })
  }

  let event: any
  try { event = JSON.parse(payload) } catch (e) {
    return NextResponse.json({ error: 'Payload non parsable' }, { status: 400 })
  }

  const eventName = event?.event_name || event?.event_type
  const requestId = event?.data?.signature_request?.id || event?.signature_request?.id

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    if (!requestId) return NextResponse.json({ received: true, note: 'no request id' })

    const updates: any = { updated_at: new Date().toISOString() }

    if (eventName === 'signature_request.done' || eventName === 'signer.signed') {
      // Récupère la signature_request pour avoir le timestamp + document signé
      try {
        const sigReq = await getSignatureRequest(integration.secrets.api_key, integration.mode, requestId)
        updates.statut = 'signed'
        updates.signed_at = new Date().toISOString()
        // Document signé : doc.id de la signature_request
        const docs = sigReq?.documents || []
        if (docs.length > 0) {
          updates.signed_document_url = `yousign://${requestId}/${docs[0].id}` // référence interne, à télécharger via getSignatureRequest si besoin
        }
      } catch (e) {
        updates.statut = 'signed'
        updates.signed_at = new Date().toISOString()
      }

      // Marque le contrat associé comme signé si lien
      const { data: sig } = await sb.from('signatures_electroniques')
        .select('contrat_id')
        .eq('provider_request_id', requestId)
        .maybeSingle()
      if (sig?.contrat_id) {
        await sb.from('contrats_scolarisation')
          .update({ statut: 'signe', signe_le: new Date().toISOString() })
          .eq('id', sig.contrat_id)
      }
    } else if (eventName === 'signature_request.declined' || eventName === 'signer.declined') {
      updates.statut = 'declined'
    } else if (eventName === 'signature_request.expired') {
      updates.statut = 'expired'
    } else if (eventName === 'signer.notified' || eventName === 'signature_request.activated') {
      updates.statut = 'sent'
    } else if (eventName === 'signer.consent_given') {
      updates.statut = 'viewed'
    }

    if (Object.keys(updates).length > 1) {
      await sb.from('signatures_electroniques').update(updates).eq('provider_request_id', requestId)
    }

    return NextResponse.json({ received: true, eventName, requestId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur webhook' }, { status: 500 })
  }
}
