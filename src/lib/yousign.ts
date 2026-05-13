/**
 * Helper YouSign — API v3.
 * Doc : https://developers.yousign.com/reference/oas-specification
 *
 * Workflow signature électronique simple :
 *   1. Crée une "signature request" (= un dossier à faire signer)
 *   2. Upload du document PDF dans la request
 *   3. Ajoute un "signer" (la famille) avec son email + nom
 *   4. Active la request → YouSign envoie un email avec lien de signature
 *   5. Webhook reçoit l'événement "signature_request.done" → on récupère le PDF signé
 *
 * Env vars par école (parametres_integrations / provider=yousign) :
 *   - api_key (chiffrée) — Bearer token
 *   - webhook_secret (chiffrée) — optionnel pour vérif signature
 */

const YS_LIVE = 'https://api.yousign.app/v3'
const YS_SANDBOX = 'https://api-sandbox.yousign.app/v3'

function apiBase(mode: 'live' | 'test'): string {
  return mode === 'test' ? YS_SANDBOX : YS_LIVE
}

async function ysFetch(apiKey: string, mode: 'live' | 'test', path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${apiBase(mode)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text()
  if (!res.ok) {
    const msg = (data as any)?.detail || (data as any)?.message || `YouSign ${res.status}`
    throw new Error(msg)
  }
  return data
}

export interface CreateSignatureParams {
  apiKey: string
  mode: 'live' | 'test'
  documentPdfBytes: Uint8Array
  documentFilename: string
  signerEmail: string
  signerFirstName: string
  signerLastName: string
  signaturePosition?: { page: number; x: number; y: number; width: number; height: number }
  delivery?: 'email' | 'none'
  externalId?: string
}

/**
 * Crée une signature_request + upload du document + ajout du signer + activation.
 * Retourne la signature_request id + URL de signature (si delivery=none, sinon vide).
 */
export async function createSignatureRequest(p: CreateSignatureParams): Promise<{ requestId: string; signerId: string; signatureUrl?: string }> {
  // 1. Créer la signature request
  const req = await ysFetch(p.apiKey, p.mode, '/signature_requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: p.documentFilename,
      delivery_mode: p.delivery === 'none' ? 'none' : 'email',
      ...(p.externalId ? { external_id: p.externalId } : {}),
    }),
  })
  const requestId = req?.id
  if (!requestId) throw new Error('Création signature_request échouée')

  // 2. Upload du PDF
  const formData = new FormData()
  formData.append('file', new Blob([p.documentPdfBytes as any], { type: 'application/pdf' }), p.documentFilename)
  formData.append('nature', 'signable_document')
  await ysFetch(p.apiKey, p.mode, `/signature_requests/${requestId}/documents`, {
    method: 'POST',
    body: formData as any,
  })

  // 3. Ajout du signer
  const signer = await ysFetch(p.apiKey, p.mode, `/signature_requests/${requestId}/signers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      info: {
        first_name: p.signerFirstName,
        last_name: p.signerLastName,
        email: p.signerEmail,
        locale: 'fr',
      },
      signature_level: 'electronic_signature',
      signature_authentication_mode: 'no_otp',
    }),
  })
  const signerId = signer?.id

  // 4. Activer la request
  const activated = await ysFetch(p.apiKey, p.mode, `/signature_requests/${requestId}/activate`, {
    method: 'POST',
  })

  const signatureUrl = activated?.signers?.[0]?.signature_link || signer?.signature_link
  return { requestId, signerId, signatureUrl }
}

export async function getSignatureRequest(apiKey: string, mode: 'live' | 'test', requestId: string): Promise<any> {
  return ysFetch(apiKey, mode, `/signature_requests/${requestId}`)
}

export async function downloadSignedDocument(apiKey: string, mode: 'live' | 'test', requestId: string, documentId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${apiBase(mode)}/signature_requests/${requestId}/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Download YouSign ${res.status}`)
  return res.arrayBuffer()
}

/**
 * Vérifie la signature webhook YouSign (HMAC SHA256 du body brut).
 * Header : "X-Yousign-Signature-256" = "sha256=HEX"
 */
export function verifyWebhookSignature(payload: string, signatureHeader: string | null, secret: string): { ok: boolean; event?: any; error?: string } {
  if (!signatureHeader) return { ok: false, error: 'Signature absente' }
  const crypto = require('crypto') as typeof import('crypto')
  const cleaned = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(cleaned, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Signature invalide' }
  }
  try {
    return { ok: true, event: JSON.parse(payload) }
  } catch (e) {
    return { ok: false, error: 'Payload non parsable' }
  }
}
