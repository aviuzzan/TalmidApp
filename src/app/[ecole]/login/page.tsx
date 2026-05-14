'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useI18n } from '@/lib/i18n'
import LangSwitcher from '@/components/LangSwitcher'

type Mode = 'accueil' | 'admin' | 'professeur' | 'parent'

export default function EcoleLoginPage() {
  const router = useRouter()
  const ecole = useEcole()
  const { t, dir } = useI18n()
  const [mode, setMode] = useState<Mode>('accueil')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const primary = ecole.couleur_primaire || '#2563EB'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(t('login.error'))
      setLoading(false)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError(t('login.error')); setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const role = profile?.role

    if (mode === 'admin') {
      if (role === 'admin' || role === 'super_admin') router.push(`/${ecole.slug}/dashboard`)
      else { setError(t('login.no_admin_rights')); setLoading(false) }
    } else if (mode === 'professeur') {
      if (role === 'teacher') router.push('/portail/prof')
      else { setError(t('login.no_teacher_rights')); setLoading(false) }
    } else if (mode === 'parent') {
      if (role === 'parent') router.push('/portail')
      else { setError(t('login.no_parent_rights')); setLoading(false) }
    }
  }

  function back() {
    setMode('accueil')
    setEmail(''); setPassword(''); setError('')
  }

  const ROLE_CONFIG = {
    admin:      { label: t('login.role_admin'),   icon: '⚙️',  desc: t('login.role_admin_desc'),   color: '#6366F1', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.25)'  },
    professeur: { label: t('login.role_teacher'), icon: '📚',  desc: t('login.role_teacher_desc'), color: '#0891B2', bg: 'rgba(8,145,178,0.12)',   border: 'rgba(8,145,178,0.25)'   },
    parent:     { label: t('login.role_parent'),  icon: '👨‍👩‍👧', desc: t('login.role_parent_desc'),  color: primary,   bg: `${primary}20`,          border: `${primary}50`           },
  }

  return (
    <div className="ecole-login" dir={dir} style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: '#F0F4FA', fontFamily: 'Inter, sans-serif',
    }}>

      <header className="ecole-login-header" style={{
        padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderBottom: '1px solid #E2E8F0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
            background: `linear-gradient(135deg, ${primary}, #60A5FA)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {ecole.logo_url
              ? <img src={ecole.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{ecole.nom[0]?.toUpperCase()}</span>
            }
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>{ecole.nom}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{t('login.school_portal')}</div>
          </div>
        </div>
        <LangSwitcher compact />
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>

        {mode === 'accueil' && (
          <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1E293B', letterSpacing: '-0.02em', margin: 0 }}>
                {t('login.welcome')}
              </h1>
              <p style={{ color: '#64748B', fontSize: 14, marginTop: 8 }}>
                {t('login.choose_space')}
              </p>
            </div>

            <div className="ecole-login-roles" style={{ display: 'flex', gap: 12, width: '100%' }}>
              {(['admin', 'professeur'] as const).map(role => {
                const cfg = ROLE_CONFIG[role]
                return (
                  <button key={role} onClick={() => setMode(role)}
                    style={{
                      flex: 1, padding: '16px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
                      background: '#fff', border: `1px solid ${cfg.border}`,
                      transition: 'all 0.18s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = cfg.bg
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = '#fff'
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'
                    }}>
                    <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>{cfg.desc}</span>
                  </button>
                )
              })}
            </div>

            <button onClick={() => setMode('parent')}
              style={{
                width: '100%', padding: '24px 20px', borderRadius: 18, cursor: 'pointer',
                background: `linear-gradient(135deg, ${primary}, ${primary}CC)`,
                border: 'none', transition: 'all 0.18s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
                boxShadow: `0 4px 20px ${primary}40`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px ${primary}55`
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${primary}40`
              }}>
              <span style={{ fontSize: 36 }}>{ROLE_CONFIG.parent.icon}</span>
              <div style={{ textAlign: dir === 'rtl' ? 'right' : 'left' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                  {ROLE_CONFIG.parent.label}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                  {ROLE_CONFIG.parent.desc}
                </div>
              </div>
              <span style={{ marginInlineStart: 'auto', fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>→</span>
            </button>
          </div>
        )}

        {mode !== 'accueil' && (
          <div style={{ width: '100%', maxWidth: 420 }}>
            <button onClick={back}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 24, padding: 0 }}>
              ← {t('common.back')}
            </button>

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: ROLE_CONFIG[mode].bg, border: `1px solid ${ROLE_CONFIG[mode].border}`,
              borderRadius: 10, padding: '8px 14px', marginBottom: 20,
            }}>
              <span style={{ fontSize: 18 }}>{ROLE_CONFIG[mode].icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ROLE_CONFIG[mode].color }}>{ROLE_CONFIG[mode].label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{ecole.nom}</div>
              </div>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              {t('login.title')}
            </h2>
            <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 24px' }}>
              {mode === 'parent' && t('login.desc_parent')}
              {mode === 'admin' && t('login.desc_admin')}
              {mode === 'professeur' && t('login.desc_teacher')}
            </p>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('login.email')}</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="votre@email.fr" required
                  style={{ width: '100%', padding: '11px 14px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff', transition: 'border 0.15s' }}
                  onFocus={e => (e.target as HTMLElement).style.borderColor = primary}
                  onBlur={e => (e.target as HTMLElement).style.borderColor = '#E2E8F0'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('login.password')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="********" required
                    style={{ width: '100%', padding: '11px 40px 11px 14px', border: '1px solid #E2E8F0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff', transition: 'border 0.15s' }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = primary}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = '#E2E8F0'}
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    style={{ position: 'absolute', insetInlineEnd: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16 }}>
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{
                  padding: '13px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  background: mode === 'parent'
                    ? `linear-gradient(135deg, ${primary}, ${primary}CC)`
                    : `linear-gradient(135deg, ${ROLE_CONFIG[mode].color}, ${ROLE_CONFIG[mode].color}CC)`,
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  opacity: loading ? 0.7 : 1, marginTop: 4,
                  boxShadow: `0 4px 12px ${ROLE_CONFIG[mode].color}40`,
                  transition: 'all 0.15s',
                }}>
                {loading ? t('login.loading') : t('login.submit')}
              </button>
            </form>
          </div>
        )}
      </div>

      <footer style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #E2E8F0', background: '#fff' }}>
        <span style={{ fontSize: 11, color: '#CBD5E1' }}>
          TalmidApp © {new Date().getFullYear()} ·{' '}
          <a href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>talmidapp.fr</a>
        </span>
      </footer>
    </div>
  )
}
