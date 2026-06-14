import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/stripe'
import { getIntegration, findEcoleBySlug } from '@/lib/integrations'

export const runtime = 'nodejs'

/**
 * POST /api/stripe/webhook?ecole=<slug>
 * URL à configurer par chaque école dans son Stripe Dashboard.
 * Le slug permet de retrouver le webhook_secret propre à cette école.
 */
export async function POST(req: NextRequest) {
  // 1. Slug école depuis la query
  const url = new URL(req.url)
  const slug = url.searchParams.get('ecole')
  if (!slug) {
    return NextResponse.json({ error: 'Paramètre ?ecole=<slug> requis' }, { status: 400 })
  }
  const ecole = await findEcoleBySlug(slug)
  if (!ecole) {
    return NextResponse.json({ error: `École introuvable pour slug ${slug}` }, { status: 404 })
  }

  // 2. Récupère webhook_secret depuis BDD chiffrée
  const integration = await getIntegration(ecole.id, 'stripe')
  if (!integration) {
    return NextResponse.json({ error: 'Stripe non configuré pour cette école' }, { status: 400 })
  }
  const webhookSecret = integration.secrets.webhook_secret
  if (!webhookSecret) {
    return NextResponse.json({ error: 'webhook_secret Stripe manquant pour cette école' }, { status: 400 })
  }

  // 3. Vérification signature
  const sig = req.headers.get('stripe-signature')
  const payload = await req.text()
  const verified = verifyWebhookSignature(payload, sig, webhookSecret)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error || 'Signature invalide' }, { status: 400 })
  }
  const event = verified.event

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const sessionId = session.id as string
        const paymentIntentId = session.payment_intent as string | null
        const amountTotal = Number(session.amount_total) || 0
        const meta = session.metadata || {}

        const { data: pe } = await supabaseAdmin
          .from('paiements_en_ligne')
          .select('id, facture_id, ecole_id, famille_id, montant_centimes, reglement_id, statut')
          .eq('stripe_session_id', sessionId)
          .maybeSingle()

        const factureId = pe?.facture_id || meta.facture_id
        const ecoleId = pe?.ecole_id || meta.ecole_id || ecole.id
        const montantEuros = Number(((pe?.montant_centimes ?? amountTotal) / 100).toFixed(2))

        let reglementId = pe?.reglement_id
        if (factureId && !reglementId) {
          const { data: regl } = await supabaseAdmin.from('reglements').insert({
            ecole_id: ecoleId,
            facture_id: factureId,
            famille_id: pe?.famille_id || meta.famille_id || null,
            montant: montantEuros,
            mode_paiement: 'stripe',
            date_reglement: new Date().toISOString().slice(0, 10),
            reference: `Stripe ${sessionId.slice(0, 12)}`,
            commentaire: 'Paiement en ligne Stripe',
          }).select('id').single()
          reglementId = regl?.id
        }

        if (pe?.id) {
          await supabaseAdmin
            .from('paiements_en_ligne')
            .update({
              statut: 'succeeded',
              stripe_payment_intent_id: paymentIntentId,
              reglement_id: reglementId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', pe.id)
        }

        if (factureId && paymentIntentId) {
          await supabaseAdmin.from('factures').update({ stripe_payment_intent_id: paymentIntentId }).eq('id', factureId)
        }

        if (factureId) {
          const { data: sol } = await supabaseAdmin
            .from('factures_solde')
            .select('total_facture, total_regle, solde_restant')
            .eq('id', factureId)
            .maybeSingle()
          if (sol) {
            const total = Number(sol.total_facture) || 0
            const regle = Number(sol.total_regle) || 0
            const restant = Number(sol.solde_restant) || 0
            let statut: 'en_attente' | 'partiel' | 'paye' = 'en_attente'
            if (restant <= 0.01 && total > 0) statut = 'paye'
            else if (regle > 0) statut = 'partiel'
            await supabaseAdmin.from('factures').update({ statut }).eq('id', factureId)
          }
        }
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object
        await supabaseAdmin
          .from('paiements_en_ligne')
          .update({ statut: 'expired', updated_at: new Date().toISOString() })
          .eq('stripe_session_id', session.id)
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        await supabaseAdmin
          .from('paiements_en_ligne')
          .update({ statut: 'failed', stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', pi.id)
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur webhook' }, { status: 500 })
  }
}
