'use client'
/**
 * ClassesTab — CRUD des classes de l'école. Une classe est rattachée à un secteur optionnel.
 * Extrait de parametres/page.tsx.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ClassesTab({ ecoleId }: { ecoleId: string }) {
  const [classes, setClasses] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [newNom, setNewNom] = useState('')
  const [newSecteur, setNewSecteur] = useState('')
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  useEffect(() => {
    const s = createClient()
    Promise.all([
      s.from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', ecoleId).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
    ]).then(([{ data: cl }, { data: sec }]) => { setClasses(cl ?? []); setSecteurs(sec ?? []) })
  }, [ecoleId])

  async function ajouter() {
    if (!newNom.trim()) return
    await createClient().from('classes').insert({ ecole_id: ecoleId, nom: newNom.trim(), secteur_id: newSecteur || null })
    const { data } = await createClient().from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', ecoleId).order('nom')
    setClasses(data ?? []); setNewNom('')
  }

  async function supprimer(id: string) {
    await createClient().from('classes').delete().eq('id', id)
    setClasses(p => p.filter(c => c.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input style={{ ...inp, flex: 1 }} value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom de la classe" onKeyDown={e => e.key === 'Enter' && ajouter()} />
        <select style={{ ...inp, width: 'auto' }} value={newSecteur} onChange={e => setNewSecteur(e.target.value)}>
          <option value="">Secteur (optionnel)</option>
          {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {classes.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
            {c.nom}
            {c.secteurs && <span style={{ fontSize: 10, color: '#94A3B8' }}>({c.secteurs.nom})</span>}
            <button onClick={() => supprimer(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
