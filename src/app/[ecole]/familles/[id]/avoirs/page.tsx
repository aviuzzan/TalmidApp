'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { labelStatutFacture } from '@/lib/statuts'

type Avoir = {
  id: string
  numero: string | null
  type: 'avoir' | 'note_credit'
  montant: number
  montant_utilise: number
  montant_disponible: number
  statut: string
  source: string | null
  motif: string | null
  date_emission: string
  date_expiration: string | null
  facture_origine_id: string | null
  created_at: string
}

const SOURCES = [
  { value: 'paiement_excedentaire', label: 'Paiement excédentaire' },
  { value: 'contrat_annule', label: 'Contrat annulé' },
  { value: 'geste_commercial', label: 'Geste commercial' },
  { value: 'reduction_post_facturation', label: 'Réduction post-facturation' },
  { value: 'autre', label: 'Autre' },
]

export default function AvoirsFamillePage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const familleId = params.id as string

  const [loading, setLoading] = useState(true)
  const [familleNom, setFamilleNom] = useState('')
  const [avoirs, setAvoirs] = useState<Avoir[]>([])
  const [factures, setFactures] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    type: 'avoir' as 'avoir' | 'note_credit',
    montant: '', motif: '', source: 'paiement_excedentaire',
    facture_origine_id: '', date_expiration: '',
  })
  const [imputForm, setImputForm] = useState<{ avoirId: string; montant: string; factureId: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const s = createClient()
    const [{ data: f }, { data: avs }, { data: facts }] = await Promise.all([
      s.from('familles').select('nom').eq('id', familleId).single(),
      s.from('avoirs_solde').select('*').eq('famille_id', familleId).order('date_emission', { ascending: false }),
      s.from('factures').select('id, numero, annee_scolaire, statut').eq('famille_id', familleId).order('date_emission', { ascending: false }),
    ])
    if (f) setFamilleNom(f.nom || '')
    setAvoirs((avs as any) || [])
    setFactures(facts || [])
    setLoading(false)
  }, [familleId])

  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.montant) return alert('Montant obligatoire')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const numero = editId ? undefined : `A-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`
    const payload: any = {
      famille_id: familleId, ecole_id: ecole.id,
      type: form.type, montant: parseFloat(form.montant),
      source: form.source, motif: form.motif || null,
      facture_origine_id: form.facture_origine_id || null,
      date_expiration: form.date_expiration || null,
    }
    if (numero) payload.numero = numero
    if (!editId) payload.cree_par = session?.user.id
    if (editId) {
      const { error } = await s.from('avoirs').update(payload).eq('id', editId)
      if (error) return alert('Erreur : ' + error.message)
    } else {
      const { data: avoirCree, error } = await s.from('avoirs').insert(payload).select('id, montant, numero').single()
      if (error) return alert('Erreur : ' + error.message)
      // Si une facture d'origine est selectionnee, proposer l'imputation automatique
      if (avoirCree && form.facture_origine_id) {
        const fact = factures.find(f => f.id === form.facture_origine_id)
        const factLabel = fact ? `${fact.numero} (${fact.annee_scolaire})` : 'la facture'
        const m = Number(payload.montant)
        if (confirm(`Imputer immediatement ${m.toFixed(2)} EUR sur ${factLabel} ?\n\n(L avoir va deduire ce montant du solde restant.)`)) {
          await s.from('avoirs_imputations').insert({
            avoir_id: avoirCree.id,
            facture_id: form.facture_origine_id,
            montant: m,
            cree_par: session?.user.id,
          })
          const { error: errRegA } = await s.from('reglements').insert({
            facture_id: form.facture_origine_id,
            famille_id: familleId,
            montant: m,
            date_reglement: new Date().toISOString().split('T')[0],
            mode_paiement: 'avoir',
            reference: avoirCree.numero,
            notes: `Imputation avoir ${avoirCree.numero || avoirCree.id.substring(0, 8)} (cree dans le meme geste)`,
          })
          if (errRegA) alert('Avoir cree mais reglement non trace : ' + errRegA.message)
          await s.from('avoirs').update({ statut: 'utilise' }).eq('id', avoirCree.id)
        }
      }
    }
    setShowForm(false); setEditId(null)
    setForm({ type: 'avoir', montant: '', motif: '', source: 'paiement_excedentaire', facture_origine_id: '', date_expiration: '' })
    await load()
  }

  async function imputerSur() {
    if (!imputForm) return
    const m = parseFloat(imputForm.montant)
    if (isNaN(m) || m <= 0) return alert('Montant invalide')
    const avoir = avoirs.find(a => a.id === imputForm.avoirId)
    if (!avoir) return
    if (m > avoir.montant_disponible) return alert(`Montant disponible : ${avoir.montant_disponible.toFixed(2)} €`)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()

    // 1. Créer l'imputation
    const { error: e1 } = await s.from('avoirs_imputations').insert({
      avoir_id: imputForm.avoirId,
      facture_id: imputForm.factureId || null,
      montant: m,
      cree_par: session?.user.id,
    })
    if (e1) return alert('Erreur : ' + e1.message)

    // 2. Si imputé sur une facture → créer un règlement de type "avoir"
    if (imputForm.factureId) {
      const { error: errReg } = await s.from('reglements').insert({
        facture_id: imputForm.factureId,
        famille_id: familleId,
        montant: m,
        date_reglement: new Date().toISOString().split('T')[0],
        mode_paiement: 'avoir',
        reference: avoir.numero,
        notes: `Imputation avoir ${avoir.numero || avoir.id.substring(0, 8)}`,
      })
      if (errReg) alert('Imputation enregistree mais reglement non trace : ' + errReg.message)
    }

    // 3. Mettre à jour le statut de l'avoir
    const nouveau_utilise = avoir.montant_utilise + m
    const nouveau_statut = nouveau_utilise >= avoir.montant ? 'utilise' : 'partiellement_utilise'
    await s.from('avoirs').update({ statut: nouveau_statut }).eq('id', imputForm.avoirId)

    setImputForm(null)
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet avoir ? Toutes les imputations seront supprimées.')) return
    await createClient().from('avoirs').delete().eq('id', id)
    await load()
  }

  function openEdit(a: Avoir) {
    setForm({
      type: a.type, montant: String(a.montant), motif: a.motif || '',
      source: a.source || 'paiement_excedentaire',
      facture_origine_id: a.facture_origine_id || '',
      date_expiration: a.date_expiration || '',
    })
    setEditId(a.id); setShowForm(true)
  }

  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  const total_disponible = avoirs.filter(a => a.statut === 'actif' || a.statut === 'partiellement_utilise').reduce((s, a) => s + Number(a.montant_disponible), 0)
  const total_emis = avoirs.reduce((s, a) => s + Number(a.montant), 0)
  const total_utilise = avoirs.reduce((s, a) => s + Number(a.montant_utilise), 0)

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.push(`/${ecole.slug}/familles/${familleId}`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour fiche famille</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Avoirs & notes de crédit</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '2px 0 0' }}>Famille {familleNom}</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null) }}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Nouvel avoir
        </button>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>Avoirs disponibles</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#065F46', marginTop: 4 }}>{fmt(total_disponible)}</div>
          <div style={{ fontSize: 11, color: '#065F46', opacity: 0.7, marginTop: 2 }}>Utilisables immédiatement</div>
        </div>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>Total émis</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>{fmt(total_emis)}</div>
        </div>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Total utilisé</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#475569', marginTop: 4 }}>{fmt(total_utilise)}</div>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <form onSubmit={save} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>{editId ? 'Modifier l\'avoir' : 'Nouvel avoir / note de crédit'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Type</label>
              <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}>
                <option value="avoir">Avoir</option>
                <option value="note_credit">Note de crédit</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Montant *</label>
              <input type="number" step="0.01" style={inp} value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Source / origine</label>
              <select style={inp} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Facture concernée (optionnel)</label>
              <select style={inp} value={form.facture_origine_id} onChange={e => setForm({ ...form, facture_origine_id: e.target.value })}>
                <option value="">— Aucune —</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
              {!editId && form.facture_origine_id && (
                <div style={{ fontSize: 10, color: '#065F46', marginTop: 4 }}>✓ Imputation automatique proposée à la création</div>
              )}
            </div>
            <div>
              <label style={lbl}>Date d&apos;expiration (optionnel)</label>
              <input type="date" style={inp} value={form.date_expiration} onChange={e => setForm({ ...form, date_expiration: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Motif / commentaire</label>
              <textarea style={{ ...inp, minHeight: 50 }} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} placeholder="Ex: Remboursement contrat annulé, geste commercial pour fidélité…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {editId ? 'Enregistrer' : 'Créer l\'avoir'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          </div>
        </form>
      )}

      {/* Imputation modal */}
      {imputForm && (
        <div onClick={() => setImputForm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 480, width: '90%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Imputer l&apos;avoir sur une facture</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Facture (laisser vide pour avoir libre)</label>
                <select style={inp} value={imputForm.factureId} onChange={e => setImputForm({ ...imputForm, factureId: e.target.value })}>
                  <option value="">— Imputation libre —</option>
                  {factures.filter(f => f.statut !== 'annule' && f.statut !== 'paye').map(f => (
                    <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire}) · {labelStatutFacture(f.statut)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Montant à imputer</label>
                <input type="number" step="0.01" style={inp} value={imputForm.montant} onChange={e => setImputForm({ ...imputForm, montant: e.target.value })} />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  Disponible sur cet avoir : {fmt(avoirs.find(a => a.id === imputForm.avoirId)?.montant_disponible || 0)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={imputerSur} style={{ flex: 1, background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Imputer</button>
                <button onClick={() => setImputForm(null)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {avoirs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun avoir enregistré pour cette famille.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                {['N°', 'Type', 'Émis le', 'Montant', 'Utilisé', 'Disponible', 'Statut', 'Source', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {avoirs.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{a.numero || a.id.substring(0, 8)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 11 }}>
                    <span style={{ background: a.type === 'avoir' ? '#ECFDF5' : '#FEF3C7', color: a.type === 'avoir' ? '#065F46' : '#92400E', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                      {a.type === 'avoir' ? 'Avoir' : 'Note crédit'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{new Date(a.date_emission).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{fmt(a.montant)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748B' }}>{fmt(a.montant_utilise)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: a.montant_disponible > 0 ? '#10B981' : '#94A3B8' }}>{fmt(a.montant_disponible)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                      background: a.statut === 'actif' ? '#ECFDF5' : a.statut === 'utilise' ? '#F1F5F9' : a.statut === 'partiellement_utilise' ? '#FEF3C7' : '#FEF2F2',
                      color: a.statut === 'actif' ? '#065F46' : a.statut === 'utilise' ? '#475569' : a.statut === 'partiellement_utilise' ? '#92400E' : '#991B1B',
                      textTransform: 'uppercase' }}>{a.statut.replace('_', ' ')}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748B' }}>{SOURCES.find(s => s.value === a.source)?.label || '—'}</td>
                  <td style={{ padding: '8px 12px', display: 'flex', gap: 4 }}>
                    {a.montant_disponible > 0 && (
                      <button onClick={() => setImputForm({ avoirId: a.id, montant: String(a.montant_disponible), factureId: '' })} title="Imputer"
                        style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>↪ Imputer</button>
                    )}
                    <button onClick={() => openEdit(a)} title="Modifier" style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>✏</button>
                    <button onClick={() => remove(a.id)} title="Supprimer" style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
