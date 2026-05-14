'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Page d'accueil de l'espace école : talmidapp.fr/[ecole]
 * - Si l'utilisateur est déjà connecté → redirige vers son espace (dashboard admin / portail famille)
 * - Sinon → page de présentation avec bouton "Se connecter"
 */
export default function EcoleAccueilPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function check() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setChecking(false); return }
      const { data: profile } = await s.from('profiles').select('role').eq('id', session.user.id).single()
      if (profile?.role === 'admin' || profile?.role === 'super_admin') {
        router.push(`/${ecole.slug}/dashboard`)
      } else {
        router.push('/portail')
      }
    }
    check()
  }, [router, ecole.slug])

  const couleur = ecole.couleur_primaire || '#2563EB'

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F0F4FA' }}>
      <div style={{ color: '#64748B', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F4FA',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '44px 40px',
        maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 10px 40px rgba(15,23,42,0.08)',
        border: '1px solid #E2E8F0',
      }}>
        {/* Logo ou initiale */}
        {ecole.logo_url ? (
          <img src={ecole.logo_url} alt={ecole.nom}
            style={{ width: 72, height: 72, objectFit: 'contain', margin: '0 auto 18px', display: 'block' }} />
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: 18, margin: '0 auto 18px',
            background: `linear-gradient(135deg, ${couleur}, #60A5FA)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 800, color: '#fff',
          }}>
            {ecole.nom[0]?.toUpperCase()}
          </div>
        )}

        <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Bienvenue sur
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', margin: '6px 0 4px' }}>
          {ecole.nom}
        </h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 28px', lineHeight: 1.5 }}>
          Espace de gestion scolaire — administration, inscriptions, facturation et portail famille.
        </p>

        <button onClick={() => router.push(`/${ecole.slug}/login`)}
          style={{
            background: couleur, color: '#fff', border: 'none',
            borderRadius: 12, padding: '13px 28px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', width: '100%', minHeight: 48,
          }}>
          Se connecter →
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: '#94A3B8' }}>
          Propulsé par <a href="https://talmidapp.fr" style={{ color: couleur, textDecoration: 'none', fontWeight: 600 }}>TalmidApp</a>
        </div>
      </div>
    </div>
  )
}
