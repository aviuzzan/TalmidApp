'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function ComptesParentsPage() {
  const ecole = useEcole()
  const [familles, setFamilles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal création
  const [modal, setModal] = useState<any>(null) // { famille }
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' })
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => { load() }, [ecole.id])

  async function load() {
    setLoading(true)
    const s = createClient()

    // Récupérer familles + leurs comptes parents
    const { data: fams } = await s
      .from('familles')
      .select('id, nom, numero, parent1_prenom, parent1_nom, parent1_email, parent2_prenom, parent2_nom, parent2_email')
      .eq('ecole_id', ecole.id)
      .order('nom')

    // Récupérer les profiles parents liés
    const { data: parentProfiles } = await s
      .from('profiles')
      .select('id, famille_id, ecole_id')
      .eq('role', 'parent')
      .eq('ecole_id', ecole.id)

    // Récupérer les emails des parents (via auth — on a juste les IDs)
    // On fait un join manuel
    const familleMap = new Map()
    parentProfiles?.forEach(p => {
      if (!familleMap.has(p.famille_id)) familleMap.set(p.famille_id, [])
      familleMap.get(p.famille_id).push(p)
    })

    const enriched = (fams ?? []).map(f => ({
      ...f,
      comptes: familleMap.get(f.id) || [],
    }))

    setFamilles(enriched)
    setLoading(false)
  }

  function openModal(famille: any) {
    setModal({ famille })
    // Pré-remplir avec email parent1 si disponible
    setForm({
      email: famille.parent1_email || '',
      password: '',
      confirmPassword: '',
    })
    setResult(null)
  }

  async function creerCompte() {
    if (!form.email || !form.password) { setResult({ ok: false, msg: 'Email et mot de passe requis' }); return }
    if (form.password.length < 8) { setResult({ ok: false, msg: 'Mot de passe trop court (8 min)' }); return }
    if (form.password !== form.confirmPassword) { setResult({ ok: false, msg: 'Mots de passe différents' }); return }

    setCreating(true); setResult(null)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setResult({ ok: false, msg: 'Session expirée' }); setCreating(false); return }

    const res = await fetch('/api/admin/creer-parent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        familleId: modal.famille.id,
        ecoleId: ecole.id,
      }),
    })

    const json = await res.json()
    if (res.ok) {
      setResult({ ok: true, msg: json.existed ? `Compte existant lié à ${modal.famille.nom} ✓` : `Compte créé pour ${form.email} ✓` })
      await load()
      setTimeout(() => { setModal(null); setResult(null) }, 2000)
    } else {
      setResult({ ok: false, msg: json.error || 'Erreur' })
    }
    setCreating(false)
  }

  const filtered = familles.filter(f => {
    if (!search) return true
    const q = search.toLowerCase()
    return f.nom?.toLowerCase().includes(q) ||
      f.parent1_nom?.toLowerCase().includes(q) ||
      f.parent1_prenom?.toLowerCase().includes(q) ||
      f.parent1_email?.toLowerCase().includes(q)
  })

  const avecCompte = familles.filter(f => f.comptes.length > 0).length
  const sansCompte = familles.filter(f => f.comptes.length === 0).length

  const inp = {
    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
    padding: '9px 12px', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Comptes parents</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Créez les accès portail pour chaque famille
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Total familles', value: familles.length, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Avec compte portail', value: avecCompte, color: '#10B981', bg: '#ECFDF5' },
          { label: 'Sans compte', value: sansCompte, color: '#F59E0B', bg: '#FFFBEB' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Barre recherche */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>🔍</span>
        <input style={{ ...inp, paddingLeft: 36 }} value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une famille..." />
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            {search ? `Aucun résultat pour « ${search} »` : 'Aucune famille'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Famille', 'Responsable 1', 'Email', 'Portail', ''].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const aCompte = f.comptes.length > 0
                return (
                  <tr key={f.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{f.nom}</div>
                      {f.numero && <div style={{ fontSize: 11, color: '#94A3B8' }}>N° {f.numero}</div>}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, color: '#475569' }}>
                      {[f.parent1_prenom, f.parent1_nom].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>
                      {f.parent1_email || '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {aCompte ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '3px 12px' }}>
                          ✓ Actif ({f.comptes.length})
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '3px 12px' }}>
                          Aucun compte
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <button onClick={() => openModal(f)}
                        style={{
                          fontSize: 12, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500,
                          background: aCompte ? '#F1F5F9' : '#2563EB',
                          color: aCompte ? '#475569' : '#fff',
                          border: aCompte ? '1px solid #E2E8F0' : 'none',
                        }}>
                        {aCompte ? '+ Ajouter compte' : 'Créer accès'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal création compte */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                Créer un accès portail
              </h2>
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                Famille <strong>{modal.famille.nom}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Adresse email
                </label>
                <input style={inp} type="email" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="parent@email.fr" />
                {modal.famille.parent1_email && form.email !== modal.famille.parent1_email && (
                  <button onClick={() => setForm(p => ({ ...p, email: modal.famille.parent1_email }))}
                    style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
                    Utiliser {modal.famille.parent1_email}
                  </button>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Mot de passe
                </label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, paddingRight: 40 }} type={showPwd ? 'text' : 'password'}
                    value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="8 caractères minimum" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 15 }}>
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Confirmer le mot de passe
                </label>
                <input style={{
                  ...inp,
                  borderColor: form.confirmPassword && form.confirmPassword !== form.password ? '#FCA5A5' : '#E2E8F0',
                }} type={showPwd ? 'text' : 'password'}
                  value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Même mot de passe" />
              </div>

              {result && (
                <div style={{
                  background: result.ok ? 'rgba(16,185,129,0.1)' : '#FEF2F2',
                  border: `1px solid ${result.ok ? 'rgba(16,185,129,0.3)' : '#FECACA'}`,
                  borderRadius: 8, padding: '10px 14px',
                  color: result.ok ? '#059669' : '#DC2626', fontSize: 13,
                }}>
                  {result.msg}
                </div>
              )}

              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748B' }}>
                💡 Le parent se connectera sur{' '}
                <strong>talmidapp.fr/{ecole.slug}/login</strong>{' '}
                → Espace Parents
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(null)}
                style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={creerCompte} disabled={creating}
                style={{ background: '#2563EB', border: 'none', borderRadius: 9, padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                {creating ? 'Création...' : '✓ Créer l\'accès'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
