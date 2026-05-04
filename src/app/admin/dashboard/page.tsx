'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const PLAN_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  starter:    { label: 'Starter',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  pro:        { label: 'Pro',        color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
  enterprise: { label: 'Enterprise', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
}
const PLANS = ['starter', 'pro', 'enterprise']
const COULEURS = ['#2563EB', '#7C3AED', '#059669', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#1D4ED8']

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 30)
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [ecoles, setEcoles] = useState<any[]>([])
  const [stats, setStats] = useState({ ecoles: 0, familles: 0, eleves: 0 })
  const [loading, setLoading] = useState(true)

  // Édition inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const [{ data: ecolesData }, { count: familles }, { count: eleves }] = await Promise.all([
      s.from('ecoles').select('*').order('created_at', { ascending: false }),
      s.from('familles').select('*', { count: 'exact', head: true }),
      s.from('enfants').select('*', { count: 'exact', head: true }),
    ])
    setEcoles(ecolesData ?? [])
    setStats({ ecoles: ecolesData?.length ?? 0, familles: familles ?? 0, eleves: eleves ?? 0 })
    setLoading(false)
  }

  function startEdit(ecole: any) {
    setEditId(ecole.id)
    setEditForm({ ...ecole })
  }

  function cancelEdit() {
    setEditId(null)
    setEditForm(null)
  }

  async function uploadLogo(file: File) {
    if (!editId) return
    setUploadingLogo(true)
    const s = createClient()
    const ext = file.name.split('.').pop()
    const path = `${editId}.${ext}`

    const { error: upErr } = await s.storage.from('logos').upload(path, file, { upsert: true })
    if (upErr) { alert('Erreur upload : ' + upErr.message); setUploadingLogo(false); return }

    const { data: { publicUrl } } = s.storage.from('logos').getPublicUrl(path)
    setEditForm((p: any) => ({ ...p, logo_url: publicUrl }))
    setUploadingLogo(false)
  }

  async function saveEdit() {
    setSaving(true)
    const s = createClient()

    if (editForm.slug !== ecoles.find(e => e.id === editId)?.slug) {
      const { data: ex } = await s.from('ecoles').select('id').eq('slug', editForm.slug).neq('id', editId).single()
      if (ex) { alert(`Slug « ${editForm.slug} » déjà utilisé`); setSaving(false); return }
    }

    await s.from('ecoles').update({
      nom: editForm.nom,
      slug: editForm.slug,
      couleur_primaire: editForm.couleur_primaire,
      logo_url: editForm.logo_url,
      email_contact: editForm.email_contact,
      plan: editForm.plan,
      actif: editForm.actif,
      notes_admin: editForm.notes_admin,
    }).eq('id', editId!)

    setSaving(false)
    setEditId(null)
    setEditForm(null)
    await load()
  }

  const card = (icon: string, label: string, value: number | string, color: string, bg: string) => (
    <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{loading ? '—' : value}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )

  const inp = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7, padding: '7px 10px', color: '#F1F5F9', fontSize: 12,
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>Vue d'ensemble</h1>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 }}>Console d'administration TalmidApp</p>
        </div>
        <button onClick={() => router.push('/admin/ecoles/new')} style={{
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', borderRadius: 10,
          padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>+ Nouvelle école</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {card('🏫', 'Écoles actives', stats.ecoles, '#A5B4FC', 'rgba(99,102,241,0.15)')}
        {card('👨‍👩‍👧', 'Familles total', stats.familles, '#34D399', 'rgba(16,185,129,0.12)')}
        {card('🎓', 'Élèves total', stats.eleves, '#60A5FA', 'rgba(37,99,235,0.15)')}
      </div>

      {/* Tableau */}
      <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#F1F5F9' }}>Écoles ({stats.ecoles})</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Cliquez ✏️ pour éditer</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Chargement...</div>
        ) : ecoles.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Aucune école</div>
            <button onClick={() => router.push('/admin/ecoles/new')}
              style={{ marginTop: 16, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, padding: '8px 18px', color: '#A5B4FC', fontSize: 13, cursor: 'pointer' }}>
              Créer la première école
            </button>
          </div>
        ) : (
          ecoles.map((e, i) => {
            const isEditing = editId === e.id
            const badge = PLAN_BADGE[e.plan] ?? PLAN_BADGE.starter

            return (
              <div key={e.id} style={{ borderBottom: i < ecoles.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                {/* Ligne normale */}
                {!isEditing && (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 14, transition: 'background 0.1s' }}
                    onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}>

                    {/* Logo/Avatar */}
                    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, overflow: 'hidden', background: `linear-gradient(135deg, ${e.couleur_primaire || '#2563EB'}, #60A5FA)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {e.logo_url
                        ? <img src={e.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{e.nom[0]?.toUpperCase()}</span>
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9' }}>{e.nom}</div>
                      <code style={{ fontSize: 11, color: '#64748B' }}>/{e.slug}</code>
                    </div>

                    <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: 20 }}>{badge.label}</span>
                    <span style={{ fontSize: 11, color: e.actif ? '#34D399' : '#F87171' }}>{e.actif ? '● Active' : '● Off'}</span>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', minWidth: 120 }}>{e.email_contact || '—'}</div>

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => startEdit(e)}
                        style={{ fontSize: 12, color: '#A5B4FC', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
                        ✏️ Éditer
                      </button>
                      <button onClick={() => router.push(`/${e.slug}/dashboard`)}
                        style={{ fontSize: 12, color: '#60A5FA', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
                        Accéder →
                      </button>
                    </div>
                  </div>
                )}

                {/* Panel d'édition inline */}
                {isEditing && editForm && (
                  <div style={{ padding: '20px 24px', background: 'rgba(99,102,241,0.06)', borderLeft: '3px solid #6366F1' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 16, alignItems: 'start' }}>

                      {/* Logo upload */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div
                          onClick={() => logoRef.current?.click()}
                          style={{
                            width: 64, height: 64, borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                            background: `linear-gradient(135deg, ${editForm.couleur_primaire || '#2563EB'}, #60A5FA)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '2px dashed rgba(99,102,241,0.5)', position: 'relative',
                          }}>
                          {uploadingLogo ? (
                            <div style={{ fontSize: 10, color: '#fff', textAlign: 'center' }}>...</div>
                          ) : editForm.logo_url ? (
                            <img src={editForm.logo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{editForm.nom[0]?.toUpperCase()}</span>
                          )}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', fontSize: 9, color: '#fff', textAlign: 'center', padding: '3px 0' }}>
                            {uploadingLogo ? '...' : '📷'}
                          </div>
                        </div>
                        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Logo<br/>max 2MB</div>
                      </div>

                      {/* Colonne 1 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600 }}>NOM</div>
                          <input style={inp} value={editForm.nom} onChange={e => setEditForm((p: any) => ({ ...p, nom: e.target.value }))} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600 }}>SLUG URL</div>
                          <input style={inp} value={editForm.slug} onChange={e => setEditForm((p: any) => ({ ...p, slug: slugify(e.target.value) }))} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600 }}>EMAIL</div>
                          <input style={inp} value={editForm.email_contact || ''} onChange={e => setEditForm((p: any) => ({ ...p, email_contact: e.target.value }))} />
                        </div>
                      </div>

                      {/* Colonne 2 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600 }}>COULEUR</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {COULEURS.map(c => (
                              <button key={c} onClick={() => setEditForm((p: any) => ({ ...p, couleur_primaire: c }))}
                                style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: editForm.couleur_primaire === c ? `3px solid ${c}` : 'none', outlineOffset: 2, transform: editForm.couleur_primaire === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.1s' }} />
                            ))}
                            <input type="color" value={editForm.couleur_primaire}
                              onChange={e => setEditForm((p: any) => ({ ...p, couleur_primaire: e.target.value }))}
                              style={{ width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 0 }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600 }}>PLAN</div>
                          <select style={inp} value={editForm.plan} onChange={e => setEditForm((p: any) => ({ ...p, plan: e.target.value }))}>
                            {PLANS.map(p => <option key={p} value={p} style={{ background: '#0D1526' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>ACTIVE</div>
                          <button onClick={() => setEditForm((p: any) => ({ ...p, actif: !p.actif }))}
                            style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: editForm.actif ? '#6366F1' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'all 0.2s' }}>
                            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: editForm.actif ? 21 : 3, transition: 'all 0.2s' }} />
                          </button>
                        </div>
                      </div>

                      {/* Colonne 3 — notes */}
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: 600 }}>NOTES INTERNES</div>
                        <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={editForm.notes_admin || ''} onChange={e => setEditForm((p: any) => ({ ...p, notes_admin: e.target.value }))} />
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                      <button onClick={cancelEdit}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 18px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
                        Annuler
                      </button>
                      <button onClick={saveEdit} disabled={saving}
                        style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Enregistrement...' : '✓ Enregistrer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
