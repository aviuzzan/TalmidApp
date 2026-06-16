'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ConfigReductionTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [docs, setDocs] = useState<any[]>([])
  const [questions, setQuestions] = useState<any[]>([])
  const [newDoc, setNewDoc] = useState({ label: '', obligatoire: true })
  const [newQ, setNewQ] = useState({ section: 'revenus', label: '', type: 'number', obligatoire: true, cle: '', optionsText: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [ecoleId, annee])

  async function load() {
    const s = createClient()
    const [{ data: d }, { data: q }] = await Promise.all([
      s.from('reduction_documents_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre'),
      s.from('reduction_questions_config').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('section').order('ordre'),
    ])
    setDocs(d ?? []); setQuestions(q ?? [])
  }

  async function ajouterDoc() {
    if (!newDoc.label.trim()) return
    setSaving(true)
    await createClient().from('reduction_documents_config').insert({ ecole_id: ecoleId, annee_scolaire: annee, ...newDoc, ordre: docs.length })
    setNewDoc({ label: '', obligatoire: true }); await load(); setSaving(false)
  }

  async function toggleDoc(id: string, actif: boolean) {
    await createClient().from('reduction_documents_config').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimerDoc(id: string) {
    await createClient().from('reduction_documents_config').delete().eq('id', id); await load()
  }

  async function ajouterQuestion() {
    if (!newQ.label.trim()) return
    // Validation : si liste / case à cocher, exiger au moins 2 options
    if ((newQ.type === 'select' || newQ.type === 'checkbox') && parseOptions(newQ.optionsText).length < 2) {
      alert('Pour une liste ou des cases à cocher, ajoutez au moins 2 options (une par ligne).')
      return
    }
    setSaving(true)
    const cle = newQ.cle || newQ.label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)
    const { optionsText, ...rest } = newQ
    const options = (newQ.type === 'select' || newQ.type === 'checkbox') ? parseOptions(optionsText) : null
    await createClient().from('reduction_questions_config').insert({
      ecole_id: ecoleId, annee_scolaire: annee, ...rest, cle, options, ordre: questions.length,
    })
    setNewQ({ section: 'revenus', label: '', type: 'number', obligatoire: true, cle: '', optionsText: '' })
    await load(); setSaving(false)
  }

  function parseOptions(text: string): string[] {
    return text.split('\n').map(s => s.trim()).filter(Boolean)
  }

  async function editerOptions(q: any) {
    const current = Array.isArray(q.options) ? q.options.join('\n') : ''
    const v = prompt('Options (une par ligne) :', current)
    if (v === null) return
    const opts = parseOptions(v)
    if (opts.length < 2) {
      alert('Au moins 2 options sont nécessaires.')
      return
    }
    await createClient().from('reduction_questions_config').update({ options: opts }).eq('id', q.id)
    await load()
  }

  async function toggleQuestion(id: string, actif: boolean) {
    await createClient().from('reduction_questions_config').update({ actif: !actif }).eq('id', id); await load()
  }

  async function renommerQuestion(id: string, label: string) {
    const v = prompt('Nouveau libellé de la question :', label)
    if (v === null || !v.trim()) return
    await createClient().from('reduction_questions_config').update({ label: v.trim() }).eq('id', id); await load()
  }

  async function deplacerQuestion(q: any, dir: -1 | 1) {
    const sameSec = questions.filter((x: any) => x.section === q.section).slice().sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
    const idx = sameSec.findIndex((x: any) => x.id === q.id)
    const swap = sameSec[idx + dir]
    if (!swap) return
    const s = createClient()
    await s.from('reduction_questions_config').update({ ordre: swap.ordre }).eq('id', q.id)
    await s.from('reduction_questions_config').update({ ordre: q.ordre }).eq('id', swap.id)
    await load()
  }

  async function supprimerQuestion(id: string) {
    if (!confirm('Supprimer définitivement cette question ?')) return
    await createClient().from('reduction_questions_config').delete().eq('id', id); await load()
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }
  const SECTIONS = ['logement', 'revenus', 'allocations', 'autres']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Documents */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Pièces justificatives requises</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input style={{ ...inp, flex: 1 }} value={newDoc.label} onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))}
            placeholder="Ex: Avis d'imposition 2025" onKeyDown={e => e.key === 'Enter' && ajouterDoc()} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={newDoc.obligatoire} onChange={e => setNewDoc(p => ({ ...p, obligatoire: e.target.checked }))} />
            Obligatoire
          </label>
          <button onClick={ajouterDoc} disabled={saving}
            style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', opacity: d.actif ? 1 : 0.5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: '#1E293B' }}>{d.label}</span>
              {d.obligatoire && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>OBLIGATOIRE</span>}
              <button onClick={() => toggleDoc(d.id, d.actif)} style={{ fontSize: 11, color: d.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                {d.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => supprimerDoc(d.id)} style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Questions */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Questions du formulaire</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto auto', gap: 8, marginBottom: 14, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>SECTION</div>
            <select style={{ ...inp, width: '100%' }} value={newQ.section} onChange={e => setNewQ(p => ({ ...p, section: e.target.value }))}>
              {SECTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>LIBELLÉ</div>
            <input style={{ ...inp, width: '100%' }} value={newQ.label} onChange={e => setNewQ(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Quotient familial CAF" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>TYPE</div>
            <select style={{ ...inp, width: '100%' }} value={newQ.type} onChange={e => setNewQ(p => ({ ...p, type: e.target.value }))}>
              <option value="number">Nombre</option>
              <option value="text">Texte</option>
              <option value="textarea">Paragraphe</option>
              <option value="select">Liste</option>
              <option value="date">Date</option>
              <option value="checkbox">Case à cocher</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={newQ.obligatoire} onChange={e => setNewQ(p => ({ ...p, obligatoire: e.target.checked }))} />
            Obligatoire
          </label>
          <button onClick={ajouterQuestion} disabled={saving}
            style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>

        {(newQ.type === 'select' || newQ.type === 'checkbox') && (
          <div style={{ marginBottom: 14, padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#92400E', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Options ({newQ.type === 'select' ? 'liste déroulante' : 'cases à cocher'})
            </div>
            <textarea
              value={newQ.optionsText}
              onChange={e => setNewQ(p => ({ ...p, optionsText: e.target.value }))}
              placeholder={'Une option par ligne, ex :\nOui\nNon\nNe se prononce pas'}
              rows={4}
              style={{ ...inp, width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ fontSize: 10, color: '#92400E', marginTop: 4 }}>Une option par ligne. Minimum 2.</div>
          </div>
        )}

        {SECTIONS.map(section => {
          const qs = questions.filter(q => q.section === section)
          if (qs.length === 0) return null
          return (
            <div key={section} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{section}</div>
              {qs.map(q => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', marginBottom: 6, opacity: q.actif ? 1 : 0.5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: q.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, color: '#1E293B' }}>{q.label}</span>
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <span style={{ fontSize: 10, color: '#64748B', fontStyle: 'italic' }}>
                        {q.options.length} option{q.options.length > 1 ? 's' : ''} : {q.options.slice(0, 3).join(', ')}{q.options.length > 3 ? '…' : ''}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{q.type}</span>
                  {q.obligatoire && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>OBLIGATOIRE</span>}
                  <button onClick={() => deplacerQuestion(q, -1)} title="Monter" style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 7px', cursor: 'pointer' }}>↑</button>
                  <button onClick={() => deplacerQuestion(q, 1)} title="Descendre" style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 7px', cursor: 'pointer' }}>↓</button>
                  <button onClick={() => renommerQuestion(q.id, q.label)} title="Renommer" style={{ fontSize: 11, color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>✏</button>
                  {(q.type === 'select' || q.type === 'checkbox') && (
                    <button onClick={() => editerOptions(q)} title="Éditer les options" style={{ fontSize: 11, color: '#7C3AED', background: 'none', border: '1px solid #E9D5FF', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                      Options
                    </button>
                  )}
                  <button onClick={() => toggleQuestion(q.id, q.actif)} style={{ fontSize: 11, color: q.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                    {q.actif ? 'Masquer' : 'Afficher'}
                  </button>
                  <button onClick={() => supprimerQuestion(q.id)} title="Supprimer" style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
