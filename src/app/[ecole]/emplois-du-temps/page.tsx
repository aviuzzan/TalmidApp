'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Prof = { id: string; prenom: string; nom: string; statut: string }
type Classe = { id: string; nom: string; ordre: number }
type Creneau = {
  id: string; professeur_id: string; classe_id: string;
  jour_semaine: number; heure_debut: string; heure_fin: string;
  matiere: string | null; salle: string | null; notes: string | null;
  annee_scolaire: string;
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']
const HEURES = Array.from({ length: 13 }, (_, i) => i + 7) // 7h à 19h

export default function EmploisDuTempsPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [profs, setProfs] = useState<Prof[]>([])
  const [classes, setClasses] = useState<Classe[]>([])
  const [creneaux, setCreneaux] = useState<Creneau[]>([])
  const [vue, setVue] = useState<'prof' | 'classe'>('classe')
  const [selectedId, setSelectedId] = useState<string>('')
  const [annee, setAnnee] = useState('2026-2027')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Creneau | null>(null)
  const [form, setForm] = useState<any>({
    professeur_id: '', classe_id: '', jour_semaine: 1,
    heure_debut: '09:00', heure_fin: '10:00',
    matiere: '', salle: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, annee])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: profsRaw }, { data: classesRaw }, { data: edt }] = await Promise.all([
      s.from('professeurs').select('id, prenom, nom, statut').eq('ecole_id', ecole.id).eq('statut', 'actif').order('nom'),
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('emploi_du_temps').select('*').eq('ecole_id', ecole.id).eq('annee_scolaire', annee),
    ])
    setProfs((profsRaw ?? []) as Prof[])
    setClasses((classesRaw ?? []) as Classe[])
    setCreneaux((edt ?? []) as Creneau[])
    if (!selectedId && (classesRaw?.length ?? 0) > 0) setSelectedId(classesRaw![0].id)
    setLoading(false)
  }

  function openNew(jour: number, heure: number) {
    setEditing(null)
    setForm({
      professeur_id: vue === 'prof' ? selectedId : '',
      classe_id: vue === 'classe' ? selectedId : '',
      jour_semaine: jour,
      heure_debut: String(heure).padStart(2, '0') + ':00',
      heure_fin: String(heure + 1).padStart(2, '0') + ':00',
      matiere: '', salle: '', notes: '',
    })
    setShowModal(true)
  }

  function openEdit(c: Creneau) {
    setEditing(c)
    setForm({
      professeur_id: c.professeur_id, classe_id: c.classe_id,
      jour_semaine: c.jour_semaine,
      heure_debut: c.heure_debut.slice(0, 5),
      heure_fin: c.heure_fin.slice(0, 5),
      matiere: c.matiere || '', salle: c.salle || '', notes: c.notes || '',
    })
    setShowModal(true)
  }

  function detectConflits(payload: any): Creneau[] {
    const startMin = toMin(payload.heure_debut)
    const endMin = toMin(payload.heure_fin)
    return creneaux.filter(c => {
      if (editing && c.id === editing.id) return false
      if (c.jour_semaine !== payload.jour_semaine) return false
      const same = c.professeur_id === payload.professeur_id || c.classe_id === payload.classe_id
      if (!same) return false
      const cs = toMin(c.heure_debut)
      const ce = toMin(c.heure_fin)
      return startMin < ce && endMin > cs
    })
  }

  async function save() {
    if (!form.professeur_id || !form.classe_id) {
      alert('Professeur et classe sont requis.')
      return
    }
    if (form.heure_debut >= form.heure_fin) {
      alert('L heure de fin doit etre apres l heure de debut.')
      return
    }
    const conflits = detectConflits(form)
    if (conflits.length > 0) {
      const msg = 'Conflit detecte : ' + conflits.length + ' creneau(x) qui se chevauche(nt). Voulez-vous quand meme enregistrer (override) ?'
      if (!confirm(msg)) return
    }
    setSaving(true)
    const s = createClient()
    const payload = {
      ecole_id: ecole.id,
      annee_scolaire: annee,
      professeur_id: form.professeur_id,
      classe_id: form.classe_id,
      jour_semaine: form.jour_semaine,
      heure_debut: form.heure_debut + ':00',
      heure_fin: form.heure_fin + ':00',
      matiere: form.matiere || null,
      salle: form.salle || null,
      notes: form.notes || null,
    }
    const { error } = editing
      ? await s.from('emploi_du_temps').update(payload).eq('id', editing.id)
      : await s.from('emploi_du_temps').insert(payload)
    setSaving(false)
    if (error) { alert('Erreur: ' + error.message); return }
    setShowModal(false); setEditing(null)
    await load()
  }

  async function supprimer() {
    if (!editing) return
    if (!confirm('Supprimer ce creneau ?')) return
    const s = createClient()
    const { error } = await s.from('emploi_du_temps').delete().eq('id', editing.id)
    if (error) { alert('Erreur: ' + error.message); return }
    setShowModal(false); setEditing(null)
    await load()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const filtered = creneaux.filter(c => vue === 'prof' ? c.professeur_id === selectedId : c.classe_id === selectedId)
  const profById = (id: string) => profs.find(p => p.id === id)
  const classeById = (id: string) => classes.find(c => c.id === id)

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: '0 0 16px' }}>Emplois du temps</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', padding: 4, borderRadius: 8 }}>
          <button onClick={() => { setVue('classe'); setSelectedId(classes[0]?.id || '') }}
            style={{ ...btnTab, background: vue === 'classe' ? '#fff' : 'transparent', color: vue === 'classe' ? '#1E293B' : '#64748B' }}>
            Par classe
          </button>
          <button onClick={() => { setVue('prof'); setSelectedId(profs[0]?.id || '') }}
            style={{ ...btnTab, background: vue === 'prof' ? '#fff' : 'transparent', color: vue === 'prof' ? '#1E293B' : '#64748B' }}>
            Par professeur
          </button>
        </div>

        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">— Choisir —</option>
          {vue === 'classe'
            ? classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)
            : profs.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
        </select>

        <select value={annee} onChange={e => setAnnee(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="2026-2027">2026-2027</option>
          <option value="2027-2028">2027-2028</option>
        </select>

        <button onClick={() => openNew(1, 9)} style={btnPrim} disabled={!selectedId}>+ Creneau</button>
      </div>

      {!selectedId ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>
          Selectionnez une {vue === 'classe' ? 'classe' : 'professeur'} pour afficher l emploi du temps.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ ...th, width: 60 }}>Heure</th>
                {JOURS.map((j, idx) => <th key={idx} style={th}>{j}</th>)}
              </tr>
            </thead>
            <tbody>
              {HEURES.map(h => (
                <tr key={h} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#64748B', background: '#F8FAFC' }}>{h}h</td>
                  {JOURS.map((_, jour) => {
                    const cellCreneaux = filtered.filter(c => {
                      if (c.jour_semaine !== jour) return false
                      const startHour = parseInt(c.heure_debut.slice(0, 2))
                      return startHour === h
                    })
                    return (
                      <td key={jour} style={{ ...td, padding: 2, position: 'relative', minHeight: 50, cursor: 'pointer' }}
                        onClick={() => cellCreneaux.length === 0 && openNew(jour, h)}>
                        {cellCreneaux.length === 0 ? (
                          <div style={{ minHeight: 40, padding: 4, color: '#CBD5E1', fontSize: 10, textAlign: 'center' }}>+</div>
                        ) : (
                          cellCreneaux.map(c => {
                            const dur = toMin(c.heure_fin) - toMin(c.heure_debut)
                            const p = profById(c.professeur_id)
                            const cl = classeById(c.classe_id)
                            return (
                              <div key={c.id} onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                                style={{
                                  background: '#DBEAFE', border: '1px solid #93C5FD',
                                  borderRadius: 4, padding: '4px 6px', marginBottom: 2,
                                  fontSize: 10, lineHeight: 1.3,
                                  minHeight: Math.max(40, dur),
                                }}>
                                <div style={{ fontWeight: 700, color: '#1E40AF' }}>
                                  {c.heure_debut.slice(0,5)}–{c.heure_fin.slice(0,5)}
                                </div>
                                {c.matiere && <div style={{ color: '#1E293B', fontWeight: 600 }}>{c.matiere}</div>}
                                <div style={{ color: '#64748B' }}>
                                  {vue === 'classe' ? (p ? p.prenom[0] + '. ' + p.nom : '—') : (cl ? cl.nom : '—')}
                                </div>
                                {c.salle && <div style={{ color: '#94A3B8' }}>salle {c.salle}</div>}
                              </div>
                              )
                            })
                    )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: '100%', maxWidth: 480 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>
              {editing ? 'Modifier le creneau' : 'Nouveau creneau'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FieldP label="Professeur *">
                <select value={form.professeur_id} onChange={e => setForm({ ...form, professeur_id: e.target.value })} style={inp}>
                  <option value="">—</option>
                  {profs.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
                </select>
              </FieldP>
              <FieldP label="Classe *">
                <select value={form.classe_id} onChange={e => setForm({ ...form, classe_id: e.target.value })} style={inp}>
                  <option value="">—</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </FieldP>
            </div>

            <FieldP label="Jour">
              <select value={form.jour_semaine} onChange={e => setForm({ ...form, jour_semaine: Number(e.target.value) })} style={inp}>
                {JOURS.map((j, i) => <option key={i} value={i}>{j}</option>)}
              </select>
            </FieldP>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FieldP label="Heure debut">
                <input type="time" value={form.heure_debut} onChange={e => setForm({ ...form, heure_debut: e.target.value })} style={inp} />
              </FieldP>
              <FieldP label="Heure fin">
                <input type="time" value={form.heure_fin} onChange={e => setForm({ ...form, heure_fin: e.target.value })} style={inp} />
              </FieldP>
            </div>

            <FieldP label="Matiere">
              <input type="text" value={form.matiere} onChange={e => setForm({ ...form, matiere: e.target.value })} style={inp} />
            </FieldP>
            <FieldP label="Salle">
              <input type="text" value={form.salle} onChange={e => setForm({ ...form, salle: e.target.value })} style={inp} />
            </FieldP>
            <FieldP label="Notes">
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} />
            </FieldP>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
              <div>
                {editing && (
                  <button onClick={supprimer} style={{ ...btnSec, color: '#991B1B' }} disabled={saving}>
                    Supprimer
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowModal(false); setEditing(null) }} style={btnSec} disabled={saving}>Annuler</button>
                <button onClick={save} style={btnPrim} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
const btnPrim: React.CSSProperties = { background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnSec: React.CSSProperties = { background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnTab: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '6px 4px', verticalAlign: 'top', borderRight: '1px solid #F1F5F9' }

function FieldP({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
