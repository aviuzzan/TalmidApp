/**
 * Helper GoCardless — appel API REST direct.
 *
 * GoCardless = prélèvement SEPA en ligne (la famille signe son mandat sans imprimer ni envoyer).
 *
 * Doc API v3 :
 *   - https://developer.gocardless.com/api-reference/
 *   - Billing Request flow (recommandé) : https://developer.gocardless.com/getting-started/billing-requests/
 *
 * Credentials par école (stockés chiffrés en BDD via parametres_integrations) :
 *   - access_token  (live_XXXX ou sandbox_XXXX)
 *   - creditor_id   (CR000...)
 *   - webhook_secret
 */

const GC_LIVE = 'https://api.gocardless.com'
const GC_SANDBOX = 'https://api-sandbox.gocardless.com'

function apiBase(mode: 'live' | 'test'): string {
  return mode === 'test' ? GC_SANDBOX : GC_LIVE
}

async function gcFetch(accessToken: string, mode: 'live' | 'test', path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${apiBase(mode)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'GoCardless-Version': '2015-07-06',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const details = (data?.error?.errors || [])
      .map((e: any) => [e.field, e.message, e.request_pointer].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' ; ')
    const base = data?.error?.message || `GoCardless ${res.status}`
    throw new Error(details ? `${base} — ${details}` : base)
  }
  return data
}

export interface CreateBillingRequestParams {
  accessToken: string
  mode: 'live' | 'test'
  factureId: string
  factureNumero: string
  ecoleNom: string
  montantCentimes: number          // en centimes EUR
  email: string
  nomFamille: string
  metadata?: Record<string, string>
}

/**
 * Crée un Billing Request (mandat + paiement one-off) + le BR flow (URL hébergée GoCardless).
 * Retourne l'URL vers laquelle rediriger la famille.
 */
export async function createBillingRequestFlow(p: CreateBillingRequestParams): Promise<{ flowId: string; redirectUrl: string; billingRequestId: string }> {
  // 1. Crée le Billing Request (mandat + paiement)
  const brRes = await gcFetch(p.accessToken, p.mode, '/billing_requests', {
    method: 'POST',
    body: JSON.stringify({
      billing_requests: {
        mandate_request: {
          scheme: 'sepa_core',
          currency: 'EUR',
          description: `Mandat ${p.ecoleNom}`,
        },
        payment_request: {
          amount: p.montantCentimes,
          currency: 'EUR',
          description: `Facture ${p.factureNumero}`,
          metadata: { facture_id: p.factureId, ...(p.metadata || {}) },
        },
      },
    }),
  })
  const billingRequestId = brRes?.billing_requests?.id
  if (!billingRequestId) throw new Error('Création Billing Request échouée')

  // 2. Crée le BR Flow (URL hébergée pour signature du mandat)
  const flowRes = await gcFetch(p.accessToken, p.mode, '/billing_request_flows', {
    method: 'POST',
    body: JSON.stringify({
      billing_request_flows: {
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'}/portail/factures/paiement-success?provider=gocardless`,
        exit_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'}/portail/factures/paiement-cancel`,
        links: { billing_request: billingRequestId },
        prefilled_customer: {
          email: p.email,
          family_name: p.nomFamille,
        },
        show_redirect_buttons: true,
      },
    }),
  })
  const flowId = flowRes?.billing_request_flows?.id
  const redirectUrl = flowRes?.billing_request_flows?.authorisation_url
  if (!redirectUrl) throw new Error('URL flow GoCardless absente')

  return { flowId, redirectUrl, billingRequestId }
}

/**
 * Vérifie la signature d'un webhook GoCardless (HMAC SHA256 sur le body brut).
 * Header : "Webhook-Signature"
 */
export function verifyWebhookSignature(payload: string, signature: string | null, secret: string): { ok: boolean; events?: any[]; error?: string } {
  if (!signature) return { ok: false, error: 'Signature absente' }
  const crypto = require('crypto') as typeof import('crypto')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Signature invalide' }
  }
  try {
    const parsed = JSON.parse(payload)
    return { ok: true, events: parsed?.events || [] }
  } catch (e) {
    return { ok: false, error: 'Payload non parsable' }
  }
}

/**
 * jjjj1 — Crée un Billing Request MANDAT SEUL (sans paiement) + son flow hébergé.
 * Utilisé par le parcours « signer mon mandat » du portail parent.
 */
export async function createMandateOnlyFlow(p: {
  accessToken: string
  mode: 'live' | 'test'
  ecoleNom: string
  email: string
  nomFamille: string
  metadata?: Record<string, string>
}): Promise<{ flowId: string; redirectUrl: string; billingRequestId: string }> {
  const brRes = await gcFetch(p.accessToken, p.mode, '/billing_requests', {
    method: 'POST',
    body: JSON.stringify({
      billing_requests: {
        mandate_request: {
          scheme: 'sepa_core',
          currency: 'EUR',
          description: `Mandat ${p.ecoleNom}`,
          metadata: p.metadata || {},
        },
      },
    }),
  })
  const billingRequestId = brRes?.billing_requests?.id
  if (!billingRequestId) throw new Error('Création Billing Request (mandat) échouée')

  const flowRes = await gcFetch(p.accessToken, p.mode, '/billing_request_flows', {
    method: 'POST',
    body: JSON.stringify({
      billing_request_flows: {
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'}/portail/factures?mandat_sepa=ok`,
        exit_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://talmidapp.fr'}/portail/factures?mandat_sepa=annule`,
        links: { billing_request: billingRequestId },
        prefilled_customer: { email: p.email, family_name: p.nomFamille },
        show_redirect_buttons: true,
      },
    }),
  })
  const flowId = flowRes?.billing_request_flows?.id
  const redirectUrl = flowRes?.billing_request_flows?.authorisation_url
  if (!redirectUrl) throw new Error('URL flow GoCardless absente')
  return { flowId, redirectUrl, billingRequestId }
}

/**
 * jjjj1 — Crée un paiement sur un mandat existant (prélèvement d'une échéance par le cron).
 * Idempotency-Key : GoCardless garantit qu'un rejeu ne débite pas deux fois.
 * nnnn1 — chargeDate (optionnel, YYYY-MM-DD) : date de prélèvement souhaitée.
 * Sans chargeDate, GoCardless prélève à la première date possible (~J+3 ouvrés).
 * Avec chargeDate, le débit a lieu exactement ce jour-là (consigne Avi : prélever
 * à la date de l'échéance). Si la date est trop proche, GoCardless renvoie une
 * erreur de validation sur charge_date — l'appelant retente alors sans la date.
 */
export async function createMandatePayment(p: {
  accessToken: string
  mode: 'live' | 'test'
  mandateId: string
  montantCentimes: number
  description: string
  idempotencyKey: string
  chargeDate?: string
  metadata?: Record<string, string>
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await gcFetch(p.accessToken, p.mode, '/payments', {
      method: 'POST',
      headers: { 'Idempotency-Key': p.idempotencyKey },
      body: JSON.stringify({
        payments: {
          amount: p.montantCentimes,
          currency: 'EUR',
          description: p.description,
          metadata: p.metadata || {},
          ...(p.chargeDate ? { charge_date: p.chargeDate } : {}),
          links: { mandate: p.mandateId },
        },
      }),
    })
    const id = res?.payments?.id
    if (!id) return { ok: false, error: 'Réponse GoCardless sans identifiant de paiement' }
    return { ok: true, id }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur GoCardless' }
  }
}

/** jjjj1 — Annule un mandat chez GoCardless (révocation depuis le portail). */
export async function cancelMandate(accessToken: string, mode: 'live' | 'test', mandateId: string): Promise<void> {
  await gcFetch(accessToken, mode, `/mandates/${mandateId}/actions/cancel`, { method: 'POST', body: JSON.stringify({}) })
}
