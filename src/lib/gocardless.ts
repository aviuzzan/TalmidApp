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
    const msg = data?.error?.message || data?.error?.errors?.[0]?.message || `GoCardless ${res.status}`
    throw new Error(msg)
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
