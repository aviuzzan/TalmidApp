'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function DocumentsInscriptionTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [docs, setDocs] = useState<any[]>([])
  const [newDoc, setNewDoc] = useState({ label: '', description: '', obligatoire: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [ecoleId, annee])

  async function load() {
    const { data } = await createClient()
      .from('inscription_documents_config').select('*')
      .eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre')
    setDocs(data ?? [])
  }

  async function ajouter() {
    if (!newDoc.label.trim()) return
    setSaving(true)
    await createClient().from('inscription_documents_config').insert({
      ecole_id: ecoleId, annee_scolaire: annee,
      label: newDoc.label.trim(), description: newDoc.description.trim() || null,
      obligatoire: newDoc.obligatoire, ordre: docs.length,
    })
    setNewDoc({ label: '', description: '', obligatoire: true })
    await load(); setSaving(false)
  }

  async function toggle(id: string, actif: boolean) {
    await createClient().from('inscription_documents_config').update({ actif: !actif }).eq('id', id); await load()
  }

  async function supprimer(id: string) {
    await createClient().from('inscription_documents_config').delete().eq('id', id); await load()
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>📎 Documents à fournir — Inscription d&apos;un nouvel enfant</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
          Ces pièces justificatives sont demandées aux familles dans l&apos;espace famille › Année N+1 › Ajouter un nouvel enfant. Elles sont rattachées à l&apos;enfant créé.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto auto', gap: 8, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>LIBELLÉ</div>
          <input style={{ ...inp, width: '100%' }} value={newDoc.label} onChange={e => setNewDoc(p => ({ ...p, label: e.target.value }))}
            placeholder="Ex: Acte de naissance" onKeyDown={e => e.key === 'Enter' && ajouter()} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3 }}>DESCRIPTION (OPTIONNEL)</div>
          <input style={{ ...inp, width: '100%' }} value={newDoc.description} onChange={e => setNewDoc(p => ({ ...p, description: e.target.value }))}
            placeholder="Ex: Copie intégrale de moins de 3 mois" onKeyDown={e => e.key === 'Enter' && ajouter()} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={newDoc.obligatoire} onChange={e => setNewDoc(p => ({ ...p, obligatoire: e.target.checked }))} />
          Obligatoire
        </label>
        <button onClick={ajouter} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Ajouter
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {docs.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>Aucun document configuré pour {annee}.</div>}
        {docs.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', opacity: d.actif ? 1 : 0.5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.actif ? '#10B981' : '#CBD5E1', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#1E293B' }}>{d.label}</div>
              {d.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{d.description}</div>}
            </div>
            {d.obligatoire && <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 600 }}>OBLIGATOIRE</span>}
            <button onClick={() => toggle(d.id, d.actif)} style={{ fontSize: 11, color: d.actif ? '#64748B' : '#10B981', background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
              {d.actif ? 'Désactiver' : 'Activer'}
            </button>
            <button onClick={() => supprimer(d.id)} style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
