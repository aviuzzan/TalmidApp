'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export default function ComptesParentsPage() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [familles, setFamilles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const emptyForm = { email: '', password: '', prenom: '', nom: '', famille_id: '' }
  const [form, setForm] = useState(emptyForm)

  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: p }, { data: f }] = await Promise.all([
      supabase.from('profiles_with_email').select('*, familles(nom, numero)').eq('role', 'parent').order('created_at', { ascending: false }),
      supabase.from('familles').select('id, nom, numero').order('nom'),
    ])
    setProfiles(p ?? [])
    setFamilles(f ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function createParent(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')

    const { data, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { role: 'parent' } }
    })

    if (authErr || !data.user) {
      setError(authErr?.message ?? 'Erreur lors de la création')
      setSaving(false); return
    }

    // Mettre à jour le profil
    await supabase.from('profiles').upsert({
      id: data.user.id,
      role: 'parent',
      famille_id: form.famille_id || null,
      prenom: form.prenom,
      nom: form.nom,
    })

    setSuccess(`✓ Compte créé pour ${form.email}`)
    setShowForm(false); setForm(emptyForm); load(); setSaving(false)
  }

  async function linkFamille(profileId: string, familleId: string) {
    await supabase.from('profiles').update({ famille_id: familleId || null }).eq('id', profileId)
    load()
  }

  async function deleteParent(profileId: string) {
    if (!confirm('Supprimer ce compte parent ?')) return
    await supabase.from('profiles').delete().eq('id', profileId)
    load()
  }

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Comptes parents</h1>
          <p style={{ color: '#64748B', fontSize: 13 }}>Gérer les accès au portail famille — {profiles.length} compte{profiles.length > 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowForm(true); setError(''); setSuccess('') }}>
          + Créer un compte parent
        </button>
      </div>

      {success && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '12px 16px', color: '#059669', fontSize: 13 }}>
          {success}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['Nom', 'Email', 'Famille liée', 'Lier à une famille', 'Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
            ) : profiles.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#CBD5E1' }}>Aucun compte parent créé</td></tr>
            ) : profiles.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: i < profiles.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                  {p.prenom || p.nom ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>{p.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  {p.familles ? (
                    <span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                      {p.familles.nom} ({p.familles.numero})
                    </span>
                  ) : (
                    <span style={{ color: '#F59E0B', fontSize: 12, fontWeight: 500 }}>⚠ Non lié</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <select style={{ ...inp, width: 'auto', fontSize: 12 }}
                    value={p.famille_id ?? ''}
                    onChange={e => linkFamille(p.id, e.target.value)}>
                    <option value="">-- Sélectionner --</option>
                    {familles.map((f: any) => (
                      <option key={f.id} value={f.id}>{f.nom} ({f.numero})</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => deleteParent(p.id)} className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }}>
                    🗑️ Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal créer compte */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>👨‍👩‍👧 Créer un compte parent</h2>
              <button onClick={() => setShowForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
            </div>
            <form onSubmit={createParent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Prénom *</label>
                  <input style={inp} value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Nom *</label>
                  <input style={inp} value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Email *</label>
                <input style={inp} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Mot de passe *</label>
                <input style={inp} type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} placeholder="Minimum 6 caractères" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Famille à lier</label>
                <select style={inp} value={form.famille_id} onChange={e => setForm(p => ({ ...p, famille_id: e.target.value }))}>
                  <option value="">-- Sélectionner une famille --</option>
                  {familles.map((f: any) => <option key={f.id} value={f.id}>{f.nom} ({f.numero})</option>)}
                </select>
              </div>
              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0369A1' }}>
                ℹ️ Le parent pourra se connecter sur l'application avec cet email et mot de passe. Il accèdera uniquement aux informations de sa famille.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Création...' : '✓ Créer le compte'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
