'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { logAction } from '@/lib/audit-log'
import {
  Exercice,
  statutLabel,
  statutColor,
  createExercice,
  cloneExerciceConfig,
  cloturerExercice,
} from '@/lib/exercice'

export default function ExercicesPage() {
  const router = useRouter()
  const ecole = useEcole()
  const supabase = createClient()
  const { exercice, exerciceSelectionne, exercices, changeExerciceCourant, reload } = useExercice()
  const [showNouveau, setShowNouveau] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Suggestion automatique du nouvel exercice (année suivante de l'exercice le + récent)
  const dernierEx = exercices[0]  // déjà trié DESC
  const suggestedCode = (() => {
    if (dernierEx) {
      const m = dernierEx.code.match(/^(\d{4})-(\d{4})$/)
      if (m) { const y2 = parseInt(m[2]); return `${y2}-${y2 + 1}` }
    }
    const d = new Date(); const y = d.getFullYear()
    return `${y}-${y + 1}`
  })()
  const [form, setForm] = useState({
    code: suggestedCode,
    libelle: '',
    date_debut: '',
    date_fin: '',
    clone_from: dernierEx?.id ?? '',
  })

  useEffect(() => {
    // Pré-remplir dates en fonction du code
    if (form.code && form.code.match(/^\d{4}-\d{4}$/)) {
      const [y1] = form.code.split('-')
      if (!form.date_debut) setForm(f => ({ ...f, date_debut: `${y1}-09-01` }))
      const y2 = parseInt(y1) + 1
      if (!form.date_fin) setForm(f => ({ ...f, date_fin: `${y2}-08-31` }))
    }
  }, [form.code, form.date_debut, form.date_fin])

  async function handleCreer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setInfo('')

    const { ok, exercice: newEx, error: err } = await createExercice(supabase, ecole.id, {
      code: form.code,
      libelle: form.libelle || `Année ${form.code}`,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      statut: 'preparation',
    })

    if (!ok || !newEx) {
      setError(err || 'Erreur de création')
      setSaving(false); return
    }

    let cloneMsg = ''
    if (form.clone_from) {
      const { cloned } = await cloneExerciceConfig(supabase, form.clone_from, newEx.id)
      const total = Object.values(cloned).reduce((s, n) => s + (n > 0 ? n : 0), 0)
      cloneMsg = ` · ${total} éléments clonés (tarifs, frais, configs)`
      // Chaînage : exercice source → nouvel exercice
      await supabase.from('exercices').update({ exercice_suivant_id: newEx.id }).eq('id', form.clone_from)
    }

    setInfo(`✓ Exercice ${newEx.code} créé${cloneMsg}`)
    setShowNouveau(false)
    setForm(f => ({ ...f, code: '', libelle: '', date_debut: '', date_fin: '' }))
    await reload()
    setSaving(false)
  }

  async function handleSetCourant(exId: string) {
    if (!confirm('Définir cet exercice comme exercice courant ? Toutes les nouvelles données seront rattachées à cet exercice par défaut.')) return
    await changeExerciceCourant(exId)
    setInfo('✓ Exercice courant mis à jour')
    await reload()
  }

  async function handleCloturer(ex: Exercice) {
    if (!confirm(`Clôturer l'exercice ${ex.code} ? Cette action verrouille l'exercice — les écritures et factures ne pourront plus être modifiées. À utiliser uniquement après contrôle complet.`)) return
    const res = await cloturerExercice(supabase, ex.id)
    if (res.ok) {
      await logAction(supabase, ecole.id, 'exercice_cloture', { exercice_id: ex.id, code: ex.code })
      setInfo(`✓ Exercice ${ex.code} clôturé`); await reload()
    } else setError(res.error || 'Erreur clôture')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button onClick={() => router.push(`/${ecole.slug}/parametres`)} style={{
            background: 'transparent', border: 'none', color: '#64748B', fontSize: 13,
            cursor: 'pointer', marginBottom: 6,
          }}>← Paramètres</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📅 Exercices</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            Une seule année pour piloter administration, facturation et comptabilité — pas de désynchro possible.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowNouveau(true)}>+ Préparer l'exercice suivant</button>
      </div>

      {info && (
        <div style={{ background: '#ECFDF5', color: '#059669', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
          {info}
        </div>
      )}
      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['Code', 'Libellé', 'Période', 'Statut', 'Exercice courant', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exercices.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Aucun exercice configuré</td></tr>
            ) : exercices.map(ex => {
              const c = statutColor(ex.statut)
              const isCourant = exercice?.id === ex.id
              const peutCloturer = ex.statut === 'ouvert' && !isCourant  // évite de clore l'exercice courant par mégarde
              return (
                <tr key={ex.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1E293B' }}>📅 {ex.code}</td>
                  <td style={{ padding: '14px 16px', color: '#475569', fontSize: 13 }}>{ex.libelle || '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#64748B', fontSize: 12 }}>
                    Du {new Date(ex.date_debut).toLocaleDateString('fr-FR')} au {new Date(ex.date_fin).toLocaleDateString('fr-FR')}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10 }}>
                      {statutLabel(ex.statut)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {isCourant ? (
                      <span style={{ background: '#ECFDF5', color: '#059669', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10 }}>
                        ✓ En cours
                      </span>
                    ) : (
                      <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => handleSetCourant(ex.id)}>
                        Définir comme courant
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {peutCloturer && (
                      <button onClick={() => handleCloturer(ex)} className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }}>
                        🔒 Clôturer
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#1E40AF' }}>
        💡 <strong>Bonnes pratiques</strong> : prépare ton exercice N+1 en mai/juin (clone des tarifs, frais, configs). Garde l'exercice N comme courant jusqu'à la rentrée. Bascule sur N+1 le 1er septembre. Clôture N uniquement après contrôle complet (compta + facturation soldée).
      </div>

      {/* Modal nouvel exercice */}
      {showNouveau && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>📅 Préparer un nouvel exercice</h2>
              <button onClick={() => setShowNouveau(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>

            <form onSubmit={handleCreer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Code de l'exercice *</label>
                  <input required style={inp} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="2026-2027" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Libellé</label>
                  <input style={inp} value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} placeholder={`Année ${form.code}`} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Date début *</label>
                  <input required type="date" style={inp} value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Date fin *</label>
                  <input required type="date" style={inp} value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>
                  Cloner la configuration de
                  <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: 6 }}>(tarifs, frais, réductions, configs)</span>
                </label>
                <select style={inp} value={form.clone_from} onChange={e => setForm(f => ({ ...f, clone_from: e.target.value }))}>
                  <option value="">— Ne rien cloner —</option>
                  {exercices.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.code} — {statutLabel(ex.statut)}</option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
                  ℹ️ Cloner duplique les tarifs, frais d'inscription, paramètres de réductions, etc. Les données opérationnelles (enfants, factures, contrats) ne sont pas dupliquées.
                </p>
              </div>
              {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setShowNouveau(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Création…' : '✓ Créer l\'exercice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  color: '#1E293B',
  fontSize: 13,
  outline: 'none',
}
