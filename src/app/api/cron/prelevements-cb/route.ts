import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createOffSessionPayment } from '@/lib/stripe'
import { getIntegration } from '@/lib/integrations'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/prelevements-cb  (yyyy3 — quotidien, cf. vercel.json)
 *
 * Prélève par carte (off-session) les échéances arrivées à date des familles
 * ayant un mandat CB actif. Politique d'échec validée par Avi :
 *   tentative 1 à la date de l'échéance, retry J+3, retry J+7 ;
 *   email au parent à chaque échec ; après le 3e échec le mandat est suspendu
 *   et les admins finances de l'école sont alertés.
 *
 * Idempotence : UNIQUE(echeance_id, tentative) en base + Idempotency-Key Stripe.
 * Un rejeu du cron ne peut ni recréer une tentative ni débiter deux fois.
 * Sécurité : fail-closed sur CRON_SECRET (même règle que relances-auto).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET non configuré' }, { status: 500 })
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // llll5 (01/09/2026) : rattacher les échéances orphelines à leur facture AVANT de
  // prélever. Les échéanciers générés depuis un contrat pouvaient ne pas porter
  // facture_id (1 268 échéances Eschel) → prélèvement réel mais AUCUN règlement
  // créé (ce fichier et le webhook GoCardless exigent facture_id). Filet en base
  // (trigger + fonction) ; ici on force le rattachement au démarrage du cron.
  const { error: rattErr } = await sb.rpc('rattacher_factures_echeances')
  if (rattErr) console.error('[cron] rattacher_factures_echeances:', rattErr.message)

  const today = new Date().toISOString().slice(0, 10)
  const resume = { preleves: 0, echecs: 0, suspendus: 0, ignores: 0, erreurs: [] as string[] }

  // 1. Mandats actifs (multi-écoles). Peu de lignes : pas de pagination nécessaire ici,
  //    mais on la garde par principe (leçon du cron relances non paginé).
  const mandats: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('mandats_cb').select('*').eq('statut', 'actif').range(from, from + 999)
    if (error) return NextResponse.json({ error: 'lecture mandats : ' + error.message }, { status: 500 })
    mandats.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  if (mandats.length === 0) return NextResponse.json({ ok: true, message: 'Aucun mandat actif', ...resume })

  // Clés Stripe par école (une lecture par école, pas par mandat)
  const integByEcole = new Map<string, { secretKey: string } | null>()
  async function stripeKey(ecoleId: string): Promise<string | null> {
    if (!integByEcole.has(ecoleId)) {
      const integ = await getIntegration(ecoleId, 'stripe')
      integByEcole.set(ecoleId, integ?.secrets?.secret_key ? { secretKey: integ.secrets.secret_key } : null)
    }
    return integByEcole.get(ecoleId)?.secretKey ?? null
  }

  const ecoleNoms = new Map<string, string>()
  async function nomEcole(ecoleId: string): Promise<string> {
    if (!ecoleNoms.has(ecoleId)) {
      const { data } = await sb.from('ecoles').select('nom').eq('id', ecoleId).single()
      ecoleNoms.set(ecoleId, data?.nom || 'Votre école')
    }
    return ecoleNoms.get(ecoleId)!
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'

  for (const mandat of mandats) {
    const sk = await stripeKey(mandat.ecole_id)
    if (!sk) { resume.ignores++; continue } // intégration désactivée entre-temps

    // 2a. Nouvelles échéances dues (aucune tentative existante)
    const { data: dues, error: duesErr } = await sb
      .from('cheques_prevus')
      .select('id, facture_id, montant, date_echeance')
      .eq('famille_id', mandat.famille_id)
      .eq('statut', 'prevu')
      .eq('mode_paiement', 'stripe')
      .lte('date_echeance', today)
      .is('report_solde_id', null)
      .gt('montant', 0)
    if (duesErr) { resume.erreurs.push(`échéances famille ${mandat.famille_id} : ${duesErr.message}`); continue }

    const aTraiter: { echeanceId: string; factureId: string | null; montant: number; tentative: number }[] = []
    for (const e of dues ?? []) {
      const { data: deja } = await sb.from('prelevements_cb')
        .select('id').eq('echeance_id', e.id).limit(1)
      if (!deja || deja.length === 0) {
        aTraiter.push({ echeanceId: e.id, factureId: e.facture_id, montant: Number(e.montant), tentative: 1 })
      }
    }

    // 2b. Retries programmés (échec précédent, prochaine_tentative atteinte)
    const { data: retries } = await sb.from('prelevements_cb')
      .select('echeance_id, facture_id, montant, tentative')
      .eq('mandat_id', mandat.id)
      .eq('statut', 'echec')
      .lte('prochaine_tentative', today)
      .lt('tentative', 3)
    for (const r of retries ?? []) {
      // ne pas retenter si l'échéance a été réglée autrement entre-temps
      const { data: ech } = await sb.from('cheques_prevus').select('statut').eq('id', r.echeance_id).single()
      if (ech?.statut !== 'prevu') continue
      const { data: dejaT } = await sb.from('prelevements_cb')
        .select('id').eq('echeance_id', r.echeance_id).eq('tentative', r.tentative + 1).limit(1)
      if (!dejaT || dejaT.length === 0) {
        aTraiter.push({ echeanceId: r.echeance_id, factureId: r.facture_id, montant: Number(r.montant), tentative: r.tentative + 1 })
      }
    }

    for (const t of aTraiter) {
      const montantCentimes = Math.round(t.montant * 100)
      if (montantCentimes < 50) { resume.ignores++; continue }

      // Journal AVANT l'appel Stripe (UNIQUE echeance+tentative = anti-course)
      const { data: prel, error: prelErr } = await sb.from('prelevements_cb').insert({
        mandat_id: mandat.id,
        ecole_id: mandat.ecole_id,
        famille_id: mandat.famille_id,
        echeance_id: t.echeanceId,
        facture_id: t.factureId,
        montant: t.montant,
        tentative: t.tentative,
        statut: 'en_cours',
      }).select('id').single()
      if (prelErr || !prel?.id) { resume.ignores++; continue } // doublon = déjà traité par un autre run

      const ecoleNom = await nomEcole(mandat.ecole_id)
      const paiement = await createOffSessionPayment({
        secretKey: sk,
        customerId: mandat.stripe_customer_id,
        paymentMethodId: mandat.stripe_payment_method_id,
        montantCentimes,
        description: `${ecoleNom} — échéance du ${t.echeanceId.slice(0, 8)}`,
        idempotencyKey: `prel_${t.echeanceId}_t${t.tentative}`,
        metadata: { echeance_id: t.echeanceId, famille_id: mandat.famille_id, ecole_id: mandat.ecole_id, prelevement_id: prel.id, tentative: String(t.tentative) },
      })

      if (paiement.ok) {
        // Règlement (anti-doublon par référence, même pattern que le webhook)
        const refCb = `CB auto ${t.echeanceId.slice(0, 8)}`
        let reglementId: string | null = null
        const { data: dejaRegl } = t.factureId
          ? await sb.from('reglements').select('id').eq('facture_id', t.factureId).eq('reference', refCb).maybeSingle()
          : { data: null }
        if (dejaRegl?.id) reglementId = dejaRegl.id
        else if (t.factureId) {
          const { data: regl, error: reglErr } = await sb.from('reglements').insert({
            facture_id: t.factureId,
            famille_id: mandat.famille_id,
            montant: t.montant,
            mode_paiement: 'stripe',
            date_reglement: today,
            reference: refCb,
            notes: `Prélèvement automatique CB (tentative ${t.tentative})`,
          }).select('id').single()
          if (reglErr) resume.erreurs.push(`règlement échéance ${t.echeanceId} : ${reglErr.message}`)
          else reglementId = regl?.id ?? null
        }

        await sb.from('cheques_prevus').update({ statut: 'encaisse', encaisse_le: new Date().toISOString() }).eq('id', t.echeanceId)
        await sb.from('prelevements_cb').update({
          statut: 'reussi', stripe_payment_intent_id: paiement.id, reglement_id: reglementId, updated_at: new Date().toISOString(),
        }).eq('id', prel.id)
        await sb.from('mandats_cb').update({ echecs_consecutifs: 0, derniere_erreur: null, updated_at: new Date().toISOString() }).eq('id', mandat.id)

        // Statut facture (même règle que le webhook)
        if (t.factureId) {
          const { data: sol } = await sb.from('factures_solde').select('total_facture, total_regle, solde_restant').eq('id', t.factureId).maybeSingle()
          if (sol) {
            const total = Number(sol.total_facture) || 0
            const regle = Number(sol.total_regle) || 0
            const restant = Number(sol.solde_restant) || 0
            const statut = (restant <= 0.01 && total > 0) ? 'paye' : (regle > 0 || restant < total) ? 'partiel' : 'en_attente'
            await sb.from('factures').update({ statut }).eq('id', t.factureId)
          }
        }
        resume.preleves++
      } else {
        resume.echecs++
        const derniere = t.tentative >= 3
        const prochaine = derniere ? null : t.tentative === 1
          ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)   // J+3
          : new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)   // J+7 depuis l'origine
        await sb.from('prelevements_cb').update({
          statut: 'echec', erreur: paiement.error, stripe_payment_intent_id: paiement.paymentIntentId || null,
          prochaine_tentative: prochaine, updated_at: new Date().toISOString(),
        }).eq('id', prel.id)
        await sb.from('mandats_cb').update({
          echecs_consecutifs: (mandat.echecs_consecutifs || 0) + 1,
          derniere_erreur: paiement.error,
          ...(derniere ? { statut: 'suspendu' } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', mandat.id)
        if (derniere) resume.suspendus++

        // Email parent à CHAQUE échec, avec lien de paiement manuel
        const { data: famMail } = await sb.from('familles')
          .select('nom, parent1_email, parent2_email').eq('id', mandat.famille_id).single()
        const ecoleNomMail = await nomEcole(mandat.ecole_id)
        const destinataires = [famMail?.parent1_email, famMail?.parent2_email].filter(Boolean).map((email: any) => ({ email }))
        if (destinataires.length > 0) {
          await sendEmail({
            to: destinataires,
            fromName: ecoleNomMail,
            subject: derniere
              ? `${ecoleNomMail} — prélèvement impossible, action requise`
              : `${ecoleNomMail} — échec du prélèvement de ${t.montant.toFixed(2)} €`,
            html: `<p>Bonjour,</p>
<p>Le prélèvement automatique de <strong>${t.montant.toFixed(2)} €</strong> prévu sur votre carte a échoué${paiement.error ? ` (${paiement.error})` : ''}.</p>
${derniere
  ? `<p><strong>Après trois tentatives, le prélèvement automatique est suspendu.</strong> Merci de mettre à jour votre carte ou de régler directement depuis votre espace, puis de réactiver le prélèvement automatique.</p>`
  : `<p>Une nouvelle tentative aura lieu automatiquement. Vous pouvez aussi régler dès maintenant depuis votre espace.</p>`}
<p><a href="${baseUrl}/portail/factures">Accéder à mes factures</a></p>
<p>${ecoleNomMail}</p>`,
          }).catch(() => null)
        }

        // Alerte admins finances après la 3e tentative
        if (derniere) {
          const { data: admins } = await sb.from('profiles_with_email')
            .select('email').eq('ecole_id', mandat.ecole_id).eq('role', 'admin').eq('acces_finances', true)
          const adminMails = (admins ?? []).map((a: any) => a.email).filter(Boolean).map((email: string) => ({ email }))
          if (adminMails.length > 0) {
            await sendEmail({
              to: adminMails,
              fromName: 'TalmidApp',
              subject: `Prélèvement CB suspendu — famille ${famMail?.nom || mandat.famille_id}`,
              html: `<p>Le prélèvement automatique de la famille <strong>${famMail?.nom || ''}</strong> a échoué 3 fois (${paiement.error || 'raison inconnue'}).</p>
<p>Le mandat est suspendu : la famille doit mettre à jour sa carte. Montant en attente : <strong>${t.montant.toFixed(2)} €</strong>.</p>`,
            }).catch(() => null)
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, date: today, ...resume })
}
