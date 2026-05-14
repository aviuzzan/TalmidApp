'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useI18n } from '@/lib/i18n'
import LangSwitcher from '@/components/LangSwitcher'

/**
 * Page d'accueil de l'espace ecole : talmidapp.fr/[ecole]
 * - Si connecte -> redirige vers son espace (dashboard admin / portail famille)
 * - Sinon -> page de presentation avec bouton "Se connecter"
 */
export default function EcoleAccueilPage() {
  const router = useRouter()
  const ecole = useEcole()
  const { t, dir } = useI18n()
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
      <div style={{ color: '#64748B', fontSize: 14 }}>{t('common.loading')}</div>
    </div>
  )

  return (
    <div dir={dir} style={{
      minHeight: '100vh', background: '#F0F4FA',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'Inter, sans-serif', position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <LangSwitcher />
      </div>

      <div style={{
        background: '#fff', borderRadius: 20, padding: '44px 40px',
        maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 10px 40px rgba(15,23,42,0.08)',
        border: '1px solid #E2E8F0',
      }}>
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
          {t('accueil.welcome_on')}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1E293B', margin: '6px 0 4px' }}>
          {ecole.nom}
        </h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 28px', lineHeight: 1.5 }}>
          {t('accueil.desc')}
        </p>

        <button onClick={() => router.push(`/${ecole.slug}/login`)}
          style={{
            background: couleur, color: '#fff', border: 'none',
            borderRadius: 12, padding: '13px 28px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', width: '100%', minHeight: 48,
          }}>
          {t('accueil.login_button')}
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: '#94A3B8' }}>
          {t('accueil.powered_by')} <a href="https://talmidapp.fr" style={{ color: couleur, textDecoration: 'none', fontWeight: 600 }}>TalmidApp</a>
        </div>
      </div>
    </div>
  )
}
