'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Page "Mot de passe oublie".
 * L'utilisateur saisit son email, on envoie un lien de reinitialisation
 * via Supabase (resetPasswordForEmail). Le lien renvoie vers /auth/set-password
 * ou il pourra choisir un nouveau mot de passe.
 */
export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Veuillez saisir votre adresse e-mail.'); return }
    setLoading(true)
    const s = createClient()
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://talmidapp.fr'
    const { error: err } = await s.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: origin + '/auth/set-password',
    })
    setLoading(false)
    if (err) { setError(err.message || 'Une erreur est survenue. Veuillez reessayer.'); return }
    setSent(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F4FA', padding: 16, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 10px 40px rgba(15,23,42,0.08)' }}>
        {sent ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{'✉️'}</div>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#1E293B', margin: 0 }}>E-mail envoye</h1>
            <p style={{ color: '#475569', fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
              Si un compte existe avec l&apos;adresse <strong>{email.trim()}</strong>, vous allez recevoir un e-mail
              contenant un lien pour reinitialiser votre mot de passe. Pensez a verifier vos courriers indesirables.
            </p>
            <a href="/login" style={{ display: 'inline-block', marginTop: 18, color: '#2563EB', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
              &larr; Retour a la connexion
            </a>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{'🔑'}</div>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#1E293B', margin: 0 }}>Mot de passe oublie</h1>
            <p style={{ color: '#64748B', fontSize: 13, marginTop: 8, marginBottom: 22 }}>
              Saisissez l&apos;adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Adresse e-mail
                </label>
                <input
                  required type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="votre@email.fr" autoComplete="email"
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading}
                style={{ marginTop: 2, padding: '12px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Envoi en cours...' : 'Envoyer le lien de reinitialisation'}
              </button>
            </form>
            <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: '#64748B', fontSize: 13, textDecoration: 'none' }}>
              &larr; Retour a la connexion
            </a>
          </>
        )}
      </div>
    </div>
  )
}
