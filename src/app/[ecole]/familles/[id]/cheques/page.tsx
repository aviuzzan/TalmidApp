'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Cheque = {
  id: string
  numero_cheque: string
  montant: number
  date_echeance: string | null
  statut: 'prevu' | 'encaisse' | 'rejete' | 'restitue' | 'annule'
  encaisse_le: string | null
  note: string | null
  facture_id: string | null
  mode_paiement: string | null
  created_at: string
}

const STATUTS: { value: Cheque['statut']; label: string; bg: string; fg: string }[] = [
  { value: 'prevu', label: 'Prévu', bg: '#F1F5F9', fg: '#475569' },
  { value: 'encaisse', label: 'Encaissé', bg: '#ECFDF5', fg: '#065F46' },
  { value: 'rejete', label: 'Rejeté', bg: '#FEF2F2', fg: '#991B1B' },
  { value: 'restitue', label: 'Restitué', bg: '#EFF6FF', fg: '#1E40AF' },
  { value: 'annule', label: 'Annulé', bg: '#F8FAFC', fg: '#94A3B8' },
]

export default function ChequesFamillePage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const familleId = params.id as string

  const [loading, setLoading] = useState(true)
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [familleNom, setFamilleNom] = useState('')
  const [factures, setFactures] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    numero_cheque: '', montant: '', date_echeance: '',
    statut: 'prevu' as Cheque['statut'], encaisse_le: '', note: '',
    facture_id: '', mode_paiement: 'cheque',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const s = createClient()
    const [{ data: f }, { data: chk }, { data: fact }] = await Promise.all([
      s.from('familles').select('nom').eq('id', familleId).single(),
      s.from('cheques_prevus').select('*').eq('famille_id', familleId).order('date_echeance', { ascending: true }),
      s.from('factures').select('id, numero, annee_scolaire').eq('famille_id', familleId).order('date_emission', { ascending: false }),
    ])
    if (f) setFamilleNom(f.nom || '')
    setCheques(chk || [])
    setFactures(fact || [])
    setLoading(false)
  }, [familleId])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setForm({ numero_cheque: '', montant: '', date_echeance: '', statut: 'prevu', encaisse_le: '', note: '', facture_id: '', mode_paiement: 'cheque' })
    setEditId(null)
    setShowForm(false)
  }

  function openEdit(c: Cheque) {
    setForm({
      numero_cheque: c.numero_cheque || '',
      montant: String(c.montant || ''),
      date_echeance: c.date_echeance || '',
      statut: c.statut || 'prevu',
      encaisse_le: c.encaisse_le || '',
      note: c.note || '',
      facture_id: c.facture_id || '',
      mode_paiement: c.mode_paiement || 'cheque',
    })
    setEditId(c.id)
    setShowForm(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.numero_cheque.trim() || !form.montant) return alert('N° chèque et montant obligatoires')
    const s = createClient()
    const payload: any = {
      famille_id: familleId,
      ecole_id: ecole.id,
      numero_cheque: form.numero_cheque.trim(),
      montant: parseFloat(form.montant),
      date_echeance: form.date_echeance || null,
      statut: form.statut,
      encaisse_le: form.encaisse_le || null,
      note: form.note || null,
      facture_id: form.facture_id || null,
      mode_paiement: form.mode_paiement,
    }
    if (editId) {
      const { error } = await s.from('cheques_prevus').update(payload).eq('id', editId)
      if (error) return alert('Erreur : ' + error.message)
    } else {
      const { error } = await s.from('cheques_prevus').insert(payload)
      if (error) return alert('Erreur : ' + error.message)
    }
    resetForm()
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce chèque ?')) return
    await createClient().from('cheques_prevus').delete().eq('id', id)
    await load()
  }

  async function quickUpdateStatut(id: string, statut: Cheque['statut']) {
    const patch: any = { statut }
    if (statut === 'encaisse') patch.encaisse_le = new Date().toISOString().split('T')[0]
    await createClient().from('cheques_prevus').update(patch).eq('id', id)
    await load()
  }

  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €'
  const total_par_statut = STATUTS.map(s => ({
    ...s,
    count: cheques.filter(c => c.statut === s.value).length,
    montant: cheques.filter(c => c.statut === s.value).reduce((sum, c) => sum + Number(c.montant), 0),
  }))

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.push(`/${ecole.slug}/familles/${familleId}`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour fiche famille</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Chèques & cautions</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '2px 0 0' }}>Famille {familleNom}</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null) }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Ajouter un chèque
        </button>
      </div>

      {/* KPI par statut */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {total_par_statut.map(s => (
          <div key={s.value} style={{ background: s.bg, border: `1px solid ${s.bg}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.fg, marginTop: 4 }}>{s.count}</div>
            <div style={{ fontSize: 11, color: s.fg, opacity: 0.8, marginTop: 2 }}>{fmt(s.montant)}</div>
          </div>
        ))}
      </div>

      {/* Formulaire */}
      {showForm && (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>{editId ? 'Modifier le chèque' : 'Nouveau chèque'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>N° chèque *</label>
              <input style={inp} value={form.numero_cheque} onChange={e => setForm({ ...form, numero_cheque: e.target.value })} placeholder="Ex: 1234567" required />
            </div>
            <div>
              <label style={lbl}>Montant *</label>
              <input type="number" step="0.01" style={inp} value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} placeholder="500.00" required />
            </div>
            <div>
              <label style={lbl}>Date d&apos;échéance</label>
              <input type="date" style={inp} value={form.date_echeance} onChange={e => setForm({ ...form, date_echeance: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Statut</label>
              <select style={inp} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as Cheque['statut'] })}>
                {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Encaissé le</label>
              <input type="date" style={inp} value={form.encaisse_le} onChange={e => setForm({ ...form, encaisse_le: e.target.value })} disabled={form.statut !== 'encaisse'} />
            </div>
            <div>
              <label style={lbl}>Facture liée (optionnel)</label>
              <select style={inp} value={form.facture_id} onChange={e => setForm({ ...form, facture_id: e.target.value })}>
                <option value="">— Aucune —</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Mode</label>
              <select style={inp} value={form.mode_paiement} onChange={e => setForm({ ...form, mode_paiement: e.target.value })}>
                <option value="cheque">Chèque</option>
                <option value="cheque_caution">Chèque de caution</option>
                <option value="virement">Virement</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Note (optionnel)</label>
              <textarea style={{ ...inp, minHeight: 50 }} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Caution restitution juin 2027, etc." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {editId ? 'Enregistrer' : 'Ajouter'}
            </button>
            <button type="button" onClick={resetForm} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Liste */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {cheques.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucun chèque enregistré pour cette famille.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                {['N° chèque', 'Montant', 'Échéance', 'Statut', 'Encaissé le', 'Facture', 'Note', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cheques.map(c => {
                const sc = STATUTS.find(s => s.value === c.statut) || STATUTS[0]
                const fact = factures.find(f => f.id === c.facture_id)
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{c.numero_cheque}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>{fmt(c.montant)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.fg, background: sc.bg, padding: '3px 10px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{c.encaisse_le ? new Date(c.encaisse_le).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>{fact?.numero || '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#64748B', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.note || ''}>{c.note || '—'}</td>
                    <td style={{ padding: '8px 14px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.statut === 'prevu' && (
                        <button onClick={() => quickUpdateStatut(c.id, 'encaisse')}
                          title="Marquer encaissé"
                          style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✓ Encaisser</button>
                      )}
                      {c.statut === 'prevu' && (
                        <button onClick={() => quickUpdateStatut(c.id, 'restitue')}
                          title="Restituer (caution)"
                          style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>↩ Restituer</button>
                      )}
                      <button onClick={() => openEdit(c)} title="Modifier"
                        style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>✏</button>
                      <button onClick={() => remove(c.id)} title="Supprimer"
                        style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
