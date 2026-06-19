'use client'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

export default function PaiementCancelPage() {
  const { t } = useI18n()
  const router = useRouter()
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>↩️</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', margin: 0 }}>{t('portail.paiement.cancel.title')}</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginTop: 12 }}>
        {t('portail.paiement.cancel.body')}
      </p>
      <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={() => router.push('/portail/factures')} className="btn-primary">
          {t('portail.paiement.cancel.back_to_invoices')}
        </button>
      </div>
    </div>
  )
}
