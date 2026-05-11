'use client'
import { useRouter, useParams } from 'next/navigation'

export default function EcoleNotFound() {
  const router = useRouter()
  const params = useParams()
  const slug = params.ecole as string

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', minHeight: '60vh',
    }}>
      <div style={{
        maxWidth: 480, width: '100%',
        background: '#fff', borderRadius: 16,
        border: '1px solid #E2E8F0',
        padding: 'clamp(28px, 6vw, 44px)', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
      }}>
        <div style={{
          width: 80, height: 80, margin: '0 auto 22px',
          borderRadius: 20, background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40,
        }}>🚧</div>

        <h1 style={{
          fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800,
          color: '#1E293B', margin: '0 0 10px',
        }}>
          Bientôt disponible
        </h1>

        <p style={{
          fontSize: 14, color: '#64748B', lineHeight: 1.6, margin: '0 0 24px',
        }}>
          Cette fonctionnalité n&apos;est pas encore active. Elle sera disponible dans une prochaine mise à jour.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => router.back()} style={{
            background: '#F1F5F9', color: '#475569', border: 'none',
            borderRadius: 10, padding: '11px 20px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', minHeight: 44,
          }}>
            ← Retour
          </button>
          <button onClick={() => router.push('/' + slug + '/dashboard')} style={{
            background: '#2563EB', color: '#fff', border: 'none',
            borderRadius: 10, padding: '11px 20px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', minHeight: 44,
          }}>
            Tableau de bord
          </button>
        </div>
      </div>
    </div>
  )
}
