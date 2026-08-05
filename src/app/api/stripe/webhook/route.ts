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

        // yyyy3 : session en mode "setup" = enregistrement de carte pour le
        // prélèvement automatique (mandat), PAS un paiement. On enregistre le
        // mandat depuis la vérité Stripe (setup_intent -> payment_method).
        if (session.mode === 'setup') {
          const meta = session.metadata || {}
          const familleId = meta.famille_id
          const ecoleIdSetup = meta.ecole_id || ecole.id
          if (!familleId) {
            console.error('[stripe webhook] setup sans famille_id en metadata')
            return NextResponse.json({ received: true, warning: 'setup sans famille_id' })
          }
          const integ = await getIntegration(ecoleIdSetup, 'stripe')
          const sk = integ?.secrets?.secret_key
          if (!sk) return NextResponse.json({ received: false, error: 'secret_key manquante' }, { status: 500 })

          const { retrieveSetupIntent, retrievePaymentMethod } = await import('@/lib/stripe')
          const si = await retrieveSetupIntent(sk, session.setup_intent as string)
          const pmId = si?.payment_method
          if (!pmId) return NextResponse.json({ received: false, error: 'payment_method absent du setup_intent' }, { status: 500 })
          const pm = await retrievePaymentMethod(sk, pmId)

          const { error: upErr } = await supabaseAdmin.from('mandats_cb').upsert({
            ecole_id: ecoleIdSetup,
            famille_id: familleId,
            stripe_customer_id: (session.customer as string) || si.customer,
            stripe_payment_method_id: pmId,
            carte_marque: pm?.card?.brand || null,
            carte_last4: pm?.card?.last4 || null,
            carte_exp_mois: pm?.card?.exp_month || null,
            carte_exp_annee: pm?.card?.exp_year || null,
            statut: 'actif',
            echecs_consecutifs: 0,
            derniere_erreur: null,
            active_par: meta.profile_id || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'ecole_id,famille_id' })
          if (upErr) {
            console.error('[stripe webhook] upsert mandat failed:', upErr.message)
            return NextResponse.json({ received: false, error: 'upsert mandat failed' }, { status: 500 })
          }

          // Bascule les échéances FUTURES non réglées de la famille en mode CB —
          // SAUF les chèques (des chèques physiques peuvent déjà être entre les
          // mains de l'école : les prélever en plus = double encaissement).
          const { error: swErr } = await supabaseAdmin.from('cheques_prevus')
            .update({ mode_paiement: 'stripe' })
            .eq('famille_id', familleId)
            .eq('statut', 'prevu')
            .gte('date_echeance', new Date().toISOString().slice(0, 10))
            // NULL != 'cheque' est NULL en SQL : .neq exclurait les modes non renseignés
            .or('mode_paiement.is.null,mode_paiement.neq.cheque')
            .is('report_solde_id', null)
          if (swErr) console.error('[stripe webhook] bascule echeances mandat:', swErr.message)

          return NextResponse.json({ received: true, mandat: true })
        }
        const paymentIntentId = session.payment_intent as string | null
        const amountTotal = Number(session.amount_total) || 0
        const meta = session.metadata || {}

        // FIX audit RLS 29/07/2026 (suite) : une lecture en echec ne doit JAMAIS
        // etre confondue avec « aucune ligne ». Avec le design « 5xx = rejeu »,
        // un `pe` null par erreur transitoire ferait repartir la creation du
        // reglement depuis les seules metadata -> risque de double reglement.
        const { data: pe, error: peErr } = await supabaseAdmin
          .from('paiements_en_ligne')
          .select('id, facture_id, ecole_id, famille_id, montant_centimes, reglement_id, statut')
          .eq('stripe_session_id', sessionId)
          .maybeSingle()
        if (peErr) {
          console.error('[stripe webhook] lecture paiements_en_ligne failed:', peErr.message)
          return NextResponse.json({ received: false, error: 'lecture paiement_en_ligne failed' }, { status: 500 })
        }

        const factureId = pe?.facture_id || meta.facture_id
        const ecoleId = pe?.ecole_id || meta.ecole_id || ecole.id
        const montantEuros = Number(((pe?.montant_centimes ?? amountTotal) / 100).toFixed(2))

        let reglementId = pe?.reglement_id
        if (factureId && !reglementId) {
          // FIX audit 24/07/2026 pt 13 : anti-doublon (retry de webhook sans ligne
          // paiements_en_ligne) — verifier qu'un reglement avec cette reference n'existe pas deja
          const refStripe = `Stripe ${sessionId.slice(0, 12)}`
          const { data: dejaLa, error: dejaErr } = await supabaseAdmin.from('reglements')
            .select('id').eq('facture_id', factureId).eq('reference', refStripe).maybeSingle()
          // Si cette lecture echoue, `dejaLa` vaut null : la garde anti-doublon
          // sauterait et on inserterait un SECOND reglement au rejeu. On rejoue
          // plutot l'evenement (meme pattern que api/gocardless/webhook).
          if (dejaErr) {
            console.error('[stripe webhook] lecture reglement existant failed:', dejaErr.message)
            return NextResponse.json({ received: false, error: 'lecture reglement existant failed' }, { status: 500 })
          }
          if (dejaLa?.id) {
            reglementId = dejaLa.id
          } else {
            // FIX 05/08 : la table reglements n'a PAS de colonne ecole_id (l'ecole se
            // deduit de famille_id). L'insert echouait en 42703 -> webhook en 500,
            // paiement encaisse chez Stripe mais jamais enregistre dans TalmidApp.
            const { data: regl, error: reglErr } = await supabaseAdmin.from('reglements').insert({
              facture_id: factureId,
              famille_id: pe?.famille_id || meta.famille_id || null,
              montant: montantEuros,
              mode_paiement: 'stripe',
              date_reglement: new Date().toISOString().slice(0, 10),
              reference: refStripe,
              // FIX : colonne 'commentaire' inexistante sur reglements (verifie en BDD) ->
              // l'insert echouait silencieusement et le paiement passait succeeded sans reglement
              notes: 'Paiement en ligne Stripe',
            }).select('id').single()
            if (reglErr || !regl?.id) {
              console.error('[stripe webhook] insert reglement failed:', reglErr?.message)
              return NextResponse.json({ received: true, error: 'insert reglement failed' }, { status: 500 })
            }
            reglementId = regl.id
          }
        }

        // FIX audit RLS 29/07/2026 : toutes les ecritures ci-dessous sont verifiees.
        // Une policy qui refuse un update renvoie { error } sans lever d'exception :
        // on repondait 200 et Stripe ne rejouait JAMAIS l'evenement (paiement
        // encaisse chez Stripe, invisible dans TalmidApp).
        // Toutes ces operations sont idempotentes (update par id / statut recalcule
        // + garde anti-doublon sur le reglement) : un 500 provoque un simple rejeu.
        if (pe?.id) {
          const { error: upPeErr } = await supabaseAdmin
            .from('paiements_en_ligne')
            .update({
              statut: 'succeeded',
              stripe_payment_intent_id: paymentIntentId,
              reglement_id: reglementId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', pe.id)
          if (upPeErr) {
            console.error('[stripe webhook] update paiements_en_ligne failed:', upPeErr.message)
            return NextResponse.json({ received: false, error: 'update paiement_en_ligne failed' }, { status: 500 })
          }
        }

        if (factureId && paymentIntentId) {
          const { error: upFactPiErr } = await supabaseAdmin.from('factures').update({ stripe_payment_intent_id: paymentIntentId }).eq('id', factureId)
          if (upFactPiErr) {
            console.error('[stripe webhook] update factures.stripe_payment_intent_id failed:', upFactPiErr.message)
            return NextResponse.json({ received: false, error: 'update facture failed' }, { status: 500 })
          }
        }

        if (factureId) {
          const { data: sol, error: solErr } = await supabaseAdmin
            .from('factures_solde')
            .select('total_facture, total_regle, solde_restant')
            .eq('id', factureId)
            .maybeSingle()
          if (solErr) {
            console.error('[stripe webhook] lecture factures_solde failed:', solErr.message)
            return NextResponse.json({ received: false, error: 'lecture solde facture failed' }, { status: 500 })
          }
          if (sol) {
            // NOTE : `total_regle` exclut les avoirs imputés (vrais paiements uniquement).
            // Ici on vient d'enregistrer un paiement Stripe (non-avoir) donc `regle > 0` ;
            // le statut 'partiel' est donc bien atteint. Le statut 'paye' s'appuie sur
            // `solde_restant` qui est mathématiquement correct.
            const total = Number(sol.total_facture) || 0
            const regle = Number(sol.total_regle) || 0
            const restant = Number(sol.solde_restant) || 0
            let statut: 'en_attente' | 'partiel' | 'paye' = 'en_attente'
            if (restant <= 0.01 && total > 0) statut = 'paye'
            else if (regle > 0 || restant < total) statut = 'partiel'
            const { error: upStatutErr } = await supabaseAdmin.from('factures').update({ statut }).eq('id', factureId)
            if (upStatutErr) {
              console.error('[stripe webhook] update factures.statut failed:', upStatutErr.message)
              return NextResponse.json({ received: false, error: 'update statut facture failed' }, { status: 500 })
            }
          }
        }
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object
        const { error: upExpErr } = await supabaseAdmin
          .from('paiements_en_ligne')
          .update({ statut: 'expired', updated_at: new Date().toISOString() })
          .eq('stripe_session_id', session.id)
        if (upExpErr) {
          console.error('[stripe webhook] update statut expired failed:', upExpErr.message)
          return NextResponse.json({ received: false, error: 'update paiement_en_ligne failed' }, { status: 500 })
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object
        const { error: upFailErr } = await supabaseAdmin
          .from('paiements_en_ligne')
          .update({ statut: 'failed', stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', pi.id)
        if (upFailErr) {
          console.error('[stripe webhook] update statut failed:', upFailErr.message)
          return NextResponse.json({ received: false, error: 'update paiement_en_ligne failed' }, { status: 500 })
        }
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
