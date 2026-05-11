'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * Page de définition du mot de passe après une invitation.
 * - L'utilisateur arrive ici via le magic link Supabase (inviteUserByEmail)
 * - Sa session est déjà créée par Supabase JS (parse auto du hash #access_token)
 * - On l'oblige à définir un password avant de pouvoir continuer
 * - Une fois set, on le redirige vers son dashboard selon son rôle
 */
export default function SetPasswordPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    async function check() {
      const s = createClient()
      // Attendre que Supabase JS parse le hash et établisse la session
      // (au cas où on arrive directement avec #access_token=...)
      let attempts = 0
      let session = null
      while (attempts < 10 && !session) {
        const { data } = await s.auth.getSession()
        session = data.session
        if (!session) {
          await new Promise(r => setTimeout(r, 250))
          attempts++
        }
      }
      if (!session) {
        // pas de session → renvoyer au login
        router.replace('/login')
        return
      }
      setUserEmail(session.user.email || '')
      setChecking(false)
    }
    check()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setOk('')

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setSaving(true)
    const s = createClient()

    // 1. Définir le password
    const { error: updErr } = await s.auth.updateUser({
      password,
      data: { password_set: true, password_set_at: new Date().toISOString() },
    })
    if (updErr) {
      setError(updErr.message || 'Erreur lors de la définition du mot de passe.')
      setSaving(false)
      return
    }

    setOk('✓ Mot de passe défini. Redirection en cours…')

    // 2. Récupérer le rôle pour rediriger correctement
    const { data: { session } } = await s.auth.getSession()
    if (!session) {
      router.replace('/login')
      return
    }

    const { data: profile } = await s
      .from('profiles')
      .select('role, ecole_id')
      .eq('id', session.user.id)
      .single()

    const role = profile?.role || 'parent'

    if (role === 'super_admin') {
      router.replace('/admin/dashboard')
    } else if (role === 'admin') {
      // chercher le slug de l'école
      let slug = 'hederloubavitch'
      if (profile?.ecole_id) {
        const { data: ecole } = await s
          .from('ecoles')
          .select('slug')
          .eq('id', profile.ecole_id)
          .single()
        if (ecole?.slug) slug = ecole.slug
      }
      router.replace(`/${slug}/dashboard`)
    } else if (role === 'teacher') {
      router.replace('/portail/prof')
    } else {
      router.replace('/portail')
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F4FA' }}>
        <div style={{ color: '#64748B', fontSize: 14 }}>Vérification de votre invitation…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F4FA', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 10px 40px rgba(15,23,42,0.08)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔑</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Définissez votre mot de passe</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 8, marginBottom: 24 }}>
          Bienvenue sur TalmidApp ! Vous êtes connecté avec <strong>{userEmail}</strong>.
          Choisissez un mot de passe sécurisé pour finaliser votre compte.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Nouveau mot de passe *
            </label>
            <input
              required type="password" autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
              Confirmer le mot de passe *
            </label>
            <input
              required type="password" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Retapez le même mot de passe"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: '#1E40AF' }}>
            💡 Choisissez un mot de passe unique. Il vous permettra de vous reconnecter ensuite à tout moment depuis la page de connexion.
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>
              ❌ {error}
            </div>
          )}
          {ok && (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', color: '#065F46', fontSize: 13 }}>
              {ok}
            </div>
          )}

          <button type="submit" disabled={saving}
            style={{ marginTop: 4, padding: '12px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Enregistrement…' : 'Valider mon mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}
