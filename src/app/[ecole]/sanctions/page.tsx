'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Sanction = {
  id: string
  enfant_id: string
  type: string
  motif: string
  date_fait: string
  date_application: string | null
  duree_jours: number | null
  appreciation: string | null
  notif_famille: boolean
  notif_famille_at: string | null
  created_at: string
  enfants?: { prenom: string; nom: string; classes: { nom: string } | null; famille_id: string }
}

const TYPES = [
  { value: 'avertissement', label: 'Avertissement', icon: '⚠', bg: '#FEF3C7', fg: '#92400E' },
  { value: 'blame', label: 'Blâme', icon: '🚩', bg: '#FED7AA', fg: '#9A3412' },
  { value: 'retenue', label: 'Retenue', icon: '🕒', bg: '#DBEAFE', fg: '#1E40AF' },
  { value: 'exclusion_temporaire', label: 'Exclusion temporaire', icon: '🚪', bg: '#FECACA', fg: '#991B1B' },
  { value: 'exclusion_definitive', label: 'Exclusion définitive', icon: '✕', bg: '#FEE2E2', fg: '#7F1D1D' },
  { value: 'conseil_discipline', label: 'Conseil de discipline', icon: '⚖', bg: '#F3E8FF', fg: '#6B21A8' },
  { value: 'autre', label: 'Autre', icon: '📋', bg: '#F1F5F9', fg: '#475569' },
]

export default function SanctionsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [sanctions, setSanctions] = useState<Sanction[]>([])
  const [eleves, setEleves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState<string>('tous')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    enfant_id: '', type: 'avertissement', motif: '',
    date_fait: new Date().toISOString().split('T')[0],
    date_application: '', duree_jours: '', appreciation: '',
  })

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: sans }, { data: enfs }] = await Promise.all([
      s.from('sanctions').select('*, enfants(prenom, nom, famille_id, classes(nom))').eq('ecole_id', ecole.id).order('date_fait', { ascending: false }),
      s.from('enfants').select('id, prenom, nom').eq('ecole_id', ecole.id).order('nom'),
    ])
    setSanctions((sans as any) || [])
    setEleves(enfs || [])
    setLoading(false)
  }, [ecole?.id])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.enfant_id || !form.motif.trim()) return alert('Élève et motif obligatoires')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    await s.from('sanctions').insert({
      ecole_id: ecole.id,
      enfant_id: form.enfant_id,
      type: form.type,
      motif: form.motif.trim(),
      date_fait: form.date_fait,
      date_application: form.date_application || null,
      duree_jours: form.duree_jours ? parseInt(form.duree_jours) : null,
      appreciation: form.appreciation || null,
      saisi_par: session?.user.id,
    })
    setShowForm(false)
    setForm({ enfant_id: '', type: 'avertissement', motif: '', date_fait: new Date().toISOString().split('T')[0], date_application: '', duree_jours: '', appreciation: '' })
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette sanction définitivement ?')) return
    await createClient().from('sanctions').delete().eq('id', id)
    await load()
  }

  async function marquerNotif(id: string) {
    await createClient().from('sanctions').update({ notif_famille: true, notif_famille_at: new Date().toISOString() }).eq('id', id)
    await load()
  }

  const filtered = filtre === 'tous' ? sanctions : sanctions.filter(s => s.type === filtre)
  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>⚖ Sanctions & discipline</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Avertissements, retenues, exclusions — dossier disciplinaire élève.</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Nouvelle sanction
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Nouvelle sanction</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Élève *</label>
              <select style={inp} value={form.enfant_id} onChange={e => setForm({ ...form, enfant_id: e.target.value })} required>
                <option value="">— Sélectionner —</option>
                {eleves.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Type *</label>
              <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Date du fait *</label>
              <input type="date" style={inp} value={form.date_fait} onChange={e => setForm({ ...form, date_fait: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Date d&apos;application</label>
              <input type="date" style={inp} value={form.date_application} onChange={e => setForm({ ...form, date_application: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Durée (jours)</label>
              <input type="number" style={inp} value={form.duree_jours} onChange={e => setForm({ ...form, duree_jours: e.target.value })} placeholder="Si exclusion temporaire" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Motif *</label>
              <textarea style={{ ...inp, minHeight: 60 }} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} required placeholder="Description précise des faits…" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Appréciation / décision</label>
              <textarea style={{ ...inp, minHeight: 50 }} value={form.appreciation} onChange={e => setForm({ ...form, appreciation: e.target.value })} placeholder="Décision du conseil, mesures éducatives, etc." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Enregistrer</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          </div>
        </form>
      )}

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setFiltre('tous')}
          style={{ background: filtre === 'tous' ? '#1E293B' : '#F1F5F9', color: filtre === 'tous' ? '#fff' : '#475569', border: 'none', borderRadius: 16, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Toutes ({sanctions.length})
        </button>
        {TYPES.map(t => {
          const count = sanctions.filter(s => s.type === t.value).length
          if (count === 0) return null
          return (
            <button key={t.value} onClick={() => setFiltre(t.value)}
              style={{ background: filtre === t.value ? t.fg : t.bg, color: filtre === t.value ? '#fff' : t.fg, border: 'none', borderRadius: 16, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {t.icon} {t.label} ({count})
            </button>
          )
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            {filtre === 'tous' ? '🎉 Aucune sanction enregistrée.' : `Aucune sanction de type "${TYPES.find(t => t.value === filtre)?.label}".`}
          </div>
        ) : (
          filtered.map(s => {
            const t = TYPES.find(x => x.value === s.type)!
            return (
              <div key={s.id} style={{ padding: 14, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{t.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{s.enfants?.prenom} {s.enfants?.nom}</span>
                    <span style={{ fontSize: 11, color: t.fg, background: t.bg, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{t.label}</span>
                    {s.enfants?.classes?.nom && <span style={{ fontSize: 11, color: '#64748B' }}>· {s.enfants.classes.nom}</span>}
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>· {new Date(s.date_fait).toLocaleDateString('fr-FR')}</span>
                    {s.duree_jours && <span style={{ fontSize: 11, color: '#991B1B', fontWeight: 600 }}>· {s.duree_jours} jour(s)</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#1E293B', marginTop: 6 }}>{s.motif}</div>
                  {s.appreciation && (
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>↳ {s.appreciation}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {!s.notif_famille && (
                      <button onClick={() => marquerNotif(s.id)} style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>📧 Marquer famille notifiée</button>
                    )}
                    {s.notif_famille && (
                      <span style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 600 }}>✓ Famille notifiée le {new Date(s.notif_famille_at!).toLocaleDateString('fr-FR')}</span>
                    )}
                    <button onClick={() => router.push(`/${ecole.slug}/enfants/${s.enfant_id}`)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Voir l&apos;élève →</button>
                    <button onClick={() => remove(s.id)} style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>🗑</button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
