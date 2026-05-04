'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function EcoleLoginPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const primaryColor = ecole.couleur_primaire || '#2563EB'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message.includes('Invalid') ? 'Email ou mot de passe incorrect.' : 'Une erreur est survenue.')
      setLoading(false)
    } else {
      router.push(`/${ecole.slug}/dashboard`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F0F4FA', fontFamily: 'Inter, sans-serif' }}>

      {/* Panneau gauche — branding école */}
      <div style={{
        width: '42%',
        background: `linear-gradient(160deg, #0F2554 0%, ${primaryColor} 100%)`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 48, gap: 28,
      }}>
        <div style={{ textAlign: 'center' }}>
          {ecole.logo_url ? (
            <img src={ecole.logo_url} alt={ecole.nom}
              style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'contain', margin: '0 auto 20px', display: 'block' }} />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: 20,
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)',
              border: '2px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, fontWeight: 800, color: '#fff', margin: '0 auto 20px',
            }}>
              {ecole.nom[0]?.toUpperCase()}
            </div>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {ecole.nom}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 8 }}>
            Espace administration · TalmidApp
          </p>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
          {['Gestion des familles', 'Suivi des élèves', 'Module financier', 'Documents & Paiements'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.82)', fontSize: 13 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
              }}>✓</div>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Panneau droit — formulaire */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', letterSpacing: '-0.01em' }}>
              Connexion
            </h2>
            <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
              Accédez à votre espace d'administration
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="label">Adresse email</label>
              <input
                className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@ecole.fr" required
              />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input" type={showPwd ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required style={{ paddingRight: 42 }}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16,
                }}>
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              className="btn-primary" type="submit" disabled={loading}
              style={{ padding: '12px', fontSize: 14, marginTop: 4, background: primaryColor, border: 'none' }}
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <p style={{ textAlign: 'center', color: '#CBD5E1', fontSize: 12, marginTop: 32 }}>
            TalmidApp © {new Date().getFullYear()} ·{' '}
            <a href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>talmidapp.fr</a>
          </p>
        </div>
      </div>
    </div>
  )
}
