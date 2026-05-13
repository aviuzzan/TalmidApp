/**
 * Helper Brevo SMS — appel API REST direct via fetch.
 *
 * Env vars Vercel :
 *   BREVO_API_KEY    xkeysib-...
 *
 * Doc: https://developers.brevo.com/reference/sendtransacsms
 */

const BREVO_API = 'https://api.brevo.com/v3'

/**
 * Normalise un téléphone FR au format E.164 (+33...) attendu par Brevo.
 * Accepte : 0612345678, +33612345678, 33 6 12 34 56 78, etc.
 */
export function normalizePhoneFR(raw: string): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[\s.\-()]/g, '')
  if (cleaned.startsWith('+33')) {
    return cleaned.length === 12 ? cleaned : null
  }
  if (cleaned.startsWith('33') && cleaned.length === 11) {
    return '+' + cleaned
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+33' + cleaned.slice(1)
  }
  // International ?
  if (cleaned.startsWith('+') && cleaned.length >= 8) return cleaned
  return null
}

export interface SendSmsParams {
  apiKey: string         // clé API Brevo de l'école
  to: string             // numéro destinataire (déjà normalisé E.164)
  message: string        // 160 chars / segment idéalement
  sender?: string        // 11 caractères max alphanumériques, sinon Brevo refuse
  tag?: string           // libellé reporting Brevo
}

export interface SendSmsResult {
  ok: boolean
  brevoMessageId?: string
  costCredits?: number
  error?: string
}

export async function sendSms(p: SendSmsParams): Promise<SendSmsResult> {
  try {
    const phone = normalizePhoneFR(p.to)
    if (!phone) return { ok: false, error: `Numéro invalide : ${p.to}` }

    if (!p.apiKey) return { ok: false, error: 'apiKey Brevo manquant' }
    const res = await fetch(`${BREVO_API}/transactionalSMS/sms`, {
      method: 'POST',
      headers: {
        'api-key': p.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: (p.sender || 'TalmidApp').slice(0, 11),
        recipient: phone,
        content: p.message,
        type: 'transactional',
        tag: p.tag || 'talmidapp',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { ok: false, error: data?.message || `Brevo ${res.status}` }
    }
    return {
      ok: true,
      brevoMessageId: data?.messageId,
      costCredits: data?.usedCredits ?? data?.remainingCredits,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur Brevo' }
  }
}

/**
 * Remplace les variables {prenom}, {nom}, {ecole}, {montant}, {date}... dans un template.
 */
export function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
