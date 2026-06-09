'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

/**
 * Espace parent - Mon compte.
 * Affiche l'email du compte et permet de changer le mot de passe.
 * Le mot de passe actuel est verifie (signInWithPassword) avant la mise a jour.
 */
export default function MonComptePage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [actuel, setActuel] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirme, setConfirme] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [familleId, setFamilleId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      setEmail(session?.user?.email || '')
      if (session?.user?.id) {
        const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
        setFamilleId(profile?.famille_id ?? null)
      }
      setLoading(false)
    })()
  }, [])

  async function exporterMesDonnees() {
    if (!familleId) return
    setExporting(true); setExportError('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setExportError('Session expirée'); setExporting(false); return }
    try {
      const r = await fetch('/api/admin/exporter-famille', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ familleId }),
      })
      if (!r.ok) {
        const j = await r.json()
        setExportError(j.error || 'Erreur export')
        setExporting(false)
        return
      }
      const blob = await r.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mes-donnees-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setExportError(e?.message || 'Erreur réseau')
    }
    setExporting(false)
  }

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (nouveau.length < 8) { setError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return }
    if (nouveau !== confirme) { setError('Les deux nouveaux mots de passe ne correspondent pas.'); return }
    if (!actuel) { setError('Veuillez saisir votre mot de passe actuel.'); return }

    setSaving(true)
    const s = createClient()

    // 1. Verifier le mot de passe actuel
    const { error: signErr } = await s.auth.signInWithPassword({ email, password: actuel })
    if (signErr) {
      setSaving(false)
      setError('Le mot de passe actuel est incorrect.')
      return
    }

    // 2. Mettre a jour le mot de passe
    const { error: updErr } = await s.auth.updateUser({
      password: nouveau,
      data: { password_set: true, password_set_at: new Date().toISOString() },
    })
    setSaving(false)
    if (updErr) {
      setError(updErr.message || 'Erreur lors de la mise a jour du mot de passe.')
      return
    }
    setOk('Votre mot de passe a bien ete modifie.')
    setActuel(''); setNouveau(''); setConfirme('')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#F8FAFC' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.mon_compte.title')}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{t('portail.mon_compte.subtitle')}</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>{t('portail.mon_compte.credentials')}</div>
        <div style={{ display: 'flex', fontSize: 13 }}>
          <div style={{ width: 160, color: '#94A3B8' }}>{t('portail.mon_compte.email_label')}</div>
          <div style={{ color: '#1E293B', fontWeight: 600 }}>{email || '-'}</div>
        </div>
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10, marginBottom: 0 }}>
          Pour modifier votre adresse e-mail, contactez l&apos;administration de l&apos;etablissement.
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>{t('portail.mon_compte.change_password')}</div>
        <form onSubmit={changerMotDePasse} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
          <div>
            <label style={lbl}>{t('portail.mon_compte.current_password')}</label>
            <input required type="password" autoComplete="current-password" value={actuel}
              onChange={e => setActuel(e.target.value)} style={inp} placeholder="Votre mot de passe actuel" />
          </div>
          <div>
            <label style={lbl}>{t('portail.mon_compte.new_password')}</label>
            <input required type="password" autoComplete="new-password" value={nouveau}
              onChange={e => setNouveau(e.target.value)} style={inp} placeholder="8 caractères minimum" />
    