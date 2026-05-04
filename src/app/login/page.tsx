'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [debug, setDebug] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDebug('')

    const supabase = createClient()

    // Test 1 : est-ce que le client Supabase est bien initialisé ?
    setDebug('Connexion à Supabase...')

    const { error: authError, data } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      // Afficher l'erreur BRUTE de Supabase (pas traduite)
      setError(authError.message)
      setDebug(`Code: ${authError.status ?? 'N/A'} | Message: ${authError.message}`)
      setLoading(false)
      return
    }

    setDebug('Auth OK — récupération du profil...')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setError('Session introuvable après connexion'); setLoading(false); return }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (profileError) {
      setDebug(`Profil erreur: ${profileError.message}`)
      setError(`Profil introuvable: ${profileError.message}`)
      setLoading(false)
      return
    }

    setDebug(`Rôle: ${profile?.role}`)

    if (profile?.role === 'super_admin') {
      router.push('/admin/dashboard')
    } else if (profile?.role === 'admin') {
      // Récupérer l'école séparément (évite le problème de join)
      const { data: ecoleProfile } = await supabase
        .from('profiles')
        .select('ecole_id')
        .eq('id', session.user.id)
        .single()

      if (ecoleProfile?.ecole_id) {
        const { data: ecole } = await supabase
          .from('ecoles')
          .select('slug')
          .eq('id', ecoleProfile.ecole_id)
          .single()
        router.push(`/${ecole?.slug ?? 'hederloubavitch'}/dashboard`)
      } else {
        router.push('/hederloubavitch/dashboard')
      }
    } else {
      router.push('/portail')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F4FA' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', marginBottom: 24 }}>Connexion TalmidApp</h2>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>EMAIL</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@talmidapp.fr" required
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>MOT DE PASSE</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>
              ❌ {error}
            </div>
          )}

          {debug && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', color: '#64748B', fontSize: 11, fontFamily: 'monospace' }}>
              🔍 {debug}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ padding: '12px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
