import nodemailer from 'nodemailer'

/**
 * Helper d'envoi d'email partagé entre /api/emails (notifs familles)
 * et /api/notify-admin (notifs admin DDR/contrat).
 *
 * Configuration via env vars (Vercel) :
 *   SMTP_HOST     ex: smtp.gmail.com
 *   SMTP_PORT     ex: 587 (STARTTLS) ou 465 (SSL)
 *   SMTP_USER     ex: noreply@talmidapp.fr
 *   SMTP_PASSWORD ex: App Password Google 16 chars
 *   SMTP_FROM     ex: "Heder Loubavitch <noreply@talmidapp.fr>" (optionnel, fallback = SMTP_USER)
 */

export interface EmailRecipient {
  email: string
  name?: string
}

export interface SendEmailParams {
  to: EmailRecipient | EmailRecipient[]
  subject: string
  html: string
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  messageId?: string
  error?: string
}

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

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { ok: false, error: 'Configuration SMTP manquante (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)' }
  }

  const fromEnv = process.env.SMTP_FROM
  const fromUser = process.env.SMTP_USER!
  const from = fromEnv || fromUser

  const toList = Array.isArray(params.to) ? params.to : [params.to]
  const formattedTo = toList
    .filter(r => r.email)
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
    return { ok: true, messageId: info.messageId }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erreur SMTP inconnue' }
  }
}
