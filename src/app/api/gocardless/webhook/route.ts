import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/gocardless'
import { getIntegration, findEcoleBySlug } from '@/lib/integrations'

export const runtime = 'nodejs'

/**
 * POST /api/gocardless/webhook?ecole=<slug>
 * URL à configurer dans GoCardless Dashboard → Developers → Webhook endpoints.
 *
 * Events traités :
 *   - mandates: created / submitted / active / failed
 *   - payments: created / submitted / confirmed / paid_out / failed
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('ecole')
  if (!slug) return NextResponse.json({ error: 'Paramètre ?ecole=<slug> requis' }, { status: 400 })

  const ecole = await findEcoleBySlug(slug)
  if (!ecole) return NextResponse.json({ error: `École introuvable pour slug ${slug}` }, { status: 404 })

  const integration = await getIntegration(ecole.id, 'gocardless')
  if (!integration) return NextResponse.json({ error: 'GoCardless non configuré pour cette école' }, { status: 400 })
  const webhookSecret = integration.secrets.webhook_secret
  if (!webhookSecret) return NextResponse.json({ error: 'webhook_secret manquant' }, { status: 400 })

  const sig = req.headers.get('webhook-signature')
  const payload = await req.text()
  const verified = verifyWebhookSignature(payload, sig, webhookSecret)
  if (!verified.ok) return NextResponse.json({ error: verified.error || 'Signature invalide' }, { status: 400 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    for (const ev of verified.events || []) {
      const resource = ev.resource_type
      const action = ev.action
      const links = ev.links || {}

      if (resource === 'mandates') {
        const mandateId = links.mandate
        if (action === 'active' && mandateId) {
          await sb.from('mandats_gocardless').upsert({
            ecole_id: ecole.id,
            gocardless_mandate_id: mandateId,
            statut: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'gocardless_mandate_id' })
        } else if (action === 'failed' && mandateId) {
          await sb.from('mandats_gocardless').update({ statut: 'failed', updated_at: new Date().toISOString() }).eq('gocardless_mandate_id', mandateId)
        }
      }

      if (resource === 'payments') {
        const paymentId = links.payment
        const billingRequestId = links.billing_request

        const { data: pe } = await sb
          .from('paiements_en_ligne')
          .select('id, facture_id, ecole_id, famille_id, montant_centimes, reglement_id, statut')
          .eq('gocardless_billing_request_id', billingRequestId)
          .maybeSingle()

        if (!pe) continue

        // FIX audit 24/07/2026 pt 12 : la branche 'confirmed' etait inatteignable
        // (matchee par le premier if). Desormais :
        //   submitted            -> pending (preleve chez le payeur, pas encore garanti)
        //   confirmed | paid_out -> reglement cree (confirmed = prelevement effectif
        //                           chez la famille ; ne pas attendre le versement
        //                           paid_out a l'ecole, plusieurs jours plus tard)
        if (action === 'submitted') {
          await sb.from('paiements_en_ligne').update({
            statut: 'pending',
            gocardless_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
        } else if (action === 'confirmed' || action === 'paid_out') {
          // Idempotent : si un reglement est deja lie (confirmed puis paid_out), ne rien recreer
          let reglementId = pe.reglement_id
          if (pe.facture_id && !reglementId) {
            const montantEuros = Number(((pe.montant_centimes || 0) / 100).toFixed(2))
            const { data: regl, error: reglErr } = await sb.from('reglements').insert({
              ecole_id: pe.ecole_id,
              facture_id: pe.facture_id,
              famille_id: pe.famille_id,
              montant: montantEuros,
              mode_paiement: 'sepa',
              date_reglement: new Date().toISOString().slice(0, 10),
              reference: `GoCardless ${paymentId?.slice(0, 12) || ''}`,
              notes: 'Prélèvement SEPA via GoCardless',
            }).select('id').single()
            // FIX pt 13 : verifier l'erreur d'insert — ne pas marquer succeeded sans reglement
            if (reglErr || !regl?.id) {
              console.error('[gocardless webhook] insert reglement failed:', reglErr?.message)
              continue
            }
            reglementId = regl.id
          }
          await sb.from('paiements_en_ligne').update({
            statut: 'succeeded',
            gocardless_payment_id: paymentId,
            reglement_id: reglementId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
          // Statut facture : recalcule automatiquement par le trigger BDD trg_reglements_statut
        } else if (action === 'failed' || action === 'cancelled') {
          await sb.from('paiements_en_ligne').update({
            statut: 'failed',
            gocardless_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur webhook' }, { status: 500 })
  }
}
