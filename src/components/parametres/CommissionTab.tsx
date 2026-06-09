'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

export default function CommissionTab({ ecoleId }: { ecoleId: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [membres, setMembres] = useState<any[]>([])
  const [newM, setNewM] = useState({ prenom: '', nom: '', role_label: '', email: '' })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  useEffect(() => { load() }, [ecoleId])

  async function load() {
    const { data } = await createClient().from('commission_membres').select('*').eq('ecole_id', ecoleId).order('ordre')
    setMembres(data ?? [])
  }

  async function ajouter() {
    if (!newM.nom.trim()) return
    await createClient().from('commission_membres').insert({ ecole_id: ecoleId, ...newM, ordre: membres.length })
    setNewM({ prenom: '', nom: '', role_label: '', email: '' }); await load()
  }

  async function toggle(id: string, actif: boolean) {
    await createClient().from('commission_membres').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimer(id: string) {
    const ok = await confirmDialog({ title: 'Supprimer ce membre ?', danger: true })
    if (!ok) return
    const { error } = await createClient().from('commission_membres').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Membre supprimé'); await load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
        Membres de la commission qui étudient les dossiers de réduction. Chaque membre peut saisir son avis et un tarif proposé.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>PRÉNOM</div><input style={inp} value={newM.prenom} onChange={e => setNewM(p => ({ ...p, prenom: e.target.value }))} placeholder="Avi" /></div>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>NOM</div><input style={inp} value={newM.nom} onChange={e => setNewM(p => ({ ...p, nom: e.target.value }))} placeholder="Cohen" /></div>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>RÔLE</div><input style={inp} value={newM.role_label} onChange={e => setNewM(p => ({ ...p, role_label: e.target.value }))} placeholder="Directeur, Comptable..." /></div>
        <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>EMAIL</div><input style={inp} type="email" value={newM.email} onChange={e => setNewM(p => ({ ...p, email: e.target.value }))} placeholder="email@ecole.fr" /></div>
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Ajouter</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {membres.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', opacity: m.actif ? 1 : 0.5 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {(m.prenom || m.nom)[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{m.prenom} {m.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{m.role_label}{m.email ? ` · ${m.email}` : ''}</div>
            </div>
            <button onClick={() => toggle(m.id, m.actif)} style={{ fontSize: 11, color: m.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              {m.actif ? 'Désactiver' : 'Activer'}
            </button>
            <button onClick={() => supprimer(m.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
