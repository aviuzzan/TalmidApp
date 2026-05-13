/**
 * Helper Web Push côté serveur (Node runtime).
 * Utilise le package `web-push` qui gère VAPID + chiffrement.
 *
 * Env vars Vercel :
 *   VAPID_PUBLIC_KEY   (base64url, exposé aussi côté client sous NEXT_PUBLIC_VAPID_PUBLIC_KEY)
 *   VAPID_PRIVATE_KEY  (base64url, serveur uniquement)
 *   VAPID_SUBJECT      mailto:contact@talmidapp.fr
 *
 * Générer la paire : npx web-push generate-vapid-keys
 */

import webpush from 'web-push'

let configured = false

function configure() {
  if (configured) return
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@talmidapp.fr'
  if (!pub || !priv) throw new Error('VAPID keys manquantes')
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
}

export interface PushPayload {
  titre: string
  body: string
  url?: string
  icon?: string
  tag?: string
}

export interface PushSubscription {
  endpoint: string
  keys?: { p256dh: string; auth: string }
  p256dh?: string
  auth?: string
}

export interface SendPushResult {
  ok: boolean
  statusCode?: number
  expired?: boolean
  error?: string
}

export async function sendPush(sub: PushSubscription, payload: PushPayload): Promise<SendPushResult> {
  try {
    configure()
    const subscription = {
      endpoint: sub.endpoint,
      keys: sub.keys || { p256dh: sub.p256dh as string, auth: sub.auth as string },
    }
    const res = await webpush.sendNotification(subscription as any, JSON.stringify(payload))
    return { ok: true, statusCode: res.statusCode }
  } catch (e: any) {
    const status = e?.statusCode || e?.status
    // 404/410 = endpoint expiré → à supprimer côté BDD
    const expired = status === 404 || status === 410
    return { ok: false, statusCode: status, expired, error: e?.body || e?.message || 'Erreur push' }
  }
}
