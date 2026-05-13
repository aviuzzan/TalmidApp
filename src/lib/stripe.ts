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
