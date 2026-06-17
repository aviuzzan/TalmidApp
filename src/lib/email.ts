/**
 * Helper d'envoi d'email partagé (notifs familles, notifs admin, invitations,
 * relances, etc.).
 *
 * Deux canaux possibles, dans l'ordre de priorité :
 *  1. Brevo (API transactionnelle HTTP) — meilleure délivrabilité, évite les
 *     spams. Activé dès que BREVO_API_KEY est défini.
 *  2. SMTP (nodemailer) — fallback historique (Gmail Workspace).
 *
 * Variables d'environnement (Vercel) :
 *   Brevo :
 *     BREVO_API_KEY        clé API Brevo (xkeysib-...)
 *     BREVO_SENDER_EMAIL   ex: noreply@talmidapp.fr (domaine vérifié dans Brevo)
 *     BREVO_SENDER_NAME    ex: TalmidApp (optionnel)
 *   SMTP (fallback) :
 *     SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM
 */

import nodemailer from 'nodemailer'

export interface EmailRecipient {
  email: string
  name?: string
}

export interface SendEmailParams {
  to: EmailRecipient | EmailRecipient[]
  subject: string
  html: string
  replyTo?: string
  /** Nom affiché de l'expéditeur. Si non fourni, fallback sur BREVO_SENDER_NAME / SMTP_FROM / 'TalmidApp'. */
  fromName?: string
}

export interface SendEmailResult {
  ok: boolean
  messageId?: string
  error?: string
  canal?: 'brevo' | 'smtp'
}

// ─────────────────────────────────────────────
//  Détection de configuration
// ─────────────────────────────────────────────
function isBrevoConfigured(): boolean {
  return !!(process.env.BREVO_API_KEY && (process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER))
}

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
}

export function isEmailConfigured(): boolean {
  return isBrevoConfigured() || isSmtpConfigured()
}

// ─────────────────────────────────────────────
//  Helpers communs
// ─────────────────────────────────────────────
/** Extrait "Nom <email>" -> { name, email }. */
function parseFrom(raw: string | undefined, fallbackEmail: string): { name?: string; email: string } {
  if (!raw) return { email: fallbackEmail }
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() }
  return { email: raw.trim() }
}

function toRecipients(to: EmailRecipient | EmailRecipient[]): EmailRecipient[] {
  return (Array.isArray(to) ? to : [to]).filter(r => r && r.email)
}

// ─────────────────────────────────────────────
//  Canal 1 : Brevo (API transactionnelle)
// ─────────────────────────────────────────────
async function sendViaBrevo(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY!
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER!
  // IMPORTANT : on ignore volontairement le name de SMTP_FROM (qui peut contenir
  // une vieille valeur "Heder Loubavitch" héritée). Le caller DOIT passer fromName.
  // Fallback : BREVO_SENDER_NAME puis "TalmidApp", JAMAIS le name SMTP_FROM.
  const senderName = params.fromName || process.env.BREVO_SENDER_NAME || 'TalmidApp'

  const recipients = toRecipients(params.to)
  if (recipients.length === 0) return { ok: false, error: 'Aucun destinataire valide' }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: recipients.map(r => ({ email: r.email, name: r.name || undefined })),
        subject: params.subject,
        htmlContent: params.html,
        ...(params.replyTo ? { replyTo: { email: params.replyTo } } : {}),
      }),
    })

    if (!res.ok) {
      let detail = ''
      try { detail = JSON.stringify(await res.json()) } catch { detail = await res.text().catch(() => '') }
      return { ok: false, error: `Brevo ${res.status} : ${detail}`.slice(0, 300), canal: 'brevo' }
    }

    const data = await res.json().catch(() => ({} as any))
    return { ok: true, messageId: data?.messageId, canal: 'brevo' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erreur Brevo inconnue', canal: 'brevo' }
  }
}

// ─────────────────────────────────────────────
//  Canal 2 : SMTP (nodemailer) — fallback
// ─────────────────────────────────────────────
let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter) return cachedTransporter
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD
  if (!host || !user || !pass) return null
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return cachedTransporter
}

async function sendViaSmtp(params: SendEmailParams): Promise<SendEmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { ok: false, error: 'Configuration SMTP manquante (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)' }
  }

  // Email d'envoi = SMTP_FROM (juste l'email) ou SMTP_USER en fallback.
  // Nom affiché : params.fromName, sinon TalmidApp. JAMAIS le name de SMTP_FROM
  // (peut contenir une vieille valeur héritée comme "Heder Loubavitch").
  const smtpFromRaw = process.env.SMTP_FROM || process.env.SMTP_USER!
  const fromEmail = parseFrom(smtpFromRaw, process.env.SMTP_USER!).email
  const fromDisplayName = params.fromName || 'TalmidApp'
  const from = `"${fromDisplayName.replace(/"/g, '')}" <${fromEmail}>`

  const recipients = toRecipients(params.to)
  const formattedTo = recipients
    .map(r => (r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email))
    .join(', ')
  if (!formattedTo) return { ok: false, error: 'Aucun destinataire valide' }

  try {
    const info = await transporter.sendMail({
      from,
      to: formattedTo,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    })
    return { ok: true, messageId: info.messageId, canal: 'smtp' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erreur SMTP inconnue', canal: 'smtp' }
  }
}

// ─────────────────────────────────────────────
//  Point d'entrée : Brevo d'abord, SMTP en secours
// ─────────────────────────────────────────────
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (isBrevoConfigured()) {
    const result = await sendViaBrevo(params)
    if (result.ok) return result
    // Brevo a échoué : on tente le SMTP si disponible
    if (isSmtpConfigured()) {
      const fallback = await sendViaSmtp(params)
      if (fallback.ok) return fallback
      return { ok: false, error: `Brevo: ${result.error} | SMTP: ${fallback.error}` }
    }
    return result
  }

  if (isSmtpConfigured()) {
    return sendViaSmtp(params)
  }

  return { ok: false, error: 'Aucun canal email configuré (ni Brevo ni SMTP)' }
}
