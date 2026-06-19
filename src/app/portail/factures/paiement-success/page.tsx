'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

export default function PaiementSuccessPage() {
  const { t } = useI18n()
  const router = useRouter()
  const search = useSearchParams()
  const sessionId = search.get('session_id')
  const provider = search.get('provider')
  const paypalToken = search.get('token') // PayPal renvoie ?token=ORDER_ID
  const [seconds, setSeconds] = useState(6)
  const [statut, setStatut] = useState<'attente' | 'ok' | 'erreur'>('attente')
  const [erreur, setErreur] = useState('')

  // PayPal : il faut capturer la commande au retour
  useEffect(() => {
    if (provider === 'paypal' && paypalToken) {
      ;(async () => {
        try {
          const res = await fetch('/api/paypal/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: paypalToken }),
          })
          const data = await res.json()
          if (res.ok && data.success) setStatut('ok')
          else { setStatut('erreur'); setErreur(data.error || t('portail.paiement.success.error_fallback')) }
        } catch (e: any) {
          setStatut('erreur'); setErreur(e?.message || t('portail.paiement.success.network_error'))
        }
      })()
    } else {
      // Stripe : confirmé via webhook côté serveur
      setStatut('ok')
    }
  }, [provider, paypalToken, t])

  useEffect(() => {
    if (statut !== 'ok') return
    const tm = setInterval(() => setSeconds(s => s - 1), 1000)
    const r = setTimeout(() => router.push('/portail/factures'), 6000)
    return () => { clearInterval(tm); clearTimeout(r) }
  }, [statut, router])

  if (statut === 'attente') return (
    <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>{t('portail.paiement.success.confirming')}</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginTop: 12 }}>{t('portail.paiement.success.please_wait')}</p>
    </div>
  )

  if (statut === 'erreur') return (
    <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#991B1B', margin: 0 }}>{t('portail.paiement.success.error_title')}</h1>
      <p style={{ color: '#991B1B', fontSize: 14, marginTop: 12 }}>{erreur}</p>
      <p style={{ color: '#64748B', fontSize: 13, marginTop: 12 }}>
        {t('portail.paiement.success.if_charged')}
      </p>
      <button onClick={() => router.push('/portail/factures')} className="btn-primary" style={{ marginTop: 16 }}>
        {t('portail.paiement.success.back_to_invoices')}
      </button>
    </div>
  )

  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#065F46', margin: 0 }}>{t('portail.paiement.success.title')}</h1>
      <p style={{ color: '#065F46', fontSize: 14, marginTop: 12 }}>
        {t('portail.paiement.success.body')}
      </p>
      {(sessionId || paypalToken) && (
        <p style={{ color: '#94A3B8', fontSize: 11, marginTop: 8 }}>
          {t('portail.paiement.success.reference', { ref: (sessionId || paypalToken || '').slice(0, 24) })}
        </p>
      )}
      <p style={{ color: '#64748B', fontSize: 13, marginTop: 20 }}>
        {t('portail.paiement.success.return_in', { seconds, s: seconds > 1 ? 's' : '' })}
      </p>
      <button onClick={() => router.push('/portail/factures')} className="btn-primary" style={{ marginTop: 16 }}>
        {t('portail.paiement.success.back_to_invoices')}
      </button>
    </div>
  )
}
