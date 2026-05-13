'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Pret = {
  id: string; type: string; nom_objet: string; reference: string | null;
  prete_a: string | null; date_pret: string; date_retour_prevue: string | null;
  date_retour_effective: string | null; etat_initial: string | null; etat_retour: string | null;
  caution_montant: number; statut: 'en_pret' | 'rendu' | 'perdu' | 'endommage'; notes: string | null;
  enfants?: { prenom: string; nom: string } | null
}
type Enfant = { id: string; prenom: string; nom: string }

const TYPES = [
  { v: 'manuel', l: '📚 Manuel scolaire' },
  { v: 'livre', l: '📖 Livre' },
  { v: 'instrument', l: '🎻 Instrument' },
  { v: 'materiel', l: '🔧 Matériel' },
  { v: 'tablette', l: '📱 Tablette / Ordinateur' },
  { v: 'autre', l: '📦 Autre' },
]

export default function PretsPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [prets, setPrets] = useState<Pret[]>([])
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [filter, setFilter] = useState<'tous' | 'en_pret' | 'rendu' | 'perdu' | 'endommage'>('en_pret')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const empty = {
    type: 'manuel', nom_objet: '', reference: '',
    prete_a: '', date_pret: new Date().toISOString().slice(0, 10),
    date_retour_prevue: '', etat_initial: 'bon', caution_montant: 0, notes: '',
  }
  const [form, setForm] = useState<any>(empty)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: p }, { data: e }] = await Promise.all([
      s.from('prets_manuels').select('*, enfants(prenom, nom)').eq('ecole_id', ecole.id).order('created_at', { ascending: false }),
      s.from('enfants').select('id, prenom, nom').eq('ecole_id', ecole.id).is('date_sortie', null).order('nom'),
    ])
    setPrets((p ?? []) as Pret[])
    setEnfants((e ?? []) as Enfant[])
    setLoading(false)
  }, [ecole?.id])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const s = createClient()
    const payload: any = {
      ecole_id: ecole.id,
      type: form.type, nom_objet: form.nom_objet, reference: form.reference || null,
      prete_a: form.prete_a || null,
      date_pret: form.date_pret,
      date_retour_prevue: form.date_retour_prevue || null,
      etat_initial: form.etat_initial || null,
      caution_montant: Number(form.caution_montant || 0),
      notes: form.notes || null,
      statut: 'en_pret',
      updated_at: new Date().toISOString(),
    }
    const { error } = editId
      ? await s.from('prets_manuels').update(payload).eq('id', editId)
      : await s.from('prets_manuels').insert(payload)
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setShowForm(false); setForm(empty); setEditId(null)
    await load()
  }

  async function marquerRendu(p: Pret) {
    const etat = prompt('État au retour ? (bon / moyen / abimé)', 'bon')
    if (etat === null) return
    const statut = etat.toLowerCase().includes('abim') || etat.toLowerCase().includes('endomma') ? 'endommage' : 'rendu'
    await createClient().from('prets_manuels').update({
      date_retour_effective: new Date().toISOString().slice(0, 10),
      etat_retour: etat, statut, updated_at: new Date().toISOString(),
    }).eq('id', p.id)
    await load()
  }

  async function marquerPerdu(p: Pret) {
    if (!confirm(`Marquer "${p.nom_objet}" comme perdu ?`)) return
    await createClient().from('prets_manuels').update({ statut: 'perdu', updated_at: new Date().toISOString() }).eq('id', p.id)
    await load()
  }

  async function supprimer(p: Pret) {
    if (!confirm(`Supprimer le prêt "${p.nom_objet}" ?`)) return
    await createClient().from('prets_manuels').delete().eq('id', p.id)
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const filtres = filter === 'tous' ? prets : prets.filter(p => p.statut === filter)
  const stats = {
    en_pret: prets.filter(p => p.statut === 'en_pret').length,
    rendu: prets.filter(p => p.statut === 'rendu').length,
    perdu: prets.filter(p => p.statut === 'perdu').length,
    endommage: prets.filter(p => p.statut === 'endommage').length,
  }

  function isRetard(p: Pret): boolean {
    if (p.statut !== 'en_pret' || !p.date_retour_prevue) return false
    return new Date(p.date_retour_prevue) < new Date()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📚 Prêts de matériel</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Manuels, livres, instruments, tablettes...</p>
        </div>
        <button onClick={() => { setEditId(null); setForm(empty); setShowForm(true) }} className="btn-primary">+ Nouveau prêt</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { k: 'en_pret', l: 'En prêt', n: stats.en_pret, bg: '#EFF6FF', fg: '#1E40AF' },
          { k: 'rendu', l: 'Rendus', n: stats.rendu, bg: '#ECFDF5', fg: '#065F46' },
          { k: 'endommage', l: 'Endommagés', n: stats.endommage, bg: '#FFFBEB', fg: '#92400E' },
          { k: 'perdu', l: 'Perdus', n: stats.perdu, bg: '#FEF2F2', fg: '#991B1B' },
          { k: 'tous', l: 'Tous', n: prets.length, bg: '#F1F5F9', fg: '#1E293B' },
        ].map(s => (
          <button key={s.k} onClick={() => setFilter(s.k as any)} style={{ background: filter === s.k ? s.bg : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.fg }}>{s.n}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{s.l}</div>
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Type', 'Objet', 'Élève', 'Prêté le', 'Retour prévu', 'Statut', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#94A3B8' }}>Aucun prêt</td></tr>
            ) : filtres.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: i < filtres.length - 1 ? '1px solid #F1F5F9' : 'none', background: isRetard(p) ? '#FEF2F2' : 'transparent' }}>
                <td style={{ padding: '11px 14px' }}>{TYPES.find(t => t.v === p.type)?.l || p.type}</td>
                <td style={{ padding: '11px 14px', fontWeight: 600 }}>{p.nom_objet}{p.reference && <span style={{ fontSize: 11, color: '#94A3B8', display: 'block' }}>{p.reference}</span>}</td>
                <td style={{ padding: '11px 14px' }}>{p.enfants ? `${p.enfants.prenom} ${p.enfants.nom}` : '—'}</td>
                <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{new Date(p.date_pret).toLocaleDateString('fr-FR')}</td>
                <td style={{ padding: '11px 14px', color: isRetard(p) ? '#DC2626' : '#64748B', fontSize: 12, fontWeight: isRetard(p) ? 700 : 400 }}>
                  {p.date_retour_prevue ? new Date(p.date_retour_prevue).toLocaleDateString('fr-FR') : '—'}
                  {isRetard(p) && ' ⚠'}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  {p.statut === 'en_pret' && <span style={{ background: '#EFF6FF', color: '#1E40AF', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>En prêt</span>}
                  {p.statut === 'rendu' && <span style={{ background: '#ECFDF5', color: '#065F46', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>✓ Rendu</span>}
                  {p.statut === 'endommage' && <span style={{ background: '#FFFBEB', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Endommagé</span>}
                  {p.statut === 'perdu' && <span style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Perdu</span>}
                </td>
                <td style={{ padding: '11px 14px', display: 'flex', gap: 6 }}>
                  {p.statut === 'en_pret' && <>
                    <button onClick={() => marquerRendu(p)} style={{ background: '#ECFDF5', color: '#065F46', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↩ Rendre</button>
                    <button onClick={() => marquerPerdu(p)} style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Perdu</button>
                  </>}
                  <button onClick={() => supprimer(p)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div onClick={() => !saving && setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 16 }}>+ Nouveau prêt</h2>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Type *</label><select required value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inp}>{TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Nom de l&apos;objet *</label><input required value={form.nom_objet} onChange={e => setForm({ ...form, nom_objet: e.target.value })} placeholder="ex: Manuel maths 6e" style={inp} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Référence / Code-barre</label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} style={inp} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Prêté à *</label><select required value={form.prete_a} onChange={e => setForm({ ...form, prete_a: e.target.value })} style={inp}><option value="">— Choisir un élève —</option>{enfants.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}</select></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Date prêt</label><input type="date" value={form.date_pret} onChange={e => setForm({ ...form, date_pret: e.target.value })} style={inp} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Retour prévu</label><input type="date" value={form.date_retour_prevue} onChange={e => setForm({ ...form, date_retour_prevue: e.target.value })} style={inp} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>État au prêt</label><input value={form.etat_initial} onChange={e => setForm({ ...form, etat_initial: e.target.value })} placeholder="bon, moyen..." style={inp} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Caution €</label><input type="number" step="0.01" value={form.caution_montant} onChange={e => setForm({ ...form, caution_montant: e.target.value })} style={inp} /></div>
              </div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, minHeight: 60 }} /></div>
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
