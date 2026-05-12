'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Matiere = { id: string; nom: string; code: string | null; couleur: string }
type Classe = { id: string; nom: string }
type Eval = { id: string; titre: string; type: string; date_eval: string; bareme: number; coefficient: number; trimestre: number | null; matiere_id: string; classe_id: string }
type Note = { id: string; evaluation_id: string; enfant_id: string; note: number | null; appreciation: string | null; absent: boolean }

export default function NotesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [tab, setTab] = useState<'evaluations'|'matieres'>('evaluations')
  const [matieres, setMatieres] = useState<Matiere[]>([])
  const [classes, setClasses] = useState<Classe[]>([])
  const [evals, setEvals] = useState<Eval[]>([])
  const [filterClasse, setFilterClasse] = useState<string>('')
  const [filterTrim, setFilterTrim] = useState<number | ''>('')
  const [showEvalForm, setShowEvalForm] = useState(false)
  const [showMatiereForm, setShowMatiereForm] = useState(false)
  const [editEval, setEditEval] = useState<Eval | null>(null)
  const [openEval, setOpenEval] = useState<Eval | null>(null)
  const [notesEdit, setNotesEdit] = useState<Record<string, { note: string; appreciation: string; absent: boolean }>>({})
  const [eleves, setEleves] = useState<any[]>([])
  const [evalForm, setEvalForm] = useState({ titre: '', type: 'controle', matiere_id: '', classe_id: '', date_eval: new Date().toISOString().split('T')[0], bareme: 20, coefficient: 1, trimestre: 1 })
  const [matiereForm, setMatiereForm] = useState({ nom: '', code: '', couleur: '#2563EB' })

  const load = useCallback(async () => {
    if (!ecole?.id) return
    const s = createClient()
    const [{ data: mats }, { data: cls }, { data: ev }] = await Promise.all([
      s.from('matieres').select('*').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('classes').select('id, nom').eq('ecole_id', ecole.id).order('ordre'),
      s.from('evaluations').select('*').eq('ecole_id', ecole.id).order('date_eval', { ascending: false }),
    ])
    setMatieres(mats || [])
    setClasses(cls || [])
    setEvals((ev as any) || [])
  }, [ecole?.id])
  useEffect(() => { load() }, [load])

  async function saveMatiere(e: React.FormEvent) {
    e.preventDefault()
    if (!matiereForm.nom.trim()) return
    await createClient().from('matieres').insert({
      ecole_id: ecole.id, nom: matiereForm.nom.trim(), code: matiereForm.code || null, couleur: matiereForm.couleur, ordre: matieres.length,
    })
    setMatiereForm({ nom: '', code: '', couleur: '#2563EB' })
    setShowMatiereForm(false)
    await load()
  }

  async function saveEval(e: React.FormEvent) {
    e.preventDefault()
    if (!evalForm.titre.trim() || !evalForm.matiere_id || !evalForm.classe_id) return alert('Titre, matière et classe obligatoires')
    const s = createClient()
    const payload: any = {
      ecole_id: ecole.id,
      titre: evalForm.titre.trim(),
      type: evalForm.type,
      matiere_id: evalForm.matiere_id,
      classe_id: evalForm.classe_id,
      date_eval: evalForm.date_eval,
      bareme: evalForm.bareme,
      coefficient: evalForm.coefficient,
      trimestre: evalForm.trimestre,
    }
    if (editEval) await s.from('evaluations').update(payload).eq('id', editEval.id)
    else await s.from('evaluations').insert(payload)
    setShowEvalForm(false); setEditEval(null)
    setEvalForm({ titre: '', type: 'controle', matiere_id: '', classe_id: '', date_eval: new Date().toISOString().split('T')[0], bareme: 20, coefficient: 1, trimestre: 1 })
    await load()
  }

  async function openSaisieNotes(ev: Eval) {
    setOpenEval(ev)
    const s = createClient()
    const [{ data: enfs }, { data: notes }] = await Promise.all([
      s.from('enfants').select('id, prenom, nom').eq('ecole_id', ecole.id).eq('classe_id', ev.classe_id).order('nom'),
      s.from('notes').select('*').eq('evaluation_id', ev.id),
    ])
    setEleves(enfs || [])
    const noteMap: Record<string, { note: string; appreciation: string; absent: boolean }> = {}
    for (const e of enfs || []) {
      const n = (notes || []).find((x: any) => x.enfant_id === e.id)
      noteMap[e.id] = {
        note: n?.note !== null && n?.note !== undefined ? String(n.note) : '',
        appreciation: n?.appreciation || '',
        absent: n?.absent || false,
      }
    }
    setNotesEdit(noteMap)
  }

  async function saveNotes() {
    if (!openEval) return
    const s = createClient()
    const rows = Object.entries(notesEdit).map(([enfantId, v]) => ({
      evaluation_id: openEval.id,
      enfant_id: enfantId,
      note: v.absent ? null : (v.note ? parseFloat(v.note) : null),
      appreciation: v.appreciation || null,
      absent: v.absent,
      updated_at: new Date().toISOString(),
    }))
    // Upsert
    for (const r of rows) {
      const { data: existing } = await s.from('notes').select('id').eq('evaluation_id', openEval.id).eq('enfant_id', r.enfant_id).maybeSingle()
      if (existing) await s.from('notes').update(r).eq('id', existing.id)
      else await s.from('notes').insert(r)
    }
    setOpenEval(null)
    setEleves([])
    setNotesEdit({})
  }

  async function deleteEval(id: string) {
    if (!confirm('Supprimer cette évaluation et toutes ses notes ?')) return
    await createClient().from('evaluations').delete().eq('id', id)
    await load()
  }

  const evalsFiltered = evals.filter(e =>
    (!filterClasse || e.classe_id === filterClasse) &&
    (!filterTrim || e.trimestre === filterTrim)
  )

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📝 Notes & évaluations</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>Création des évaluations + saisie des notes par classe.</p>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4 }}>
        {(['evaluations','matieres'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1E293B' : '#64748B',
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t === 'evaluations' ? '📊 Évaluations' : '📚 Matières'}
          </button>
        ))}
      </div>

      {tab === 'matieres' && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Matières enseignées</h3>
            <button onClick={() => setShowMatiereForm(!showMatiereForm)}
              style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Matière</button>
          </div>
          {showMatiereForm && (
            <form onSubmit={saveMatiere} style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input value={matiereForm.nom} onChange={e => setMatiereForm({ ...matiereForm, nom: e.target.value })} placeholder="Nom matière (ex: Maths)" required style={{ ...inp, flex: 2, minWidth: 150 }} />
              <input value={matiereForm.code} onChange={e => setMatiereForm({ ...matiereForm, code: e.target.value })} placeholder="Code (ex: MATH)" style={{ ...inp, flex: 1, minWidth: 100 }} />
              <input type="color" value={matiereForm.couleur} onChange={e => setMatiereForm({ ...matiereForm, couleur: e.target.value })} style={{ width: 50, height: 38, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
              <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Ajouter</button>
            </form>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {matieres.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                Aucune matière. Créez-en pour commencer à saisir des notes.
              </div>
            ) : matieres.map(m => (
              <div key={m.id} style={{ background: m.couleur + '15', border: `1px solid ${m.couleur}40`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, color: m.couleur, fontSize: 14 }}>{m.nom}</div>
                {m.code && <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace', marginTop: 2 }}>{m.code}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'evaluations' && (
        <>
          {/* Filtres + bouton */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ minWidth: 160 }}>
              <label style={lbl}>Classe</label>
              <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)} style={inp}>
                <option value="">Toutes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 120 }}>
              <label style={lbl}>Trimestre</label>
              <select value={String(filterTrim)} onChange={e => setFilterTrim(e.target.value ? parseInt(e.target.value) : '')} style={inp}>
                <option value="">Tous</option>
                <option value="1">T1</option><option value="2">T2</option><option value="3">T3</option>
              </select>
            </div>
            <button onClick={() => { setShowEvalForm(true); setEditEval(null) }}
              style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              + Nouvelle évaluation
            </button>
          </div>

          {showEvalForm && (
            <form onSubmit={saveEval} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Titre *</label>
                <input style={inp} value={evalForm.titre} onChange={e => setEvalForm({ ...evalForm, titre: e.target.value })} placeholder="Ex: Contrôle Maths chap.2" required />
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select style={inp} value={evalForm.type} onChange={e => setEvalForm({ ...evalForm, type: e.target.value })}>
                  <option value="controle">Contrôle</option>
                  <option value="devoir">Devoir</option>
                  <option value="interrogation">Interrogation</option>
                  <option value="exercice">Exercice</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Matière *</label>
                <select style={inp} value={evalForm.matiere_id} onChange={e => setEvalForm({ ...evalForm, matiere_id: e.target.value })} required>
                  <option value="">—</option>
                  {matieres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Classe *</label>
                <select style={inp} value={evalForm.classe_id} onChange={e => setEvalForm({ ...evalForm, classe_id: e.target.value })} required>
                  <option value="">—</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input type="date" style={inp} value={evalForm.date_eval} onChange={e => setEvalForm({ ...evalForm, date_eval: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>Barème</label>
                <input type="number" min={1} max={100} style={inp} value={evalForm.bareme} onChange={e => setEvalForm({ ...evalForm, bareme: parseFloat(e.target.value) || 20 })} />
              </div>
              <div>
                <label style={lbl}>Coefficient</label>
                <input type="number" step="0.5" style={inp} value={evalForm.coefficient} onChange={e => setEvalForm({ ...evalForm, coefficient: parseFloat(e.target.value) || 1 })} />
              </div>
              <div>
                <label style={lbl}>Trimestre</label>
                <select style={inp} value={evalForm.trimestre} onChange={e => setEvalForm({ ...evalForm, trimestre: parseInt(e.target.value) })}>
                  <option value="1">T1</option><option value="2">T2</option><option value="3">T3</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{editEval ? 'Enregistrer' : 'Créer'}</button>
                <button type="button" onClick={() => { setShowEvalForm(false); setEditEval(null) }} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              </div>
            </form>
          )}

          {/* Liste évaluations */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            {evalsFiltered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                Aucune évaluation {filterClasse || filterTrim ? 'avec ces filtres' : ''}.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr>{['Titre','Type','Matière','Classe','Date','T','Barème','Coeff','Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {evalsFiltered.map(e => {
                    const mat = matieres.find(m => m.id === e.matiere_id)
                    const cl = classes.find(c => c.id === e.classe_id)
                    return (
                      <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>{e.titre}</td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748B' }}>{e.type}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {mat && <span style={{ background: mat.couleur + '20', color: mat.couleur, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{mat.nom}</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{cl?.nom || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{new Date(e.date_eval).toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>T{e.trimestre || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>/{e.bareme}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>×{e.coefficient}</td>
                        <td style={{ padding: '8px 12px', display: 'flex', gap: 4 }}>
                          <button onClick={() => openSaisieNotes(e)} style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>📝 Saisir notes</button>
                          <button onClick={() => deleteEval(e.id)} style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Modal saisie notes */}
      {openEval && (
        <div onClick={() => setOpenEval(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 700, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 18, borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>Saisie des notes — {openEval.titre}</h3>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Barème /{openEval.bareme} · Coef. {openEval.coefficient}</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0' }}>
              {eleves.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun élève dans cette classe.</div>
              ) : (
                eleves.map(el => (
                  <div key={el.id} style={{ padding: '10px 18px', borderBottom: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: '2fr 80px 60px 2fr', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{el.prenom} {el.nom}</div>
                    <input type="number" step="0.25" min={0} max={openEval.bareme} placeholder={`/${openEval.bareme}`}
                      value={notesEdit[el.id]?.note || ''}
                      disabled={notesEdit[el.id]?.absent}
                      onChange={e => setNotesEdit(p => ({ ...p, [el.id]: { ...(p[el.id] || { note: '', appreciation: '', absent: false }), note: e.target.value } }))}
                      style={{ ...inp, textAlign: 'center', fontWeight: 700, fontSize: 14 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748B' }}>
                      <input type="checkbox" checked={notesEdit[el.id]?.absent || false}
                        onChange={e => setNotesEdit(p => ({ ...p, [el.id]: { ...(p[el.id] || { note: '', appreciation: '', absent: false }), absent: e.target.checked } }))} />
                      Abs.
                    </label>
                    <input placeholder="Appréciation"
                      value={notesEdit[el.id]?.appreciation || ''}
                      onChange={e => setNotesEdit(p => ({ ...p, [el.id]: { ...(p[el.id] || { note: '', appreciation: '', absent: false }), appreciation: e.target.value } }))}
                      style={{ ...inp, fontSize: 12 }} />
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: 14, borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{eleves.length} élèves</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOpenEval(null)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
                <button onClick={saveNotes} style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>💾 Enregistrer notes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
