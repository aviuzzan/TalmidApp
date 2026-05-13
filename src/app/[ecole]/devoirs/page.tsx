'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Classe = { id: string; nom: string; ordre: number }
type Matiere = { id: string; nom: string; couleur: string | null }
type Devoir = {
  id: string; classe_id: string; matiere_nom: string | null;
  matiere_id: string | null; titre: string; contenu: string | null;
  date_demande: string; date_pour: string;
  duree_estimee_min: number | null;
  classes?: { nom: string }
}

export default function DevoirsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Classe[]>([])
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [devoirs, setDevoirs] = useState<Devoir[]>([])
  const [selectedClasse, setSelectedClasse] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Devoir | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const todayIso = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    classe_id: '', matiere_id: '', matiere_nom: '',
    titre: '', contenu: '',
    date_demande: todayIso, date_pour: '',
    duree_estimee_min: '',
  })

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: mat }, { data: dev }] = await Promise.all([
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('matieres').select('id, nom, couleur').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('devoirs').select('*, classes(nom)').eq('ecole_id', ecole.id).gte('date_pour', todayIso).order('date_pour'),
    ])
    setClasses((cls ?? []) as Classe[])
    setMatieres((mat ?? []) as Matiere[])
    setDevoirs((dev ?? []) as Devoir[])
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  function openNew(classeId?: string) {
    setEditing(null)
    setForm({
      classe_id: classeId || selectedClasse || '',
      matiere_id: '', matiere_nom: '',
      titre: '', contenu: '',
      date_demande: todayIso, date_pour: '',
      duree_estimee_min: '',
    })
    setShowForm(true)
  }

  function openEdit(d: Devoir) {
    setEditing(d)
    setForm({
      classe_id: d.classe_id,
      matiere_id: d.matiere_id || '',
      matiere_nom: d.matiere_nom || '',
      titre: d.titre,
      contenu: d.contenu || '',
      date_demande: d.date_demande,
      date_pour: d.date_pour,
      duree_estimee_min: d.duree_estimee_min ? String(d.duree_estimee_min) : '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.classe_id || !form.titre || !form.date_pour) {
      setMsg('Classe, titre et date pour requis'); return
    }
    setSaving(true); setMsg('')
    const s = createClient()
    const mat = matieres.find(m => m.id === form.matiere_id)
    const payload: any = {
      ecole_id: ecole.id,
      classe_id: form.classe_id,
      matiere_id: form.matiere_id || null,
      matiere_nom: mat ? mat.nom : (form.matiere_nom || null),
      titre: form.titre,
      contenu: form.contenu || null,
      date_demande: form.date_demande,
      date_pour: form.date_pour,
      duree_estimee_min: form.duree_estimee_min ? Number(form.duree_estimee_min) : null,
    }
    const { error } = editing
      ? await s.from('devoirs').update(payload).eq('id', editing.id)
      : await s.from('devoirs').insert(payload)
    setSaving(false)
    if (error) { setMsg('Erreur : ' + error.message); return }
    setShowForm(false); setEditing(null)
    await load()
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer ce devoir ?')) return
    const { error } = await createClient().from('devoirs').delete().eq('id', id)
    if (!error) await load()
  }

  const filtered = selectedClasse ? devoirs.filter(d => d.classe_id === selectedClasse) : devoirs

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📓 Cahier de textes</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Devoirs à faire visibles par les parents</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedClasse} onChange={e => setSelectedClasse(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="">Toutes les classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <button onClick={() => openNew()} className="btn-primary">+ Nouveau devoir</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          Aucun devoir à venir. Cliquez sur "Nouveau devoir" pour en ajouter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(d => (
            <div key={d.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ background: '#EFF6FF', color: '#1E40AF', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{d.classes?.nom || '—'}</span>
                  {d.matiere_nom && <span style={{ background: '#FFFBEB', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{d.matiere_nom}</span>}
                  <span style={{ fontSize: 11, color: '#64748B' }}>📅 Pour le {new Date(d.date_pour).toLocaleDateString('fr-FR')}</span>
                  {d.duree_estimee_min && <span style={{ fontSize: 11, color: '#64748B' }}>⏱ ~{d.duree_estimee_min} min</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{d.titre}</div>
                {d.contenu && <div style={{ fontSize: 12, color: '#475569', marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.contenu}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => openEdit(d)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                <button onClick={() => supprimer(d.id)} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 16px' }}>{editing ? 'Modifier' : 'Nouveau'} devoir</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Classe *</label>
                <select style={inp} value={form.classe_id} onChange={e => setForm({ ...form, classe_id: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Matière</label>
                <select style={inp} value={form.matiere_id} onChange={e => setForm({ ...form, matiere_id: e.target.value })}>
                  <option value="">— Aucune —</option>
                  {matieres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Titre *</label>
                <input style={inp} value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} placeholder="Exercices p.42 n°5,6,7" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Détail / consigne</label>
                <textarea style={{ ...inp, minHeight: 100, fontFamily: 'inherit', resize: 'vertical' }} value={form.contenu} onChange={e => setForm({ ...form, contenu: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Donné le</label>
                  <input style={inp} type="date" value={form.date_demande} onChange={e => setForm({ ...form, date_demande: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Pour le *</label>
                  <input style={inp} type="date" value={form.date_pour} onChange={e => setForm({ ...form, date_pour: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Durée (min)</label>
                  <input style={inp} type="number" min={1} value={form.duree_estimee_min} onChange={e => setForm({ ...form, duree_estimee_min: e.target.value })} />
                </div>
              </div>
              {msg && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                <button onClick={() => setShowForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
