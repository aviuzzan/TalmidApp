'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ModesReglementTab({ ecoleId }: { ecoleId: string }) {
  const [modes, setModes] = useState<any[]>([])
  const TYPES = [
    { value: 'cheque', label: 'Chèque', desc: 'Chèques remis à la comptabilité' },
    { value: 'sepa', label: 'Prélèvement SEPA', desc: 'Export XML SEPA / Sage Direct' },
    { value: 'gocardless', label: 'GoCardless', desc: 'Prélèvement en ligne (bientôt)' },
    { value: 'stripe', label: 'Carte bancaire', desc: 'Paiement Stripe (bientôt)' },
  ]
  useEffect(() => { createClient().from('modes_reglement_ecole').select('*').eq('ecole_id', ecoleId).order('ordre').then(({ data }) => setModes(data ?? [])) }, [ecoleId])
  async function toggle(id: string, actif: boolean) { await createClient().from('modes_reglement_ecole').update({ actif: !actif }).eq('id', id); setModes(p => p.map(m => m.id === id ? { ...m, actif: !actif } : m)) }
  async function ajouter(type: string, label: string) { if (modes.find(m => m.type === type)) return; const { data } = await createClient().from('modes_reglement_ecole').insert({ ecole_id: ecoleId, type, label, actif: true, ordre: modes.length }).select().single(); if (data) setModes(p => [...p, data]) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {TYPES.map(t => {
        const existing = modes.find(m => m.type === t.value)
        const comingSoon = t.value === 'gocardless' || t.value === 'stripe'
        return (
          <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', opacity: comingSoon ? 0.6 : 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>{t.label}{comingSoon && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#D97706', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>Bientôt</span>}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t.desc}</div>
            </div>
            {!comingSoon && (existing ? (
              <button onClick={() => toggle(existing.id, existing.actif)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: existing.actif ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: existing.actif ? 23 : 3, transition: 'all 0.2s' }} />
              </button>
            ) : (
              <button onClick={() => ajouter(t.value, t.label)} style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>Activer</button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
