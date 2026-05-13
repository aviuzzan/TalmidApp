'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Bouton "Activer les notifications" — à placer dans le portail / dashboard.
 * - Enregistre le service worker /sw.js
 * - Demande permission notification
 * - Souscrit avec VAPID_PUBLIC_KEY
 * - POST /api/push/subscribe pour stocker
 */
export default function PushPrompt() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    setSupported(ok)
    if (!ok) return
    setPermission(Notification.permission)
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return
      reg.pushManager.getSubscription().then(sub => setSubscribed(!!sub))
    })
  }, [])

  function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64Std)
    const arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    return arr
  }

  async function activer() {
    setError('')
    setWorking(true)
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapid) { setError('Configuration push manquante côté serveur'); setWorking(false); return }

      // 1. Permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') { setError('Permission refusée'); setWorking(false); return }

      // 2. Service worker
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

      // 3. Subscribe
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
        })
      }

      // 4. Envoie au serveur
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Session expirée'); setWorking(false); return }

      const json = sub.toJSON() as any
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur enregistrement'); setWorking(false); return }
      setSubscribed(true)
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    }
    setWorking(false)
  }

  async function desactiver() {
    setWorking(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ endpoint }),
          })
        }
      }
      setSubscribed(false)
    } catch (e: any) {
      setError(e?.message || 'Erreur désinscription')
    }
    setWorking(false)
  }

  if (!supported) return null

  if (subscribed) {
    return (
      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#065F46' }}>
          🔔 Notifications activées sur cet appareil
        </div>
        <button onClick={desactiver} disabled={working} style={{ background: 'transparent', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {working ? '...' : 'Désactiver'}
        </button>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#991B1B' }}>
        🔕 Notifications bloquées par le navigateur. Pour les activer, ouvrez les paramètres du site et autorisez les notifications.
      </div>
    )
  }

  return (
    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>🔔 Activez les notifications</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>Recevez les annonces importantes de l&apos;école directement sur votre appareil.</div>
      </div>
      <button onClick={activer} disabled={working} className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }}>
        {working ? 'Activation…' : 'Activer'}
      </button>
      {error && <div style={{ width: '100%', fontSize: 11, color: '#DC2626' }}>{error}</div>}
    </div>
  )
}
