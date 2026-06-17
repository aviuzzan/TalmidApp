'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ReductionsFNTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [reductions, setReductions] = useState<any[]>([])
  const [tranches, setTranches] = useState<any[]>([])
  const [newItem, setNewItem] = useState<{ nb_enfants: string; montant_reduction: string; tranches_eligibles: string[] }>({
    nb_enfants: '', montant_reduction: '', tranches_eligibles: [],
  })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  useEffect(() => {
    const s = createClient()
    Promise.all([
      s.from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants'),
      s.from('tranches_facturation').select('id, code, libelle').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
    ]).then(([r1, r2]) => {
      setReductions(r1.data ?? [])
      setTranches(r2.data ?? [])
    })
  }, [ecoleId, annee])

  async function ajouter() {
    if (!newItem.nb_enfants || !newItem.montant_reduction) return
    const payload: any = {
      ecole_id: ecoleId,
      annee_scolaire: annee,
      nb_enfants: parseInt(newItem.nb_enfants),
      montant_reduction: parseFloat(newItem.montant_reduction),
      tranches_eligibles: newItem.tranches_eligibles.length > 0 ? newItem.tranches_eligibles : null,
    }
    await createClient().from('reductions_famille_nombreuse').upsert(payload)
    const { data } = await createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants')
    setReductions(data ?? [])
    setNewItem({ nb_enfants: '', montant_reduction: '', tranches_eligibles: [] })
  }

  async function supprimer(id: string) {
    await createClient().from('reductions_famille_nombreuse').delete().eq('id', id)
    setReductions(p => p.filter(r => r.id !== id))
  }

  async function toggleTrancheExistant(reduction: any, trancheId: string) {
    const current: string[] = Array.isArray(reduction.tranches_eligibles) ? reduction.tranches_eligibles : []
    const next = current.includes(trancheId) ? current.filter(t => t !== trancheId) : [...current, trancheId]
    const newValue = next.length > 0 ? next : null
    await createClient().from('reductions_famille_nombreuse').update({ tranches_eligibles: newValue }).eq('id', reduction.id)
    setReductions(p => p.map(r => r.id === reduction.id ? { ...r, tranches_eligibles: newValue } : r))
  }

  function toggleNewTranche(trancheId: string) {
    setNewItem(p => {
      const has = p.tranches_eligibles.includes(trancheId)
      return { ...p, tranches_eligibles: has ? p.tranches_eligibles.filter(t => t !== trancheId) : [...p.tranches_eligibles, trancheId] }
    })
  }

  const labelTrancheTotal = (r: any) => {
    if (!Array.isArray(r.tranches_eligibles) || r.tranches_eligibles.length === 0) return 'Toutes les tranches'
    const noms = r.tranches_eligibles.map((tid: string) => tranches.find(t => t.id === tid)?.code).filter(Boolean)
    return `Tranches : ${noms.join(', ')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#64748B', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 9, padding: '9px 14px' }}>
        Limite la réduction famille nombreuse à certaines tranches uniquement. Si aucune tranche n'est cochée → s'applique à toutes les familles éligibles.
      </div>

      {/* Formulaire d'ajout */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>À PARTIR DE N ENFANTS</div>
            <input style={inp} type="number" min="2" value={newItem.nb_enfants} onChange={e => setNewItem(p => ({ ...p, nb_enfants: e.target.value }))} placeholder="2" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>RÉDUCTION (€)</div>
            <input style={inp} type="number" value={newItem.montant_reduction} onChange={e => setNewItem(p => ({ ...p, montant_reduction: e.target.value }))} placeholder="960" />
          </div>
          <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
        {tranches.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>TRANCHES ÉLIGIBLES (vide = toutes)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tranches.map(t => {
                const checked = newItem.tranches_eligibles.includes(t.id)
                return (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer', background: checked ? '#EEF2FF' : '#fff', border: `1px solid ${checked ? '#A5B4FC' : '#E2E8F0'}`, borderRadius: 6, padding: '5px 10px' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleNewTranche(t.id)} />
                    <strong>{t.code}</strong> — {t.libelle}
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Liste des réductions existantes */}
      {reductions.map(r => (
        <div key={r.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: tranches.length > 0 ? 10 : 0 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.nb_enfants} enfants et +</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>- {r.montant_reduction?.toLocaleString('fr-FR')} €</span>
            <span style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>{labelTrancheTotal(r)}</span>
            <button onClick={() => supprimer(r.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
          {tranches.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
              {tranches.map(t => {
                const checked = Array.isArray(r.tranches_eligibles) && r.tranches_eligibles.includes(t.id)
                return (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748B', cursor: 'pointer', background: checked ? '#EEF2FF' : '#F8FAFC', border: `1px solid ${checked ? '#A5B4FC' : '#E2E8F0'}`, borderRadius: 5, padding: '4px 8px' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTrancheExistant(r, t.id)} />
                    <strong>{t.code}</strong>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
