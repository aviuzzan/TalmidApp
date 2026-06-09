'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ReductionsFNTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [reductions, setReductions] = useState<any[]>([])
  const [newItem, setNewItem] = useState({ nb_enfants: '', montant_reduction: '' })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  useEffect(() => { createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants').then(({ data }) => setReductions(data ?? [])) }, [ecoleId, annee])
  async function ajouter() {
    if (!newItem.nb_enfants || !newItem.montant_reduction) return
    await createClient().from('reductions_famille_nombreuse').upsert({ ecole_id: ecoleId, annee_scolaire: annee, nb_enfants: parseInt(newItem.nb_enfants), montant_reduction: parseFloat(newItem.montant_reduction) })
    const { data } = await createClient().from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('nb_enfants')
    setReductions(data ?? []); setNewItem({ nb_enfants: '', montant_reduction: '' })
  }
  async function supprimer(id: string) { await createClient().from('reductions_famille_nombreuse').delete().eq('id', id); setReductions(p => p.filter(r => r.id !== id)) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>À PARTIR DE N ENFANTS</div><input style={inp} type="number" min="2" value={newItem.nb_enfants} onChange={e => setNewItem(p => ({ ...p, nb_enfants: e.target.value }))} placeholder="2" /></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>RÉDUCTION (€)</div><input style={inp} type="number" value={newItem.montant_reduction} onChange={e => setNewItem(p => ({ ...p, montant_reduction: e.target.value }))} placeholder="960" /></div>
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </div>
      {reductions.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 16px' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.nb_enfants} enfants et +</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>- {r.montant_reduction?.toLocaleString('fr-FR')} €</span>
          <button onClick={() => supprimer(r.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </div>
  )
}
