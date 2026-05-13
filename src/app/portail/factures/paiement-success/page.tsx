'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function PaiementSuccessPage() {
  const router = useRouter()
  const search = useSearchParams()
  const sessionId = search.get('session_id')
  const [seconds, setSeconds] = useState(5)

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s - 1), 1000)
    const r = setTimeout(() => router.push('/portail/factures'), 5000)
    return () => { clearInterval(t); clearTimeout(r) }
  }, [router])

  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#065F46', margin: 0 }}>Paiement confirmé</h1>
      <p style={{ color: '#065F46', fontSize: 14, marginTop: 12 }}>
        Merci, votre règlement a bien été enregistré. Vous allez le voir apparaître dans l&apos;historique de votre facture.
      </p>
      {sessionId && (
        <p style={{ color: '#94A3B8', fontSize: 11, marginTop: 8 }}>
          Référence : {sessionId.slice(0, 24)}…
        </p>
      )}
      <p style={{ color: '#64748B', fontSize: 13, marginTop: 20 }}>
        Retour automatique dans {seconds} seconde{seconds > 1 ? 's' : ''}…
      </p>
      <button onClick={() => router.push('/portail/factures')} className="btn-primary" style={{ marginTop: 16 }}>
        Retour à mes factures
      </button>
    </div>
  )
}
