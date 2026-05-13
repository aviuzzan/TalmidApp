'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Casier = {
  id: string; numero: string; etage: string | null; zone: string | null;
  code_cadenas: string | null; caution_montant: number; caution_recue: boolean;
  attribue_a: string | null; attribue_le: string | null; rendu_le: string | null;
  statut: 'libre' | 'attribue' | 'hors_service'; notes: string | null;
  enfants?: { prenom: string; nom: string } | null
}
type Enfant = { id: string; prenom: string; nom: string }

export default function CasiersPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [casiers, setCasiers] = useState<Casier[]>([])
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [filterStatut, setFilterStatut] = useState<'tous' | 'libre' | 'attribue' | 'hors_service'>('tous')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const empty = {
    numero: '', etage: '', zone: '', code_cadenas: '', caution_montant: 0,
    caution_recue: false, attribue_a: '', statut: 'libre' as const, notes: '',
  }
  const [form, setForm] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: c }, { data: e }] = await Promise.all([
      s.from('casiers').select('*, enfants(prenom, nom)').eq('ecole_id', ecole.id).order('numero'),
      s.from('enfants').select('id, prenom, nom').eq('ecole_id', ecole.id).is('date_sortie', null).order('nom'),
    ])
    setCasiers((c ?? []) as Casier[])
    setEnfants((e ?? []) as Enfant[])
    setLoading(false)
  }, [ecole?.id])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    const s = createClient()
    const payload: any = {
      ecole_id: ecole.id,
      numero: form.numero, etage: form.etage || null, zone: form.zone || null,
      code_cadenas: form.code_cadenas || null,
      caution_montant: Number(form.caution_montant || 0),
      caution_recue: form.caution_recue,
      attribue_a: form.attribue_a || null,
      attribue_le: form.attribue_a ? new Date().toISOString().slice(0, 10) : null,
      statut: form.attribue_a ? 'attribue' : (form.statut || 'libre'),
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = editId
      ? await s.from('casiers').update(payload).eq('id', editId)
      : await s.from('casiers').insert(payload)
    setSaving(false)
    if (error) { setMsg('Erreur : ' + error.message); return }
    setShowForm(false); setForm(empty); setEditId(null)
    await load()
  }

  function editer(c: Casier) {
    setEditId(c.id)
    setForm({
      numero: c.numero, etage: c.etage || '', zone: c.zone || '',
      code_cadenas: c.code_cadenas || '', caution_montant: Number(c.caution_montant),
      caution_recue: c.caution_recue, attribue_a: c.attribue_a || '',
      statut: c.statut, notes: c.notes || '',
    })
    setShowForm(true)
  }

  async function rendre(c: Casier) {
    if (!confirm(`Marquer le casier ${c.numero} comme rendu ?`)) return
    await createClient().from('casiers').update({
      attribue_a: null, rendu_le: new Date().toISOString().slice(0, 10),
      statut: 'libre', updated_at: new Date().toISOString(),
    }).eq('id', c.id)
    await load()
  }

  async function supprimer(c: Casier) {
    if (!confirm(`Supprimer le casier ${c.numero} ?`)) return
    await createClient().from('casiers').delete().eq('id', c.id)
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const filtres = filterStatut === 'tous' ? casiers : casiers.filter(c => c.statut === filterStatut)
  const stats = {
    libres: casiers.filter(c => c.statut === 'libre').length,
    attribues: casiers.filter(c => c.statut === 'attribue').length,
    hs: casiers.filter(c => c.statut === 'hors_service').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🔐 Casiers</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Attribution et suivi des casiers élèves</p>
        </div>
        <button onClick={() => { setEditId(null); setForm(empty); setShowForm(true) }} className="btn-primary">+ Nouveau casier</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <button onClick={() => setFilterStatut('libre')} style={{ background: filterStatut === 'libre' ? '#ECFDF5' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#065F46' }}>{stats.libres}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Libres</div>
        </button>
        <button onClick={() => setFilterStatut('attribue')} style={{ background: filterStatut === 'attribue' ? '#EFF6FF' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{stats.attribues}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Attribués</div>
        </button>
        <button onClick={() => setFilterStatut('hors_service')} style={{ background: filterStatut === 'hors_service' ? '#FEF2F2' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#991B1B' }}>{stats.hs}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Hors service</div>
        </button>
        <button onClick={() => setFilterStatut('tous')} style={{ background: filterStatut === 'tous' ? '#F1F5F9' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1E293B' }}>{casiers.length}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Total</div>
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['N°', 'Étage / Zone', 'Statut', 'Élève', 'Caution', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94A3B8' }}>Aucun casier</td></tr>
            ) : filtres.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: i < filtres.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700 }}>{c.numero}</td>
                <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{[c.etage, c.zone].filter(Boolean).join(' / ') || '—'}</td>
                <td style={{ padding: '11px 14px' }}>
                  {c.statut === 'libre' && <span style={{ background: '#ECFDF5', color: '#065F46', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Libre</span>}
                  {c.statut === 'attribue' && <span style={{ background: '#EFF6FF', color: '#1E40AF', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Attribué</span>}
                  {c.statut === 'hors_service' && <span style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>HS</span>}
                </td>
                <td style={{ padding: '11px 14px', fontWeight: 600 }}>{c.enfants ? `${c.enfants.prenom} ${c.enfants.nom}` : '—'}</td>
                <td style={{ padding: '11px 14px' }}>
                  {Number(c.caution_montant) > 0 ? (
                    <span style={{ color: c.caution_recue ? '#059669' : '#DC2626', fontWeight: 600 }}>
                      {Number(c.caution_montant).toFixed(2)}€ {c.caution_recue ? '✓' : '⚠'}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ padding: '11px 14px', display: 'flex', gap: 6 }}>
                  <button onClick={() => editer(c)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>✎</button>
                  {c.statut === 'attribue' && <button onClick={() => rendre(c)} style={{ background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Rendre</button>}
                  <button onClick={() => supprimer(c)} style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div onClick={() => !saving && setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 16 }}>{editId ? '✎ Modifier casier' : '+ Nouveau casier'}</h2>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Numéro *</label><input required value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} style={inp} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Code cadenas</label><input value={form.code_cadenas} onChange={e => setForm({ ...form, code_cadenas: e.target.value })} style={inp} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Étage</label><input value={form.etage} onChange={e => setForm({ ...form, etage: e.target.value })} style={inp} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Zone</label><input value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} style={inp} /></div>
              </div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Attribuer à un élève</label><select value={form.attribue_a} onChange={e => setForm({ ...form, attribue_a: e.target.value })} style={inp}><option value="">— Aucun (libre) —</option>{enfants.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}</select></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Caution €</label><input type="number" step="0.01" value={form.caution_montant} onChange={e => setForm({ ...form, caution_montant: e.target.value })} style={inp} /></div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}><label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={form.caution_recue} onChange={e => setForm({ ...form, caution_recue: e.target.checked })} /> Caution reçue</label></div>
              </div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, minHeight: 60 }} /></div>
              {msg && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13 }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
