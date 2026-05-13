'use client'
import { useRouter } from 'next/navigation'

export default function PaiementCancelPage() {
  const router = useRouter()
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>↩️</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', margin: 0 }}>Paiement annulé</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginTop: 12 }}>
        Vous avez annulé le paiement avant la fin. Aucun débit n&apos;a été effectué — vous pouvez réessayer à tout moment.
      </p>
      <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={() => router.push('/portail/factures')} className="btn-primary">
          Retour à mes factures
        </button>
      </div>
    </div>
  )
}
