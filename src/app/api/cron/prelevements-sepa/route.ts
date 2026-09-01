import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createMandatePayment } from '@/lib/gocardless'
import { getIntegration } from '@/lib/integrations'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/prelevements-sepa  (jjjj1 — quotidien 7h15, cf. vercel.json)
 *
 * Crée les paiements GoCardless des échéances des familles ayant un mandat SEPA
 * actif. IMPORTANT : contrairement au cron CB, le SEPA est asynchrone — AUCUN
 * règlement n'est créé ici. Le règlement est créé par le webhook à
 * payments.confirmed (prélèvement effectif chez la famille), et l'échéance
 * passe « encaisse » à ce moment-là. Les échecs (payments.failed) déclenchent
 * les retries J+3/J+7 et la suspension après 3 tentatives, gérés par le
 * webhook (miroir de la politique CB validée par Avi).
 *
 * nnnn1 — PRÉLÈVEMENT À LA DATE EXACTE DE L'ÉCHÉANCE (consigne Avi) :
 * le SEPA demande ~3 jours ouvrés de préavis, donc un paiement créé le jour J
 * n'était débité que vers J+3. Désormais le cron regarde 7 jours en avant et
 * crée le paiement AVEC charge_date = date de l'échéance : GoCardless débite
 * la famille pile le bon jour. Garde-fou : si GoCardless refuse la date
 * (échéance trop proche, week-end/férié bancaire), on recrée immédiatement
 * SANS charge_date (= première date possible) et ce n'est PAS compté en échec.
 * Les échéances déjà échues (rattrapage) partent sans charge_date.
 * NB : une fois le paiement soumis (jusqu'à 7 jours avant la date), modifier
 * le montant de l'échéance ne change plus le prélèvement en cours.
 *
 * Idempotence : UNIQUE(echeance_id, tentative) en base + Idempotency-Key GoCardless.
 * Un rejeu du cron ne peut ni recréer une tentative ni débiter deux fois.
 * Sécurité : fail-closed sur CRON_SECRET (même règle que les autres crons).
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
  // nnnn1 : fenêtre d'anticipation — on soumet à J-7 avec charge_date = date d'échéance
  const horizon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const resume = { soumis: 0, echecs: 0, ignores: 0, sans_charge_date: 0, remis: 0, erreurs: [] as string[] }

  // 1. Mandats actifs rattachés à une famille (paginé par principe)
  const mandats: any[] = []
  for (let from = 0; ; from += 1000) {
    // qqqq1 : inclure les mandats 'signe' (mandate_id present) en plus des 'active'.
    // Constat du 17/08 : AUCUN mandat n'etait passe 'active' en base (l'event
    // mandates.active de GoCardless n'arrive pas forcement avant le premier
    // prelevement pour le SEPA) -> le cron n'aurait preleve PERSONNE le 25/08.
    // GoCardless accepte la creation de paiements sur un mandat pas encore actif ;
    // si la charge_date ne peut pas etre tenue, le garde-fou sans charge_date joue.
    const { data, error } = await sb.from('mandats_gocardless')
      .select('*')
      .in('statut', ['active', 'signe'])
      .not('famille_id', 'is', null)
      .not('gocardless_mandate_id', 'is', null)
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: 'lecture mandats : ' + error.message }, { status: 500 })
    mandats.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  if (mandats.length === 0) return NextResponse.json({ ok: true, message: 'Aucun mandat actif', ...resume })

  // Clés GoCardless par école (une lecture par école, pas par mandat)
  const integByEcole = new Map<string, { accessToken: string; mode: 'live' | 'test' } | null>()
  async function gcCreds(ecoleId: string) {
    if (!integByEcole.has(ecoleId)) {
      const integ = await getIntegration(ecoleId, 'gocardless')
      integByEcole.set(ecoleId, integ?.secrets?.access_token
        ? { accessToken: integ.secrets.access_token, mode: integ.mode }
        : null)
    }
    return integByEcole.get(ecoleId)
  }

  const ecoleNoms = new Map<string, string>()
  async function nomEcole(ecoleId: string): Promise<string> {
    if (!ecoleNoms.has(ecoleId)) {
      const { data } = await sb.from('ecoles').select('nom').eq('id', ecoleId).single()
      ecoleNoms.set(ecoleId, data?.nom || 'Votre école')
    }
    return ecoleNoms.get(ecoleId)!
  }

  for (const mandat of mandats) {
    const creds = await gcCreds(mandat.ecole_id)
    if (!creds) { resume.ignores++; continue } // intégration désactivée entre-temps

    // 2a. Nouvelles échéances SEPA à venir sous 7 jours ou échues (aucune tentative existante)
    const { data: dues, error: duesErr } = await sb
      .from('cheques_prevus')
      .select('id, facture_id, montant, date_echeance')
      .eq('famille_id', mandat.famille_id)
      .eq('statut', 'prevu')
      .eq('mode_paiement', 'sepa')
      .lte('date_echeance', horizon)
      .is('report_solde_id', null)
      .gt('montant', 0)
    if (duesErr) { resume.erreurs.push(`échéances famille ${mandat.famille_id} : ${duesErr.message}`); continue }

    const aTraiter: { echeanceId: string; factureId: string | null; montant: number; tentative: number; chargeDate?: string }[] = []
    for (const e of dues ?? []) {
      const { data: deja } = await sb.from('prelevements_gocardless')
        .select('id').eq('echeance_id', e.id).limit(1)
      if (!deja || deja.length === 0) {
        aTraiter.push({
          echeanceId: e.id, factureId: e.facture_id, montant: Number(e.montant), tentative: 1,
          // nnnn1 : échéance future -> débit exactement à sa date ; échue/du jour -> au plus tôt
          chargeDate: e.date_echeance && e.date_echeance > today ? e.date_echeance : undefined,
        })
      }
    }

    // 2b. Retries programmés par le webhook (échec précédent, date atteinte)
    const { data: retries } = await sb.from('prelevements_gocardless')
      .select('echeance_id, facture_id, montant, tentative')
      .eq('mandat_id', mandat.id)
      .eq('statut', 'echec')
      .lte('prochaine_tentative', today)
      .lt('tentative', 3)
    for (const r of retries ?? []) {
      // ne pas retenter si l'échéance a été réglée autrement entre-temps
      const { data: ech } = await sb.from('cheques_prevus').select('statut').eq('id', r.echeance_id).single()
      if (ech?.statut !== 'prevu') continue
      const { data: dejaT } = await sb.from('prelevements_gocardless')
        .select('id').eq('echeance_id', r.echeance_id).eq('tentative', r.tentative + 1).limit(1)
      if (!dejaT || dejaT.length === 0) {
        aTraiter.push({ echeanceId: r.echeance_id, factureId: r.facture_id, montant: Number(r.montant), tentative: r.tentative + 1 })
      }
    }

    for (const t of aTraiter) {
      const montantCentimes = Math.round(t.montant * 100)
      if (montantCentimes < 100) { resume.ignores++; continue } // minimum GoCardless : 1 €

      // Journal AVANT l'appel GoCardless (UNIQUE echeance+tentative = anti-course)
      const { data: prel, error: prelErr } = await sb.from('prelevements_gocardless').insert({
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
      let paiement = await createMandatePayment({
        accessToken: creds.accessToken,
        mode: creds.mode,
        mandateId: mandat.gocardless_mandate_id,
        montantCentimes,
        description: `${ecoleNom} — échéance du ${t.echeanceId.slice(0, 8)}`,
        idempotencyKey: `prelgc_${t.echeanceId}_t${t.tentative}`,
        chargeDate: t.chargeDate,
        metadata: { echeance_id: t.echeanceId, prelevement_id: prel.id, mandat_id: mandat.id },
      })

      // nnnn1 (garde-fou validé par Avi) : si GoCardless refuse la charge_date
      // (trop proche, jour non bancaire), on recrée SANS date — débit au plus tôt —
      // et ce n'est pas compté comme un échec du mandat.
      if (!paiement.ok && t.chargeDate && /charge_date/i.test(paiement.error)) {
        resume.sans_charge_date++
        paiement = await createMandatePayment({
          accessToken: creds.accessToken,
          mode: creds.mode,
          mandateId: mandat.gocardless_mandate_id,
          montantCentimes,
          description: `${ecoleNom} — échéance du ${t.echeanceId.slice(0, 8)}`,
          idempotencyKey: `prelgc_${t.echeanceId}_t${t.tentative}_nd`,
          metadata: { echeance_id: t.echeanceId, prelevement_id: prel.id, mandat_id: mandat.id },
        })
      }

      if (paiement.ok) {
        // Paiement soumis à GoCardless — règlement et encaissement viendront du webhook
        await sb.from('prelevements_gocardless').update({
          statut: 'soumis', gocardless_payment_id: paiement.id, updated_at: new Date().toISOString(),
        }).eq('id', prel.id)
        const { error: peErr } = await sb.from('paiements_en_ligne').insert({
          ecole_id: mandat.ecole_id,
          facture_id: t.factureId,
          famille_id: mandat.famille_id,
          montant_centimes: montantCentimes,
          devise: 'eur',
          provider: 'gocardless',
          gocardless_payment_id: paiement.id,
          statut: 'pending',
          metadata: { echeance_id: t.echeanceId, prelevement_id: prel.id, mandat_id: mandat.id, cron: 'prelevements-sepa', ...(t.chargeDate ? { charge_date: t.chargeDate } : {}) },
        })
        if (peErr) resume.erreurs.push(`paiements_en_ligne échéance ${t.echeanceId} : ${peErr.message}`)
        resume.soumis++
      } else {
        // Échec dès la création (mandat annulé côté banque, clé invalide…)
        resume.echecs++
        const derniere = t.tentative >= 3
        const prochaine = derniere ? null : t.tentative === 1
          ? new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)   // J+3
          : new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)   // J+7 depuis l'origine
        await sb.from('prelevements_gocardless').update({
          statut: 'echec', erreur: paiement.error, prochaine_tentative: prochaine, updated_at: new Date().toISOString(),
        }).eq('id', prel.id)
        await sb.from('mandats_gocardless').update({
          echecs_consecutifs: (mandat.echecs_consecutifs || 0) + 1,
          derniere_erreur: paiement.error,
          ...(derniere ? { statut: 'suspendu' } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', mandat.id)
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // mmmm5 (01/09/2026, arbitrage Avi) — REMISE des prélèvements à la date
  // d'échéance, comme un chèque remis en banque : le règlement est créé le
  // jour du débit (pas 2-3 jours plus tard à la confirmation GoCardless), et
  // un éventuel rejet est constaté ensuite par le webhook (règlement négatif
  // « IMPAYE », échéance rejetée). Le bilan du jour et le rapprochement
  // bancaire collent ainsi à la date réelle du relevé.
  // Idempotent : référence « GoCardless <12 premiers caractères du payment> »,
  // la même que le webhook (qui ne recrée donc rien à la confirmation).
  try {
    const { data: aRemettre, error: remErr } = await sb.from('prelevements_gocardless')
      .select('id, echeance_id, facture_id, famille_id, montant, gocardless_payment_id')
      .eq('statut', 'soumis').is('reglement_id', null).not('gocardless_payment_id', 'is', null)
      .not('facture_id', 'is', null).limit(500)
    if (remErr) resume.erreurs.push('remises : ' + remErr.message)
    for (const p of (aRemettre || []) as any[]) {
      const { data: ech } = await sb.from('cheques_prevus').select('id, date_echeance, statut').eq('id', p.echeance_id).maybeSingle()
      if (!ech?.date_echeance || ech.date_echeance > today) continue // pas encore la date du débit
      const refGc = `GoCardless ${String(p.gocardless_payment_id).slice(0, 12)}`
      let reglementId: string | null = null
      const { data: deja } = await sb.from('reglements').select('id').eq('facture_id', p.facture_id).eq('reference', refGc).maybeSingle()
      if (deja?.id) reglementId = deja.id
      else {
        const { data: regl, error: reglErr } = await sb.from('reglements').insert({
          facture_id: p.facture_id,
          famille_id: p.famille_id,
          montant: Number(p.montant),
          mode_paiement: 'sepa',
          date_reglement: ech.date_echeance,
          reference: refGc,
          notes: 'Prélèvement SEPA remis (GoCardless) — en attente de confirmation',
        }).select('id').single()
        if (reglErr || !regl?.id) { resume.erreurs.push(`remise ${p.id} : ${reglErr?.message || 'insert vide'}`); continue }
        reglementId = regl.id
      }
      await sb.from('prelevements_gocardless').update({ reglement_id: reglementId, updated_at: new Date().toISOString() }).eq('id', p.id)
      await sb.from('paiements_en_ligne').update({ reglement_id: reglementId, updated_at: new Date().toISOString() })
        .eq('gocardless_payment_id', p.gocardless_payment_id).is('reglement_id', null)
      if (ech.statut === 'prevu' || ech.statut === 'rejete') { // rejete = nouvelle tentative après un impayé
        await sb.from('cheques_prevus').update({ statut: 'encaisse', encaisse_le: new Date().toISOString() }).eq('id', ech.id)
      }
      resume.remis++
    }
  } catch (e: any) { resume.erreurs.push('remises : ' + (e?.message || 'erreur')) }

  return NextResponse.json({ ok: true, date: today, ...resume })
}
