'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Plan = {
  id: string
  nom: string
  montant_total: number
  nb_echeances: number
  statut: 'actif' | 'complete' | 'suspendu' | 'annule'
  motif: string | null
  facture_id: string | null
  created_at: string
}

type Echeance = {
  id: string
  plan_id: string
  numero_echeance: number
  date_echeance: string
  montant: number
  statut: 'a_venir' | 'paye' | 'partiel' | 'en_retard' | 'annule'
  montant_paye: number
  note: string | null
}

export default function PlanPaiementPage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const familleId = params.id as string

  const [loading, setLoading] = useState(true)
  const [familleNom, setFamilleNom] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [echeancesByPlan, setEcheancesByPlan] = useState<Record<string, Echeance[]>>({})
  const [factures, setFactures] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    nom: '', facture_id: '', motif: '',
    montant_total: '', nb_echeances: 10,
    date_premiere_echeance: '', frequence: 'mensuel' as 'mensuel' | 'bimensuel' | 'trimestriel',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const s = createClient()
    const [{ data: f }, { data: pls }, { data: facts }] = await Promise.all([
      s.from('familles').select('nom').eq('id', familleId).single(),
      s.from('plans_paiement_famille').select('*').eq('famille_id', familleId).order('created_at', { ascending: false }),
      s.from('factures').select('id, numero, annee_scolaire').eq('famille_id', familleId).order('date_emission', { ascending: false }),
    ])
    if (f) setFamilleNom(f.nom || '')
    setPlans((pls as any) || [])
    setFactures(facts || [])

    if (pls && pls.length > 0) {
      const { data: ech } = await s.from('echeances_plan_paiement')
        .select('*').in('plan_id', pls.map((p: any) => p.id))
        .order('numero_echeance')
      const map: Record<string, Echeance[]> = {}
      for (const e of (ech || []) as any[]) {
        if (!map[e.plan_id]) map[e.plan_id] = []
        map[e.plan_id].push(e)
      }
      setEcheancesByPlan(map)
    } else {
      setEcheancesByPlan({})
    }
    setLoading(false)
  }, [familleId])

  useEffect(() => { load() }, [load])

  async function createPlan(e: React.FormEvent) {
    e.preventDefault()
    const total = parseFloat(form.montant_total)
    if (isNaN(total) || total <= 0) return alert('Montant total invalide')
    if (form.nb_echeances < 1) return alert('Au moins 1 échéance')
    if (!form.date_premiere_echeance) return alert('Date première échéance obligatoire')

    const s = createClient()
    const { data: { session } } = await s.auth.getSession()

    // 1. Créer le plan
    const { data: planRow, error: e1 } = await s.from('plans_paiement_famille').insert({
      ecole_id: ecole.id,
      famille_id: familleId,
      facture_id: form.facture_id || null,
      nom: form.nom || `Plan ${total.toFixed(0)}€ x ${form.nb_echeances}`,
      montant_total: total,
      nb_echeances: form.nb_echeances,
      motif: form.motif || null,
      cree_par: session?.user.id,
    }).select().single()
    if (e1) return alert('Erreur : ' + e1.message)

    // 2. Générer les échéances
    const montantParEcheance = Math.round(total / form.nb_echeances * 100) / 100
    const reste = total - montantParEcheance * form.nb_echeances // ajustement dernier
    const echeances = []
    const dateDeb = new Date(form.date_premiere_echeance)
    for (let i = 0; i < form.nb_echeances; i++) {
      const dt = new Date(dateDeb)
      if (form.frequence === 'mensuel') dt.setMonth(dt.getMonth() + i)
      else if (form.frequence === 'bimensuel') dt.setMonth(dt.getMonth() + i * 2)
      else if (form.frequence === 'trimestriel') dt.setMonth(dt.getMonth() + i * 3)
      const montant = i === form.nb_echeances - 1 ? Math.round((montantParEcheance + reste) * 100) / 100 : montantParEcheance
      echeances.push({
        plan_id: planRow.id,
        numero_echeance: i + 1,
        date_echeance: dt.toISOString().split('T')[0],
        montant,
        statut: 'a_venir' as const,
      })
    }
    await s.from('echeances_plan_paiement').insert(echeances)

    setShowForm(false)
    setForm({ nom: '', facture_id: '', motif: '', montant_total: '', nb_echeances: 10, date_premiere_echeance: '', frequence: 'mensuel' })
    await load()
  }

  async function marquerEcheance(echId: string, statut: Echeance['statut']) {
    const s = createClient()
    const patch: any = { statut }
    if (statut === 'paye') {
      const e = Object.values(echeancesByPlan).flat().find(x => x.id === echId)
      if (e) patch.montant_paye = e.montant
    }
    await s.from('echeances_plan_paiement').update(patch).eq('id', echId)
    await load()
  }

  async function deletePlan(id: string) {
    if (!confirm('Supprimer ce plan et toutes ses échéances ?')) return
    await createClient().from('plans_paiement_famille').delete().eq('id', id)
    await load()
  }

  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.push(`/${ecole.slug}/familles/${familleId}`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour fiche famille</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Plans de paiement individualisés</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '2px 0 0' }}>Famille {familleNom}</p>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Nouveau plan
        </button>
      </div>

      {showForm && (
        <form onSubmit={createPlan} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Nouveau plan d&apos;échéancier</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>Nom du plan</label>
              <input style={inp} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Étalement difficulté ponctuelle" />
            </div>
            <div>
              <label style={lbl}>Facture liée (optionnel)</label>
              <select style={inp} value={form.facture_id} onChange={e => setForm({ ...form, facture_id: e.target.value })}>
                <option value="">— Aucune —</option>
                {factures.map(f => <option key={f.id} value={f.id}>{f.numero} ({f.annee_scolaire})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Montant total *</label>
              <input type="number" step="0.01" style={inp} value={form.montant_total} onChange={e => setForm({ ...form, montant_total: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Nombre d&apos;échéances *</label>
              <input type="number" min={1} max={36} style={inp} value={form.nb_echeances} onChange={e => setForm({ ...form, nb_echeances: parseInt(e.target.value) || 1 })} required />
            </div>
            <div>
              <label style={lbl}>Première échéance *</label>
              <input type="date" style={inp} value={form.date_premiere_echeance} onChange={e => setForm({ ...form, date_premiere_echeance: e.target.value })} required />
            </div>
            <div>
              <label style={lbl}>Fréquence</label>
              <select style={inp} value={form.frequence} onChange={e => setForm({ ...form, frequence: e.target.value as any })}>
                <option value="mensuel">Mensuelle</option>
                <option value="bimensuel">Bimestrielle</option>
                <option value="trimestriel">Trimestrielle</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Motif</label>
              <textarea style={{ ...inp, minHeight: 50 }} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} placeholder="Ex: Difficulté financière ponctuelle, accord direction…" />
            </div>
          </div>
          {form.montant_total && form.nb_echeances > 0 && (
            <div style={{ marginTop: 10, padding: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, color: '#1E40AF' }}>
              💡 Aperçu : {form.nb_echeances} échéances de ~{(parseFloat(form.montant_total) / form.nb_echeances).toFixed(2)} € (dernière ajustée si arrondi).
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Créer le plan</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          </div>
        </form>
      )}

      {plans.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          Aucun plan de paiement pour cette famille.
        </div>
      ) : (
        plans.map(p => {
          const ech = echeancesByPlan[p.id] || []
          const paid = ech.filter(e => e.statut === 'paye').length
          const totalPaid = ech.reduce((s, e) => s + Number(e.montant_paye || 0), 0)
          return (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: 16, borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>{p.nom}</h3>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                    {p.nb_echeances} échéances · Total <strong>{fmt(p.montant_total)}</strong> · Payé <strong style={{ color: '#10B981' }}>{fmt(totalPaid)}</strong> ({paid}/{p.nb_echeances})
                  </div>
                  {p.motif && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontStyle: 'italic' }}>{p.motif}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 10,
                    background: p.statut === 'actif' ? '#ECFDF5' : p.statut === 'complete' ? '#EFF6FF' : '#F8FAFC',
                    color: p.statut === 'actif' ? '#065F46' : p.statut === 'complete' ? '#1E40AF' : '#475569' }}>
                    {p.statut === 'actif' ? 'Actif' : p.statut === 'complete' ? 'Terminé' : p.statut === 'annule' ? 'Annulé' : (p.statut.charAt(0).toUpperCase() + p.statut.slice(1))}
                  </span>
                  <button onClick={() => deletePlan(p.id)} style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      {['N°', 'Date prévue', 'Montant', 'Payé', 'Statut', 'Actions'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ech.map(e => {
                      const enRetard = e.statut === 'a_venir' && new Date(e.date_echeance) < new Date()
                      const realStatut = enRetard ? 'en_retard' : e.statut
                      return (
                        <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600 }}>{e.numero_echeance}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>{new Date(e.date_echeance).toLocaleDateString('fr-FR')}</td>
                          <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>{fmt(e.montant)}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>{fmt(e.montant_paye)}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                              background: realStatut === 'paye' ? '#ECFDF5' : realStatut === 'partiel' ? '#FEF3C7' : realStatut === 'en_retard' ? '#FEF2F2' : '#F1F5F9',
                              color: realStatut === 'paye' ? '#065F46' : realStatut === 'partiel' ? '#92400E' : realStatut === 'en_retard' ? '#991B1B' : '#475569',
                              textTransform: 'uppercase' }}>{realStatut.replace('_', ' ')}</span>
                          </td>
                          <td style={{ padding: '6px 12px', display: 'flex', gap: 4 }}>
                            {e.statut !== 'paye' && (
                              <button onClick={() => marquerEcheance(e.id, 'paye')}
                                style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>✓ Payé</button>
                            )}
                            {e.statut === 'paye' && (
                              <button onClick={() => marquerEcheance(e.id, 'a_venir')}
                                style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 10, cursor: 'pointer' }}>↶ Annuler</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
