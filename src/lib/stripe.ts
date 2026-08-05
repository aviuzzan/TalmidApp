/**
 * Helper Stripe — appels API REST directs via fetch (pas de SDK pour rester léger).
 * Toutes les clés sont côté serveur uniquement, jamais exposées au client.
 *
 * Env vars Vercel :
 *   STRIPE_SECRET_KEY        sk_live_... ou sk_test_...
 *   STRIPE_WEBHOOK_SECRET    whsec_...   (signing secret du webhook)
 *   NEXT_PUBLIC_APP_URL      https://talmidapp.fr
 */

const STRIPE_API = 'https://api.stripe.com/v1'

function encodeForm(obj: Record<string, any>, prefix = ''): string {
  const params: string[] = []
  for (const [key, val] of Object.entries(obj)) {
    if (val == null) continue
    const k = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (typeof v === 'object') params.push(encodeForm(v, `${k}[${i}]`))
        else params.push(`${encodeURIComponent(`${k}[${i}]`)}=${encodeURIComponent(String(v))}`)
      })
    } else if (typeof val === 'object') {
      params.push(encodeForm(val, k))
    } else {
      params.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`)
    }
  }
  return params.join('&')
}

async function stripeFetch(secretKey: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe ${res.status}`)
  }
  return data
}

export interface CheckoutSessionParams {
  secretKey: string
  factureId: string
  ecoleNom: string
  factureNumero: string
  montantCentimes: number
  email: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

export async function createCheckoutSession(p: CheckoutSessionParams): Promise<{ id: string; url: string }> {
  const body = encodeForm({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: p.email,
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: p.montantCentimes,
        product_data: {
          name: `${p.ecoleNom} — Facture ${p.factureNumero}`,
          description: `Règlement facture ${p.factureNumero}`,
        },
      },
    }],
    metadata: {
      facture_id: p.factureId,
      ...(p.metadata || {}),
    },
  })

  const session = await stripeFetch(p.secretKey, '/checkout/sessions', { method: 'POST', body })
  return { id: session.id, url: session.url }
}

export async function retrieveCheckoutSession(secretKey: string, sessionId: string): Promise<any> {
  return stripeFetch(secretKey, `/checkout/sessions/${sessionId}`)
}

// ------------------------------------------------------------------
// yyyy3 — Prelevement automatique par carte (mandat + off-session)
// ------------------------------------------------------------------

/** Cree un customer Stripe pour une famille (sur le compte Stripe de l'ecole). */
export async function createCustomer(secretKey: string, p: { email: string; name: string; metadata?: Record<string, string> }): Promise<{ id: string }> {
  const body = encodeForm({ email: p.email, name: p.name, metadata: p.metadata || {} })
  const c = await stripeFetch(secretKey, '/customers', { method: 'POST', body })
  return { id: c.id }
}

/**
 * Session Checkout en mode "setup" : le parent enregistre sa carte pour usage
 * futur hors session (prelevements automatiques). Aucun paiement immediat.
 */
export async function createSetupCheckoutSession(p: {
  secretKey: string
  customerId: string
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}): Promise<{ id: string; url: string }> {
  const body = encodeForm({
    mode: 'setup',
    payment_method_types: ['card'],
    customer: p.customerId,
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
    setup_intent_data: { metadata: p.metadata || {} },
    metadata: p.metadata || {},
  })
  const session = await stripeFetch(p.secretKey, '/checkout/sessions', { method: 'POST', body })
  return { id: session.id, url: session.url }
}

export async function retrieveSetupIntent(secretKey: string, setupIntentId: string): Promise<any> {
  return stripeFetch(secretKey, `/setup_intents/${setupIntentId}`)
}

export async function retrievePaymentMethod(secretKey: string, paymentMethodId: string): Promise<any> {
  return stripeFetch(secretKey, `/payment_methods/${paymentMethodId}`)
}

export async function detachPaymentMethod(secretKey: string, paymentMethodId: string): Promise<any> {
  return stripeFetch(secretKey, `/payment_methods/${paymentMethodId}/detach`, { method: 'POST', body: '' })
}

/**
 * Prelevement off-session sur une carte enregistree (mandat).
 * confirm:true + off_session:true — Stripe repond de maniere synchrone :
 * soit succeeded, soit une erreur (carte refusee, authentification requise...).
 * La cle d'idempotence garantit qu'un rejeu de cron ne debite jamais deux fois.
 */
export async function createOffSessionPayment(p: {
  secretKey: string
  customerId: string
  paymentMethodId: string
  montantCentimes: number
  description: string
  idempotencyKey: string
  metadata?: Record<string, string>
}): Promise<{ ok: true; id: string; status: string } | { ok: false; error: string; code?: string; paymentIntentId?: string }> {
  const body = encodeForm({
    amount: p.montantCentimes,
    currency: 'eur',
    customer: p.customerId,
    payment_method: p.paymentMethodId,
    off_session: 'true',
    confirm: 'true',
    description: p.description,
    metadata: p.metadata || {},
  })
  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': p.idempotencyKey,
    },
    body,
  })
  const data = await res.json()
  if (!res.ok) {
    return {
      ok: false,
      error: data?.error?.message || `Stripe ${res.status}`,
      code: data?.error?.code || data?.error?.decline_code,
      paymentIntentId: data?.error?.payment_intent?.id,
    }
  }
  if (data.status !== 'succeeded') {
    return { ok: false, error: `Statut inattendu : ${data.status}`, code: data.status, paymentIntentId: data.id }
  }
  return { ok: true, id: data.id, status: data.status }
}

/**
 * Vérifie la signature d'un webhook Stripe (ré-implémentation minimale).
 * https://stripe.com/docs/webhooks/signatures
 */
export function verifyWebhookSignature(payload: string, sigHeader: string | null, secret: string, toleranceSec = 300): { ok: boolean; event?: any; error?: string } {
  if (!sigHeader) return { ok: false, error: 'Signature absente' }
  const items = sigHeader.split(',').reduce((acc, kv) => {
    const [k, v] = kv.split('=')
    if (k && v) (acc as any)[k] = v
    return acc
  }, {} as Record<string, string>)
  const ts = items.t
  const sig = items.v1
  if (!ts || !sig) return { ok: false, error: 'Signature mal formée' }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(ts)) > toleranceSec) return { ok: false, error: 'Signature expirée' }

  // HMAC SHA256
  const crypto = require('crypto') as typeof import('crypto')
  const signedPayload = `${ts}.${payload}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
  // timingSafeEqual sur des Buffer de même taille
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(sig, 'utf8')
  if (a.length !== b.length) return { ok: false, error: 'Signature invalide' }
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: 'Signature invalide' }

  try {
    return { ok: true, event: JSON.parse(payload) }
  } catch (e) {
    return { ok: false, error: 'Payload non parsable' }
  }
}
