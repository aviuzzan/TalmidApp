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
  // FIX secu 27/07 : signature obligatoire — sans webhook_secret configuré on refuse
  // (avant : webhook accepté sans aucune vérification si le secret manquait)
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret non configuré pour cette école' }, { status: 401 })
  }

  const payload = await req.text()
  const sig = req.headers.get('x-yousign-signature-256')
  const verified = verifyWebhookSignature(payload, sig, webhookSecret)
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 400 })

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
      // FIX audit RLS 29/07/2026 : ces ecritures n'etaient pas verifiees et la
      // route repondait 200 quoi qu'il arrive → YouSign ne rejouait jamais
      // l'evenement et le contrat restait en brouillon alors qu'il etait signe.
      // Les deux ecritures sont idempotentes : un 500 declenche un simple rejeu.
      const { data: sig, error: sigErr } = await sb.from('signatures_electroniques')
        .select('contrat_id')
        .eq('provider_request_id', requestId)
        .maybeSingle()
      if (sigErr) {
        console.error('[yousign webhook] lecture signatures_electroniques failed:', sigErr.message)
        return NextResponse.json({ received: false, error: 'lecture signature failed' }, { status: 500 })
      }
      if (sig?.contrat_id) {
        // FIX audit RLS 29/07/2026 (suite) : garde sur le statut de depart.
        // Sans elle, le rejeu d'un evenement retrograderait en 'signe' un contrat
        // passe entre-temps a 'valide' par l'ecole (ou reanimerait un 'annule').
        // Statuts de depart legitimes : 'brouillon' et 'soumis' (cycle de vie reel
        // du projet : brouillon -> soumis -> [signe] -> valide, + annule),
        // plus 'signe' lui-meme pour que le rejeu reste idempotent.
        const { error: upContratErr } = await sb.from('contrats_scolarisation')
          .update({ statut: 'signe', signe_le: new Date().toISOString() })
          .eq('id', sig.contrat_id)
          .in('statut', ['brouillon', 'soumis', 'signe'])
        if (upContratErr) {
          console.error('[yousign webhook] update contrats_scolarisation failed:', upContratErr.message)
          return NextResponse.json({ received: false, error: 'update contrat failed' }, { status: 500 })
        }
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
      const { error: upSigErr } = await sb.from('signatures_electroniques').update(updates).eq('provider_request_id', requestId)
      if (upSigErr) {
        console.error('[yousign webhook] update signatures_electroniques failed:', upSigErr.message)
        return NextResponse.json({ received: false, error: 'update signature failed' }, { status: 500 })
      }
    }

    return NextResponse.json({ received: true, eventName, requestId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur webhook' }, { status: 500 })
  }
}
