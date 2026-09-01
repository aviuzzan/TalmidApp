import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/gocardless'
import { getIntegration, findEcoleBySlug } from '@/lib/integrations'
import { sendEmail } from '@/lib/email'

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

  // FIX audit RLS 29/07/2026 : une policy qui refuse une ecriture renvoie
  // { error } sans lever d'exception. On repondait 200 quoi qu'il arrive et
  // GoCardless ne rejouait JAMAIS l'evenement (prelevement encaisse, invisible
  // dans TalmidApp). Desormais on collecte les echecs d'ecriture et on repond
  // 500 en fin de traitement pour declencher le rejeu.
  // On continue a traiter les evenements suivants du lot : tous les handlers
  // sont idempotents (upsert, update par id, garde anti-doublon sur reglement),
  // donc un rejeu complet du lot est sans effet de bord.
  const echecs: string[] = []
  try {
    for (const ev of verified.events || []) {
      const resource = ev.resource_type
      const action = ev.action
      const links = ev.links || {}

      if (resource === 'billing_requests' && action === 'fulfilled') {
        // jjjj1 : rattachement mandat -> famille au moment de la signature.
        const brId = links.billing_request
        const brMandateId = links.mandate_request_mandate
        if (brId && brMandateId) {
          const { data: row, error: rowErr } = await sb.from('mandats_gocardless')
            .select('id, statut').eq('gocardless_billing_request_id', brId).maybeSingle()
          if (rowErr) {
            echecs.push(`billing_request ${brId} (lecture mandat) : ${rowErr.message}`)
          } else if (row) {
            // Flow "mandat seul" : la ligne pending a ete creee par /api/gocardless/mandat
            const { error } = await sb.from('mandats_gocardless').update({
              gocardless_mandate_id: brMandateId,
              statut: row.statut === 'active' ? 'active' : 'signe',
              updated_at: new Date().toISOString(),
            }).eq('id', row.id)
            if (error) echecs.push(`billing_request ${brId} (maj mandat) : ${error.message}`)
          } else {
            // Mandat signe via le paiement d'une facture : famille via paiements_en_ligne
            const { data: peBr } = await sb.from('paiements_en_ligne')
              .select('famille_id').eq('gocardless_billing_request_id', brId).maybeSingle()
            const { data: deja } = await sb.from('mandats_gocardless')
              .select('id, famille_id').eq('gocardless_mandate_id', brMandateId).maybeSingle()
            if (deja) {
              if (!deja.famille_id && peBr?.famille_id) {
                const { error } = await sb.from('mandats_gocardless').update({
                  famille_id: peBr.famille_id,
                  gocardless_billing_request_id: brId,
                  updated_at: new Date().toISOString(),
                }).eq('id', deja.id)
                if (error) echecs.push(`mandat ${brMandateId} (rattachement famille) : ${error.message}`)
              }
            } else {
              const { error } = await sb.from('mandats_gocardless').insert({
                ecole_id: ecole.id,
                famille_id: peBr?.famille_id ?? null,
                gocardless_mandate_id: brMandateId,
                gocardless_billing_request_id: brId,
                statut: 'signe',
              })
              if (error) echecs.push(`mandat ${brMandateId} (creation) : ${error.message}`)
            }
          }
        }
      }

      if (resource === 'mandates') {
        const mandateId = links.mandate
        if (action === 'active' && mandateId) {
          // jjjj1 : update d'abord (ne pas ecraser famille_id), insert seulement si inconnu
          const { data: upd, error: updErr } = await sb.from('mandats_gocardless')
            .update({ statut: 'active', echecs_consecutifs: 0, derniere_erreur: null, updated_at: new Date().toISOString() })
            .eq('gocardless_mandate_id', mandateId)
            .select('id')
          if (updErr) {
            console.error('[gocardless webhook] maj mandat active failed:', updErr.message)
            echecs.push(`mandat ${mandateId} active : ${updErr.message}`)
          } else if (!upd || upd.length === 0) {
            const { error: insErr } = await sb.from('mandats_gocardless').insert({
              ecole_id: ecole.id, gocardless_mandate_id: mandateId, statut: 'active',
            })
            if (insErr) {
              console.error('[gocardless webhook] insert mandat active failed:', insErr.message)
              echecs.push(`mandat ${mandateId} active (insert) : ${insErr.message}`)
            }
          }
        } else if ((action === 'failed' || action === 'cancelled' || action === 'expired') && mandateId) {
          const statutMandat = action === 'failed' ? 'failed' : 'revoque'
          const { error: upMandErr } = await sb.from('mandats_gocardless').update({ statut: statutMandat, updated_at: new Date().toISOString() }).eq('gocardless_mandate_id', mandateId)
          if (upMandErr) {
            console.error('[gocardless webhook] update mandat failed:', upMandErr.message)
            echecs.push(`mandat ${mandateId} ${action} : ${upMandErr.message}`)
          }
        }
      }

      if (resource === 'payments') {
        const paymentId = links.payment
        const billingRequestId = links.billing_request

        // jjjj1 : un paiement vient d'un checkout (billing request) OU du cron
        // de prelevement des echeances (gocardless_payment_id direct).
        const SELECT_PE = 'id, facture_id, ecole_id, famille_id, montant_centimes, reglement_id, statut, metadata'
        let pe: any = null
        if (billingRequestId) {
          const { data, error } = await sb.from('paiements_en_ligne').select(SELECT_PE)
            .eq('gocardless_billing_request_id', billingRequestId).maybeSingle()
          if (error) {
            console.error('[gocardless webhook] lecture paiements_en_ligne failed:', error.message)
            echecs.push(`lecture paiement ${billingRequestId} : ${error.message}`)
            continue
          }
          pe = data
        }
        if (!pe && paymentId) {
          const { data, error } = await sb.from('paiements_en_ligne').select(SELECT_PE)
            .eq('gocardless_payment_id', paymentId).maybeSingle()
          if (error) {
            console.error('[gocardless webhook] lecture paiements_en_ligne failed:', error.message)
            echecs.push(`lecture paiement ${paymentId} : ${error.message}`)
            continue
          }
          pe = data
        }
        if (!pe) continue

        // FIX audit 24/07/2026 pt 12 : la branche 'confirmed' etait inatteignable
        // (matchee par le premier if). Desormais :
        //   submitted            -> pending (preleve chez le payeur, pas encore garanti)
        //   confirmed | paid_out -> reglement cree (confirmed = prelevement effectif
        //                           chez la famille ; ne pas attendre le versement
        //                           paid_out a l'ecole, plusieurs jours plus tard)
        if (action === 'submitted') {
          const { error: upSubErr } = await sb.from('paiements_en_ligne').update({
            statut: 'pending',
            gocardless_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
          if (upSubErr) {
            console.error('[gocardless webhook] update statut pending failed:', upSubErr.message)
            echecs.push(`paiement ${paymentId} submitted : ${upSubErr.message}`)
          }
        } else if (action === 'confirmed' || action === 'paid_out') {
          // Idempotent : si un reglement est deja lie (confirmed puis paid_out), ne rien recreer
          let reglementId = pe.reglement_id
          if (pe.facture_id && !reglementId) {
            const montantEuros = Number(((pe.montant_centimes || 0) / 100).toFixed(2))
            const refGc = `GoCardless ${paymentId?.slice(0, 12) || ''}`
            // Anti-doublon au rejeu : si l'insert du reglement avait reussi mais que
            // le update de paiements_en_ligne avait echoue, pe.reglement_id est encore
            // vide au rejeu — sans cette garde on creerait un second reglement.
            const { data: dejaLa, error: dejaErr } = await sb.from('reglements')
              .select('id').eq('facture_id', pe.facture_id).eq('reference', refGc).maybeSingle()
            if (dejaErr) {
              console.error('[gocardless webhook] lecture reglement existant failed:', dejaErr.message)
              echecs.push(`paiement ${paymentId} (lecture reglement) : ${dejaErr.message}`)
              continue
            }
            if (dejaLa?.id) {
              reglementId = dejaLa.id
            } else {
              // FIX 05/08 : reglements n'a pas de colonne ecole_id (42703 -> webhook en echec)
              const { data: regl, error: reglErr } = await sb.from('reglements').insert({
                facture_id: pe.facture_id,
                famille_id: pe.famille_id,
                montant: montantEuros,
                mode_paiement: 'sepa',
                date_reglement: new Date().toISOString().slice(0, 10),
                reference: refGc,
                notes: 'Prélèvement SEPA via GoCardless',
              }).select('id').single()
              // FIX pt 13 : verifier l'erreur d'insert — ne pas marquer succeeded sans reglement
              if (reglErr || !regl?.id) {
                console.error('[gocardless webhook] insert reglement failed:', reglErr?.message)
                echecs.push(`paiement ${paymentId} (insert reglement) : ${reglErr?.message || 'aucune ligne creee'}`)
                continue
              }
              reglementId = regl.id
            }
          }
          const { error: upConfErr } = await sb.from('paiements_en_ligne').update({
            statut: 'succeeded',
            gocardless_payment_id: paymentId,
            reglement_id: reglementId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
          if (upConfErr) {
            console.error('[gocardless webhook] update statut succeeded failed:', upConfErr.message)
            echecs.push(`paiement ${paymentId} confirmed : ${upConfErr.message}`)
          }
          // Statut facture : recalcule automatiquement par le trigger BDD trg_reglements_statut

          // jjjj1 : echeance prelevee par le cron -> encaisser + solder le journal
          const mdConf = (pe.metadata || {}) as any
          if (mdConf.echeance_id) {
            const { error: echErr } = await sb.from('cheques_prevus')
              .update({ statut: 'encaisse', encaisse_le: new Date().toISOString() })
              .eq('id', mdConf.echeance_id).in('statut', ['prevu', 'rejete']) // mmmm5 : relance réussie après impayé
            if (echErr) echecs.push(`echeance ${mdConf.echeance_id} : ${echErr.message}`)
            if (mdConf.prelevement_id) {
              await sb.from('prelevements_gocardless').update({
                statut: 'reussi', gocardless_payment_id: paymentId, reglement_id: reglementId, updated_at: new Date().toISOString(),
              }).eq('id', mdConf.prelevement_id)
            }
            if (mdConf.mandat_id) {
              await sb.from('mandats_gocardless').update({ echecs_consecutifs: 0, derniere_erreur: null, updated_at: new Date().toISOString() }).eq('id', mdConf.mandat_id)
            }
          }
        } else if (action === 'failed' || action === 'cancelled' || action === 'late_failure' || action === 'charged_back') {
          // mmmm5 : late_failure / charged_back = impayé APRÈS confirmation, traité comme un rejet
          const { error: upFailErr } = await sb.from('paiements_en_ligne').update({
            statut: 'failed',
            gocardless_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          }).eq('id', pe.id)
          if (upFailErr) {
            console.error('[gocardless webhook] update statut failed:', upFailErr.message)
            echecs.push(`paiement ${paymentId} failed : ${upFailErr.message}`)
          }

          // jjjj1 : echec d'un prelevement d'echeance -> retry J+3/J+7 puis suspension
          // apres 3 tentatives (miroir de la politique du cron CB validee par Avi).
          const mdFail = (pe.metadata || {}) as any
          const erreurGc = ev?.details?.description || ev?.details?.cause || action
          if (mdFail.echeance_id && mdFail.prelevement_id) {
            const { data: prow } = await sb.from('prelevements_gocardless')
              .select('id, mandat_id, tentative, montant, statut, reglement_id, echeance_id, facture_id, famille_id').eq('id', mdFail.prelevement_id).maybeSingle()
            if (prow && prow.statut !== 'echec') {
              // mmmm5 (arbitrage Avi 01/09) : le prélèvement avait été REMIS (règlement
              // créé à la date d'échéance) -> on constate l'IMPAYÉ par un règlement
              // négatif (trace comptable, comme un chèque rejeté) et l'échéance passe
              // en « rejeté ». La relance J+3/J+7 ci-dessous crée ensuite un nouveau
              // paiement, donc un nouveau règlement positif si elle aboutit.
              if (prow.reglement_id && prow.facture_id) {
                const refImp = `IMPAYE ${paymentId?.slice(0, 12) || ''}`
                const { data: dejaImp } = await sb.from('reglements').select('id').eq('facture_id', prow.facture_id).eq('reference', refImp).maybeSingle()
                if (!dejaImp?.id) {
                  const { error: impErr } = await sb.from('reglements').insert({
                    facture_id: prow.facture_id,
                    famille_id: prow.famille_id,
                    montant: -Math.abs(Number(prow.montant || 0)),
                    mode_paiement: 'sepa',
                    date_reglement: new Date().toISOString().slice(0, 10),
                    reference: refImp,
                    notes: `Prélèvement SEPA impayé (${erreurGc})`,
                  })
                  if (impErr) echecs.push(`impayé ${paymentId} : ${impErr.message}`)
                }
                if (prow.echeance_id) {
                  await sb.from('cheques_prevus').update({ statut: 'rejete' }).eq('id', prow.echeance_id)
                }
              }
              const derniere = prow.tentative >= 3
              const prochaine = derniere ? null : prow.tentative === 1
                ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
                : new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)
              await sb.from('prelevements_gocardless').update({
                statut: 'echec', erreur: erreurGc, gocardless_payment_id: paymentId,
                prochaine_tentative: prochaine, updated_at: new Date().toISOString(),
              }).eq('id', prow.id)
              const { data: mrow } = await sb.from('mandats_gocardless')
                .select('echecs_consecutifs').eq('id', prow.mandat_id).maybeSingle()
              await sb.from('mandats_gocardless').update({
                echecs_consecutifs: (mrow?.echecs_consecutifs || 0) + 1,
                derniere_erreur: erreurGc,
                ...(derniere ? { statut: 'suspendu' } : {}),
                updated_at: new Date().toISOString(),
              }).eq('id', prow.mandat_id)

              const montantTxt = Number(prow.montant || 0).toFixed(2)
              const { data: famMail } = await sb.from('familles')
                .select('nom, parent1_email, parent2_email').eq('id', pe.famille_id).single()
              const { data: ecoleRow } = await sb.from('ecoles').select('nom').eq('id', ecole.id).single()
              const ecoleNom = ecoleRow?.nom || 'Votre école'
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'
              const destinataires = [famMail?.parent1_email, famMail?.parent2_email].filter(Boolean).map((email: any) => ({ email }))
              if (destinataires.length > 0) {
                await sendEmail({
                  to: destinataires,
                  fromName: ecoleNom,
                  subject: derniere
                    ? `${ecoleNom} — prélèvement impossible, action requise`
                    : `${ecoleNom} — échec du prélèvement SEPA de ${montantTxt} €`,
                  html: `<p>Bonjour,</p>
<p>Le prélèvement SEPA de <strong>${montantTxt} €</strong> sur votre compte a échoué (${erreurGc}).</p>
${derniere
  ? `<p><strong>Après trois tentatives, le prélèvement automatique est suspendu.</strong> Merci de régler directement depuis votre espace, puis de signer un nouveau mandat si nécessaire.</p>`
  : `<p>Une nouvelle tentative aura lieu automatiquement. Vous pouvez aussi régler dès maintenant depuis votre espace.</p>`}
<p><a href="${baseUrl}/portail/factures">Accéder à mes factures</a></p>
<p>${ecoleNom}</p>`,
                }).catch(() => null)
              }
              if (derniere) {
                const { data: admins } = await sb.from('profiles_with_email')
                  .select('email').eq('ecole_id', ecole.id).eq('role', 'admin').eq('acces_finances', true)
                const adminMails = (admins ?? []).map((a: any) => a.email).filter(Boolean).map((email: string) => ({ email }))
                if (adminMails.length > 0) {
                  await sendEmail({
                    to: adminMails,
                    fromName: 'TalmidApp',
                    subject: `Prélèvement SEPA suspendu — famille ${famMail?.nom || pe.famille_id}`,
                    html: `<p>Le prélèvement SEPA automatique de la famille <strong>${famMail?.nom || ''}</strong> a échoué 3 fois (${erreurGc}).</p>
<p>Le mandat est suspendu : la famille doit régler manuellement ou signer un nouveau mandat. Montant en attente : <strong>${montantTxt} €</strong>.</p>`,
                  }).catch(() => null)
                }
              }
            }
          }
        }
      }
    }

    if (echecs.length > 0) {
      // 500 volontaire : GoCardless rejouera le lot (handlers idempotents).
      return NextResponse.json({ received: false, error: 'Ecritures refusees', details: echecs }, { status: 500 })
    }

    return NextResponse.json({ received: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur webhook' }, { status: 500 })
  }
}
