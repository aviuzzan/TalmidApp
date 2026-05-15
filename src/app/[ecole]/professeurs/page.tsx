'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Prof = any
type Classe = { id: string; nom: string; ordre: number }
type ProfClasse = { professeur_id: string; classe_id: string; matieres: string[] }

export default function ProfesseursPage() {
  const ecole = useEcole()
  const [profs, setProfs] = useState<Prof[]>([])
  const [classes, setClasses] = useState<Classe[]>([])
  const [profClasses, setProfClasses] = useState<ProfClasse[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Prof | null>(null)

  // form
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', telephone: '', classeIds: [] as string[], matieres: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: p }, { data: c }, { data: pc }] = await Promise.all([
      s.from('professeurs').select('*').eq('ecole_id', ecole.id).order('nom'),
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('professeur_classes').select('*'),
    ])
    setProfs(p ?? [])
    setClasses(c ?? [])
    setProfClasses(pc ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ prenom: '', nom: '', email: '', telephone: '', classeIds: [], matieres: '' })
    setError('')
    setShowForm(true)
  }

  function openEdit(p: Prof) {
    setEditing(p)
    const assigned = profClasses.filter(pc => pc.professeur_id === p.id)
    const allMatieres = new Set<string>()
    assigned.forEach(a => (a.matieres || []).forEach(m => allMatieres.add(m)))
    setForm({
      prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.telephone || '',
      classeIds: assigned.map(a => a.classe_id),
      matieres: Array.from(allMatieres).join(', '),
    })
    setError('')
    setShowForm(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    if (!form.prenom || !form.nom || !form.email) { setError('Prénom, nom et email requis'); setSaving(false); return }
    const matieres = form.matieres.split(',').map(m => m.trim()).filter(Boolean)
    const s = createClient()

    if (editing) {
      // Update prof + classes
      const { error: e1 } = await s.from('professeurs').update({
        prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone || null, updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      if (e1) { setError(e1.message); setSaving(false); return }
      // Sync classes
      await s.from('professeur_classes').delete().eq('professeur_id', editing.id)
      if (form.classeIds.length > 0) {
        const rows = form.classeIds.map(cid => ({ professeur_id: editing.id, classe_id: cid, matieres }))
        await s.from('professeur_classes').insert(rows)
      }
    } else {
      // Création via API admin (qui invite par email)
      const { data: { session } } = await s.auth.getSession()
      const res = await fetch('/api/admin/creer-prof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone,
          ecoleId: ecole.id, classeIds: form.classeIds, matieres,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'Erreur'); setSaving(false); return }
      // Retour clair sur l'envoi de l'invitation
      if (j.invited && j.emailSent) {
        setInviteResult({ ok: true, msg: `Professeur ${form.prenom} ${form.nom} créé — invitation envoyée à ${form.email}.` })
      } else if (j.invited && !j.emailSent) {
        setInviteResult({ ok: false, msg: `Professeur ${form.prenom} ${form.nom} créé, mais l'email d'invitation n'a pas pu être envoyé${j.emailError ? ` (${j.emailError})` : ''}. ${j.message || ''}` })
      } else {
        setInviteResult({ ok: true, msg: j.message || `Professeur ${form.prenom} ${form.nom} enregistré.` })
      }
    }

    setShowForm(false); setSaving(false)
    await load()
  }

  async function toggleStatut(p: Prof) {
    const nouveau = p.statut === 'actif' ? 'inactif' : 'actif'
    await createClient().from('professeurs').update({ statut: nouveau, updated_at: new Date().toISOString() }).eq('id', p.id)
    await load()
  }

  function classesNoms(profId: string): string {
    return profClasses.filter(pc => pc.professeur_id === profId)
      .map(pc => classes.find(c => c.id === pc.classe_id)?.nom || '?')
      .join(', ')
  }
  function matieresNoms(profId: string): string {
    const set = new Set<string>()
    profClasses.filter(pc => pc.professeur_id === profId).forEach(pc => (pc.matieres || []).forEach(m => set.add(m)))
    return Array.from(set).join(', ')
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1E293B' }}>👨‍🏫 Professeurs</h1>
        <button onClick={openCreate} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Nouveau professeur</button>
      </div>

      {inviteResult && (
        <div style={{
          background: inviteResult.ok ? '#ECFDF5' : '#FFFBEB',
          border: `1px solid ${inviteResult.ok ? '#A7F3D0' : '#FDE68A'}`,
          color: inviteResult.ok ? '#065F46' : '#92400E',
          borderRadius: 10, padding: '12px 16px', fontSize: 13, marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{ flex: 1, wordBreak: 'break-word' }}>{inviteResult.ok ? '✓ ' : '⚠️ '}{inviteResult.msg}</div>
          <button onClick={() => setInviteResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 15, flexShrink: 0 }}>✕</button>
        </div>
      )}

      <div className="card" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        {profs.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
            Aucun professeur. Cliquez sur "+ Nouveau professeur" pour commencer.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Prof</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Email</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Classes</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Matières</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Statut</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profs.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{p.prenom} {p.nom}</td>
                  <td style={{ padding: '12px 14px', color: '#64748B' }}><a href={`mailto:${p.email}`} style={{ color: '#2563EB', textDecoration: 'none' }}>{p.email}</a>{p.telephone && <div style={{ fontSize: 11 }}>{p.telephone}</div>}</td>
                  <td style={{ padding: '12px 14px', color: '#475569', fontSize: 12 }}>{classesNoms(p.id) || <span style={{ color: '#94A3B8' }}>—</span>}</td>
                  <td style={{ padding: '12px 14px', color: '#475569', fontSize: 12 }}>{matieresNoms(p.id) || <span style={{ color: '#94A3B8' }}>—</span>}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{ background: p.statut === 'actif' ? '#ECFDF5' : '#FEF2F2', color: p.statut === 'actif' ? '#065F46' : '#991B1B', padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                      {p.statut === 'actif' ? '✓ Actif' : '○ Inactif'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <button onClick={() => openEdit(p)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginRight: 4 }}>✎</button>
                    <button onClick={() => toggleStatut(p)} style={{ background: p.statut === 'actif' ? '#FEF2F2' : '#ECFDF5', color: p.statut === 'actif' ? '#991B1B' : '#065F46', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {p.statut === 'actif' ? 'Désactiver' : 'Activer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={save} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: '#1E293B' }}>{editing ? 'Modifier le professeur' : 'Nouveau professeur'}</h2>
            {!editing && <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 16px' }}>Un email d'invitation sera envoyé pour définir le mot de passe.</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <label><div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>Prénom *</div>
                <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} required style={inp} />
              </label>
              <label><div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>Nom *</div>
                <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required style={inp} />
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>Email *</div>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required disabled={!!editing} style={inp} />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>Téléphone</div>
              <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} style={inp} />
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>Classes assignées</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {classes.map(c => {
                  const on = form.classeIds.includes(c.id)
                  return (
                    <button type="button" key={c.id} onClick={() => setForm(f => ({ ...f, classeIds: on ? f.classeIds.filter(x => x !== c.id) : [...f.classeIds, c.id] }))}
                      style={{ background: on ? '#2563EB' : '#F1F5F9', color: on ? '#fff' : '#475569', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                      {on ? '✓' : '+'} {c.nom}
                    </button>
                  )
                })}
              </div>
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}><div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>Matières (séparées par virgule)</div>
              <input value={form.matieres} onChange={e => setForm(f => ({ ...f, matieres: e.target.value }))} placeholder="Ex : Mathématiques, Hébreu, Tora" style={inp} />
            </label>

            {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 7, fontSize: 12, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button type="submit" disabled={saving} style={{ background: saving ? '#94A3B8' : '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Enregistrement…' : (editing ? 'Enregistrer' : 'Créer + Inviter')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }
