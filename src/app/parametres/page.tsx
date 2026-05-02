'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Tab = 'classes' | 'paiements' | 'transports'

export default function ParametresPage() {
  const [tab, setTab] = useState<Tab>('classes')
  const [classes, setClasses] = useState<any[]>([])
  const [modes, setModes] = useState<any[]>([])
  const [transports, setTransports] = useState<any[]>([])
  const [vals, setVals] = useState({ classes: '', paiements: '', transports: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const s = createClient()
    const [{ data: c }, { data: m }, { data: t }] = await Promise.all([
      s.from('classes').select('*').order('ordre'),
      s.from('modes_paiement').select('*').order('libelle'),
      s.from('transports').select('*').order('nom'),
    ])
    setClasses(c ?? []); setModes(m ?? []); setTransports(t ?? [])
  }

  useEffect(() => { load() }, [])

  const s = createClient()

  async function add(type: Tab) {
    const v = vals[type].trim()
    if (!v) return
    setSaving(true)
    if (type === 'classes') await s.from('classes').insert({ nom: v, ordre: classes.length })
    else if (type === 'paiements') await s.from('modes_paiement').insert({ code: v.toLowerCase().replace(/\s+/g, '_'), libelle: v })
    else await s.from('transports').insert({ nom: v })
    setVals(p => ({ ...p, [type]: '' }))
    await load(); setSaving(false)
  }

  async function del(type: Tab, id: string) {
    if (type === 'classes') await s.from('classes').delete().eq('id', id)
    else if (type === 'paiements') await s.from('modes_paiement').delete().eq('id', id)
    else await s.from('transports').delete().eq('id', id)
    load()
  }

  const inp = { flex: 1, padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }

  const TABS = [
    { id: 'classes' as Tab, label: '🏫 Classes', items: classes, name: (i: any) => i.nom, placeholder: 'Ex: Kita 1, CP...' },
    { id: 'paiements' as Tab, label: '💳 Modes de paiement', items: modes, name: (i: any) => i.libelle, placeholder: 'Ex: Prélèvement...' },
    { id: 'transports' as Tab, label: '🚌 Transport', items: transports, name: (i: any) => i.nom, placeholder: 'Ex: Car ligne 1...' },
  ]
  const current = TABS.find(t => t.id === tab)!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Paramètres</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>Configurez les listes et options de votre école</p>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 4, width: 'fit-content', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: tab === t.id ? '#2563EB' : 'transparent', color: tab === t.id ? '#fff' : '#64748B', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>{current.label}</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input style={inp} value={vals[tab]} onChange={e => setVals(p => ({ ...p, [tab]: e.target.value }))}
            placeholder={current.placeholder}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(tab) } }} />
          <button className="btn-primary" onClick={() => add(tab)} disabled={saving} style={{ whiteSpace: 'nowrap' }}>
            + Ajouter
          </button>
        </div>

        {current.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#CBD5E1', fontSize: 13 }}>
            Aucun élément. Ajoutez-en un ci-dessus.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.items.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <span style={{ fontWeight: 500, color: '#1E293B' }}>{current.name(item)}</span>
                <button onClick={() => del(tab, item.id)}
                  style={{ background: '#FEF2F2', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#DC2626', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
