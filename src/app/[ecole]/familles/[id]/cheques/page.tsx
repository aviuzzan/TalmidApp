'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Statut = 'attente_reception' | 'prevu' | 'encaisse' | 'rejete' | 'restitue' | 'annule'

type Cheque = {
  id: string
  numero_cheque: string
  montant: number
  date_echeance: string | null
  statut: Statut
  encaisse_le: string | null
  note: string | null
  facture_id: string | null
  mode_paiement: string | null
  created_at: string
}

const STATUTS: { value: Statut; label: string; bg: string; fg: string }[] = [
  { value: 'attente_reception', label: 'A recevoir', bg: '#FFFBEB', fg: '#92400E' },
  { value: 'prevu', label: 'Prevu', bg: '#F1F5F9', fg: '#475569' },
  { value: 'encaisse', label: 'Encaisse', bg: '#ECFDF5', fg: '#065F46' },
  { value: 'rejete', label: 'Rejete', bg: '#FEF2F2', fg: '#991B1B' },
  { value: 'restitue', label: 'Restitue', bg: '#EFF6FF', fg: '#1E40AF' },
  { value: 'annule', label: 'Annule', bg: '#F8FAFC', fg: '#94A3B8' },
]

const MODES = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'cheque_caution', label: 'Cheque de caution' },
  { value: 'prelevement', label: 'Prelevement' },
  { value: 'virement', label: 'Virement' },
  { value: 'autre', label: 'Autre' },
]

const TODAY = new Date().toISOString().split('T')[0]

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
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    numero_cheque: '', montant: '', date_echeance: '',
    statut: 'prevu' as Statut, encaisse_le: '', note: '',
    facture_id: '', mode_paiement: 'cheque',
  })

  const [showGen, setShowGen] = useState(false)
  const [gen, setGen] = useState({
    montant_total: '', nb_echeances: '10', date_premiere: '',
    mode_paiement: 'cheque', facture_id: '', statut: 'attente_reception' as Statut,
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
    setShowGen(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.numero_cheque.trim() || !form.montant) return alert('Nchq et montant obligatoires')
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
    if (!confirm('Supprimer cette echeance ?')) return
    await createClient().from('cheques_prevus').delete().eq('id', id)
    await load()
  }

  async function quickUpdateStatut(id: string, statut: Statut) {
    const patch: any = { statut }
    if (statut === 'encaisse') patch.encaisse_le = new Date().toISOString().split('T')[0]
    await createClient().from('cheques_prevus').update(patch).eq('id', id)
    await load()
  }

  async function bulkUpdate(fromStatuts: Statut[], toStatut: Statut, libelle: string) {
    const ids = cheques.filter(c => fromStatuts.includes(c.statut)).map(c => c.id)
    if (ids.length === 0) { alert('Aucune echeance concernee.'); return }
    if (!confirm(libelle + ' : ' + ids.length + ' echeance(s) ?')) return
    setBusy(true)
    const patch: any = { statut: toStatut }
    if (toStatut === 'encaisse') patch.encaisse_le = TODAY
    const { error } = await createClient().from('cheques_prevus').update(patch).in('id', ids)
    setBusy(false)
    if (error) { alert('Erreur : ' + error.message); return }
    await load()
  }

  async function genererEcheancier(e: React.FormEvent) {
    e.preventDefault()
    const total = parseFloat(gen.montant_total)
    const n = parseInt(gen.nb_echeances)
    if (!total || total <= 0 || !n || n <= 0 || !gen.date_premiere) {
      alert('Montant total, nombre d echeances et date de la 1ere echeance sont obligatoires.')
      return
    }
    const aRemplacer = cheques.filter(c => c.statut === 'attente_reception' || c.statut === 'prevu')
    const msg = aRemplacer.length > 0
      ? 'Generer ' + n + ' echeance(s) ? Les ' + aRemplacer.length + ' echeance(s) non encaissees existantes seront supprimees et remplacees.'
      : 'Generer ' + n + ' echeance(s) de paiement ?'
    if (!confirm(msg)) return

    setBusy(true)
    const s = createClient()
    if (aRemplacer.length > 0) {
      await s.from('cheques_prevus').delete().in('id', aRemplacer.map(c => c.id))
    }
    const base = new Date(gen.date_premiere + 'T00:00:00')
    const jour = base.getDate()
    const unit = Math.round((total / n) * 100) / 100
    const rows: any[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, jour)
      const montant = i === n - 1 ? Math.round((total - unit * (n - 1)) * 100) / 100 : unit
      rows.push({
        famille_id: familleId,
        ecole_id: ecole.id,
        numero_cheque: i + 1,
        montant,
        date_echeance: d.toISOString().split('T')[0],
        statut: gen.statut,
        mode_paiement: gen.mode_paiement,
        facture_id: gen.facture_id || null,
        note: 'Echeance ' + (i + 1) + '/' + n,
      })
    }
    const { error } = await s.from('cheques_prevus').insert(rows)
    setBusy(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setShowGen(false)
    setGen({ montant_total: '', nb_echeances: '10', date_premiere: '', mode_paiement: 'cheque', facture_id: '', statut: 'attente_reception' })
    await load()
  }

  async function remplacerParReglement(c: Cheque) {
    const mode = (prompt('Regler cette echeance par : cb / virement / especes', 'cb') || '').trim().toLowerCase()
    if (!mode) return
    if (!['cb', 'virement', 'especes'].includes(mode)) { alert('Mode invalide. Utilisez cb, virement ou especes.'); return }
    setBusy(true)
    const s = createClient()
    await s.from('cheques_prevus').update({
      statut: 'annule',
      note: ((c.note ? c.note + ' - ' : '') + 'Remplace par reglement ' + mode + ' le ' + new Date().toLocaleDateString('fr-FR')).slice(0, 400),
    }).eq('id', c.id)
    if (c.facture_id) {
      const { error } = await s.from('reglements').insert({
        facture_id: c.facture_id,
        famille_id: familleId,
        montant: Number(c.montant),
        date_reglement: TODAY,
        mode_paiement: mode,
        notes: 'Remplace l echeance ' + (c.mode_paiement || 'cheque') + ' n' + c.numero_cheque,
      })
      if (error) { setBusy(false); alert('Echeance annulee, mais erreur sur le reglement : ' + error.message); await load(); return }
    }
    setBusy(false)
    await load()
  }

  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' EUR'
  const total_par_statut = STATUTS.map(s => ({
    ...s,
    count: cheques.filter(c => c.statut === s.value).length,
    montant: cheques.filter(c => c.statut === s.value).reduce((sum, c) => sum + Number(c.montant), 0),
  }))

  const enRetard = cheques.filter(c =>
    c.date_echeance && c.date_echeance < TODAY && (c.statut === 'prevu' || c.statut === 'attente_reception')
  )
  const montantRetard = enRetard.reduce((s, c) => s + Number(c.montant), 0)
  const nbARecevoir = cheques.filter(c => c.statut === 'attente_reception').length
  const nbPrevu = cheques.filter(c => c.statut === 'prevu').length

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/' + ecole.slug + '/familles/' + familleId)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>&larr; Retour fiche famille</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Cheques &amp; echeancier</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '2px 0 0' }}>Famille {familleNom}</p>
        </div>
        <button onClick={() => { setShowGen(v => !v); setShowForm(false) }}
          style={{ background: showGen ? '#F1F5F9' : '#fff', color: '#1E293B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Generer un echeancier
        </button>
        <button onClick={() => { setShowForm(true); setEditId(null); setShowGen(false) }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Ajouter une echeance
        </button>
      </div>

      {montantRetard > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#991B1B' }}>
          <span style={{ fontSize: 18 }}>!</span>
          <div><strong>{fmt(montantRetard)}</strong> en retard sur l&apos;echeancier &mdash; {enRetard.length} echeance(s) dont la date est passee et qui ne sont pas encore encaissees.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => bulkUpdate(['attente_reception'], 'prevu', 'Marquer toutes les echeances a recevoir comme recues')}
          disabled={busy || nbARecevoir === 0}
          style={{ background: nbARecevoir === 0 ? '#F8FAFC' : '#FFFBEB', color: nbARecevoir === 0 ? '#CBD5E1' : '#92400E', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: nbARecevoir === 0 ? 'not-allowed' : 'pointer' }}>
          Marquer tout recu {nbARecevoir > 0 ? '(' + nbARecevoir + ')' : ''}
        </button>
        <button onClick={() => bulkUpdate(['prevu'], 'encaisse', 'Marquer toutes les echeances prevu comme encaissees')}
          disabled={busy || nbPrevu === 0}
          style={{ background: nbPrevu === 0 ? '#F8FAFC' : '#ECFDF5', color: nbPrevu === 0 ? '#CBD5E1' : '#065F46', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: nbPrevu === 0 ? 'not-allowed' : 'pointer' }}>
          Tout encaisser {nbPrevu > 0 ? '(' + nbPrevu + ')' : ''}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {total_par_statut.map(s => (
          <div key={s.value} style={{ background: s.bg, border: '1px solid ' + s.bg, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.fg, marginTop: 4 }}>{s.count}</div>
            <div style={{ fontSize: 11, color: s.fg, opacity: 0.8, marginTop: 2 }}>{fmt(s.montant)}</div>
          </div>
        ))}
      </div>

      {showGen && (
        <form onSubmit={genererEcheancier} style={{ background: '#fff', border: '1px solid #BFDBFE', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 6px' }}>Generer / regenerer l&apos;echeancier</h3>
          <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px' }}>
            Cree N echeances mensuelles de montant egal. Les echeances a recevoir et prevu existantes seront remplacees (les encaissees sont conservees).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Montant total a echelonner *</label>
              <input type="number" step="0.01" style={inp} value={gen.montant_total} onChange={e => setGen({ ...gen, montant_total: e.target.value })} placeholder="3300.00" required />
            </div>
            <div>
              <label style={lbl}>Nombre d&apos;echeances *</label>
              <input type="number" min="1" max="24" style={inp} value={gen.nb_echeances} onChange={e => setGen({ ...gen, nb_echeances: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Date de la 1ere echeance *</label>
              <input type="date" style={inp} value={gen.date_premiere} onChange={e => setGen({ ...gen, date_premiere: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Mode de paiement</label>
              <select style={inp} value={gen.mode_paiement} onChange={e => setGen({ ...gen, mode_paiement: e.target.value })}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Statut initial</label>
              <select style={inp} value={gen.statut} onChange={e => setGen({ ...gen, statut: e.target.value as Statut })}>
                <option value="attente_reception">A recevoir (cheques pas encore remis)</option>
                <option value="prevu">Prevu (deja en main / prelevement)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Facture liee (optionnel)</label>
              <select style={inp} value={gen.facture_id} onChange={e => setGen({ ...gen, facture_id: e.target.value })}>
                <option value="">- Aucune -</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
            </div>
          </div>
          {gen.montant_total && gen.nb_echeances && (
            <div style={{ fontSize: 12, color: '#1E40AF', background: '#EFF6FF', borderRadius: 8, padding: '8px 12px', marginTop: 12 }}>
              ~ {fmt((parseFloat(gen.montant_total) || 0) / (parseInt(gen.nb_echeances) || 1))} par echeance &middot; {gen.nb_echeances} echeances mensuelles
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" disabled={busy} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Generer l echeancier'}
            </button>
            <button type="button" onClick={() => setShowGen(false)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>{editId ? 'Modifier l echeance' : 'Nouvelle echeance'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>N cheque / ref *</label>
              <input style={inp} value={form.numero_cheque} onChange={e => setForm({ ...form, numero_cheque: e.target.value })} placeholder="Ex: 1234567" required />
            </div>
            <div>
              <label style={lbl}>Montant *</label>
              <input type="number" step="0.01" style={inp} value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} placeholder="500.00" required />
            </div>
            <div>
              <label style={lbl}>Date d&apos;echeance</label>
              <input type="date" style={inp} value={form.date_echeance} onChange={e => setForm({ ...form, date_echeance: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Statut</label>
              <select style={inp} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as Statut })}>
                {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Encaisse le</label>
              <input type="date" style={inp} value={form.encaisse_le} onChange={e => setForm({ ...form, encaisse_le: e.target.value })} disabled={form.statut !== 'encaisse'} />
            </div>
            <div>
              <label style={lbl}>Facture liee (optionnel)</label>
              <select style={inp} value={form.facture_id} onChange={e => setForm({ ...form, facture_id: e.target.value })}>
                <option value="">- Aucune -</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Mode</label>
              <select style={inp} value={form.mode_paiement} onChange={e => setForm({ ...form, mode_paiement: e.target.value })}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
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

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {cheques.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucune echeance enregistree pour cette famille.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                {['N / ref', 'Montant', 'Echeance', 'Mode', 'Statut', 'Encaisse le', 'Facture', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cheques.map(c => {
                const sc = STATUTS.find(s => s.value === c.statut) || STATUTS[1]
                const fact = factures.find(f => f.id === c.facture_id)
                const modeLabel = MODES.find(m => m.value === c.mode_paiement)?.label || c.mode_paiement || '-'
                const retard = !!c.date_echeance && c.date_echeance < TODAY && (c.statut === 'prevu' || c.statut === 'attente_reception')
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9', background: retard ? '#FEF2F2' : undefined }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{c.numero_cheque}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>{fmt(c.montant)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: retard ? '#991B1B' : '#475569', fontWeight: retard ? 700 : 400 }}>
                      {c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : '-'}
                      {retard && <span style={{ marginLeft: 6, fontSize: 10 }}>en retard</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{modeLabel}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.fg, background: sc.bg, padding: '3px 10px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{c.encaisse_le ? new Date(c.encaisse_le).toLocaleDateString('fr-FR') : '-'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>{fact?.numero || '-'}</td>
                    <td style={{ padding: '8px 14px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.statut === 'attente_reception' && (
                        <button onClick={() => quickUpdateStatut(c.id, 'prevu')} title="Marquer recu"
                          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Recu</button>
                      )}
                      {(c.statut === 'prevu' || c.statut === 'attente_reception') && (
                        <button onClick={() => quickUpdateStatut(c.id, 'encaisse')} title="Marquer encaisse"
                          style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Encaisser</button>
                      )}
                      {(c.statut === 'prevu' || c.statut === 'attente_reception') && (
                        <button onClick={() => remplacerParReglement(c)} title="Regler en CB / virement / especes (annule cette echeance)"
                          style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Regler autrement</button>
                      )}
                      {c.statut === 'prevu' && (
                        <button onClick={() => quickUpdateStatut(c.id, 'restitue')} title="Restituer (caution)"
                          style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Restituer</button>
                      )}
                      <button onClick={() => openEdit(c)} title="Modifier"
                        style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => remove(c.id)} title="Supprimer"
                        style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>Suppr</button>
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
