'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ServicesTab({ ecoleId }: { ecoleId: string }) {
  const [services, setServices] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [newSvc, setNewSvc] = useState({ nom: '', description: '' })

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: svc }, { data: prof }, { data: sa }] = await Promise.all([
      s.from('services').select('*').eq('ecole_id', ecoleId).order('ordre'),
      s.from('profiles').select('id, prenom, nom, role').in('role', ['admin', 'super_admin']),
      s.from('service_agents').select('service_id, profile_id'),
    ])
    setServices(svc ?? [])
    setAgents(prof ?? [])
    const map: Record<string, string[]> = {}
    for (const a of sa ?? []) {
      if (!map[a.service_id]) map[a.service_id] = []
      map[a.service_id].push(a.profile_id)
    }
    setAssignments(map)
    setLoading(false)
  }

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    if (!newSvc.nom.trim()) return
    const ordre = (services.length || 0) + 1
    await createClient().from('services').insert({ ecole_id: ecoleId, nom: newSvc.nom.trim(), description: newSvc.description.trim() || null, ordre, actif: true })
    setNewSvc({ nom: '', description: '' })
    await load()
  }

  async function updateService(id: string, patch: any) {
    await createClient().from('services').update(patch).eq('id', id)
    await load()
  }

  async function toggleAgent(serviceId: string, profileId: string) {
    const s = createClient()
    const isAssigned = (assignments[serviceId] || []).includes(profileId)
    if (isAssigned) {
      await s.from('service_agents').delete().eq('service_id', serviceId).eq('profile_id', profileId)
    } else {
      await s.from('service_agents').insert({ service_id: serviceId, profile_id: profileId })
    }
    await load()
  }

  async function moveService(id: string, direction: 'up' | 'down') {
    const idx = services.findIndex(x => x.id === id)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= services.length) return
    const a = services[idx], b = services[swapIdx]
    const s = createClient()
    await s.from('services').update({ ordre: b.ordre }).eq('id', a.id)
    await s.from('services').update({ ordre: a.ordre }).eq('id', b.id)
    await load()
  }

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <div>
      <p style={{ fontSize: 12, color: '#64748B', marginTop: 0 }}>Configurez les services destinataires de la messagerie + les agents qui reçoivent les messages.</p>
      <form onSubmit={createService} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Nouveau service</label>
          <input type="text" value={newSvc.nom} onChange={e => setNewSvc(p => ({ ...p, nom: e.target.value }))} placeholder="Ex : Prof Mendel" required style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Description (opt.)</label>
          <input type="text" value={newSvc.description} onChange={e => setNewSvc(p => ({ ...p, description: e.target.value }))} placeholder="Quand contacter ce service…" style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {services.map((svc, i) => {
          const assigned = assignments[svc.id] || []
          const isEditing = editId === svc.id
          return (
            <div key={svc.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, background: svc.actif ? '#fff' : '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input type="text" defaultValue={svc.nom} onBlur={e => updateService(svc.id, { nom: e.target.value })} style={{ padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, fontWeight: 600 }} />
                      <input type="text" defaultValue={svc.description || ''} onBlur={e => updateService(svc.id, { description: e.target.value || null })} style={{ padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12 }} />
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: svc.actif ? '#1E293B' : '#94A3B8' }}>{svc.nom}{!svc.actif && ' (inactif)'}</div>
                      {svc.description && <div style={{ fontSize: 11, color: '#64748B' }}>{svc.description}</div>}
                      {assigned.length === 0 && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>⚠️ Aucun agent assigné — messages invisibles</div>}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => moveService(svc.id, 'up')} disabled={i === 0} style={{ background: '#F1F5F9', border: 'none', borderRadius: 5, padding: '5px 8px', fontSize: 11, cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveService(svc.id, 'down')} disabled={i === services.length - 1} style={{ background: '#F1F5F9', border: 'none', borderRadius: 5, padding: '5px 8px', fontSize: 11, cursor: i === services.length - 1 ? 'not-allowed' : 'pointer', opacity: i === services.length - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => setEditId(isEditing ? null : svc.id)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 5, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}>{isEditing ? '✓' : '✎'}</button>
                  <button onClick={() => updateService(svc.id, { actif: !svc.actif })} style={{ background: svc.actif ? '#FEF2F2' : '#ECFDF5', color: svc.actif ? '#991B1B' : '#065F46', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{svc.actif ? 'Désactiver' : 'Activer'}</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Agents assignés ({assigned.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {agents.map(a => {
                    const on = assigned.includes(a.id)
                    const nom = `${a.prenom ?? ''} ${a.nom ?? ''}`.trim() || a.id.substring(0, 8)
                    return (
                      <button key={a.id} onClick={() => toggleAgent(svc.id, a.id)} style={{ background: on ? '#2563EB' : '#F1F5F9', color: on ? '#fff' : '#475569', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>{on ? '✓' : '+'} {nom}{a.role === 'super_admin' && ' (super)'}</button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
