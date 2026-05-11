'use client'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: '#F8FAFC',
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
          Cette page n&apos;est pas encore prête. Notre équipe travaille dessus
          et elle sera disponible très prochainement.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => router.back()} style={{
            background: '#F1F5F9', color: '#475569', border: 'none',
            borderRadius: 10, padding: '11px 20px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', minHeight: 44,
          }}>
            ← Page précédente
          </button>
          <button onClick={() => router.push('/')} style={{
            background: '#2563EB', color: '#fff', border: 'none',
            borderRadius: 10, padding: '11px 20px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', minHeight: 44,
          }}>
            Accueil
          </button>
        </div>

        <p style={{
          fontSize: 11, color: '#94A3B8', marginTop: 24,
        }}>
          Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez l&apos;administration de votre école.
        </p>
      </div>
    </div>
  )
}
