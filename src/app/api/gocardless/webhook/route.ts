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

        if (action === 'submitted' || action === 'confirmed') {
          await sb.from('paiements_en_ligne').update({
            statut: 'pending',
            gocardless_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
        } else if (action === 'paid_out' || action === 'confirmed') {
          // Crée le règlement + marque succeeded
          let reglementId = pe.reglement_id
          if (pe.facture_id && !reglementId) {
            const montantEuros = Number(((pe.montant_centimes || 0) / 100).toFixed(2))
            const { data: regl } = await sb.from('reglements').insert({
              ecole_id: pe.ecole_id,
              facture_id: pe.facture_id,
              famille_id: pe.famille_id,
              montant: montantEuros,
              mode_paiement: 'sepa',
              date_reglement: new Date().toISOString().slice(0, 10),
              reference: `GoCardless ${paymentId?.slice(0, 12) || ''}`,
              commentaire: 'Prélèvement SEPA via GoCardless',
            }).select('id').single()
            reglementId = regl?.id
          }
          await sb.from('paiements_en_ligne').update({
            statut: 'succeeded',
            gocardless_payment_id: paymentId,
            reglement_id: reglementId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)

          // Recalcule statut facture
          if (pe.facture_id) {
            const { data: sol } = await sb.from('factures_solde')
              .select('total_facture, total_regle, solde_restant').eq('id', pe.facture_id).maybeSingle()
            if (sol) {
              const restant = Number(sol.solde_restant) || 0
              const regle = Number(sol.total_regle) || 0
              const total = Number(sol.total_facture) || 0
              let statut: 'en_attente' | 'partiel' | 'paye' = 'en_attente'
              if (restant <= 0.01 && total > 0) statut = 'paye'
              else if (regle > 0) statut = 'partiel'
              await sb.from('factures').update({ statut }).eq('id', pe.facture_id)
            }
          }
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
