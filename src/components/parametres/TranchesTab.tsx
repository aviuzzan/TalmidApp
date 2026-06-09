'use client'
/**
 * TranchesTab — CRUD des tranches de facturation (codes A/B/C/T1/T2).
 * Extrait de parametres/page.tsx pour reduire la taille du monolithe.
 *
 * Une tranche = un code applique a une famille pour determiner quel tarif appliquer
 * lors de la generation des factures. Cf migration familles.tranche_id.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function TranchesTab({ ecoleId }: { ecoleId: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [tranches, setTranches] = useState<any[]>([])
  const [newT, setNewT] = useState({ code: '', libelle: '', description: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, { code: string; libelle: string; description: string }>>({})
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecoleId])

  async function load() {
    const { data } = await createClient().from('tranches_facturation').select('*').eq('ecole_id', ecoleId).order('ordre').order('code')
    const list = data ?? []
    setTranches(list)
    const e: Record<string, any> = {}
    for (const t of list) e[t.id] = { code: t.code, libelle: t.libelle, description: t.description || '' }
    setEdit(e)
  }

  async function ajouter() {
    if (!newT.code.trim() || !newT.libelle.trim()) { toast.error('Code et libellé obligatoires'); return }
    const { error } = await createClient().from('tranches_facturation').insert({
      ecole_id: ecoleId,
      code: newT.code.trim().toUpperCase(),
      libelle: newT.libelle.trim(),
      description: newT.description.trim() || null,
      ordre: tranches.length,
    })
    if (error) { toast.error(error.message); return }
    setNewT({ code: '', libelle: '', description: '' })
    toast.success('Tranche ajoutée')
    await load()
  }

  async function enregistrer(id: string) {
    const v = edit[id]
    if (!v?.code || !v?.libelle) { toast.error('Code et libellé obligatoires'); return }
    const { error } = await createClient().from('tranches_facturation').update({
      code: v.code.trim().toUpperCase(),
      libelle: v.libelle.trim(),
      description: v.description.trim() || null,
    }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setEditId(null)
    toast.success('Tranche enregistrée')
    await load()
  }

  async function supprimer(id: string) {
    const ok = await confirmDialog({ title: 'Supprimer cette tranche ?', message: 'Les tarifs et scolarités liés seront détachés (tranche_id = NULL).', danger: true })
    if (!ok) return
    const { error } = await createClient().from('tranches_facturation').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Tranche supprimée')
    await load()
  }

  function setField(id: string, k: 'code' | 'libelle' | 'description', val: string) {
    setEdit(p => ({ ...p, [id]: { ...p[id], [k]: val } }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
        Les <strong>tranches de facturation</strong> permettent d&apos;avoir des tarifs différenciés par revenu (ou autre critère).
        Affectez ensuite chaque tranche à un tarif et à un élève (sur sa scolarité de l&apos;année).
        Exemples : <code>T1</code> (revenu faible), <code>T2</code> (revenu moyen), <code>TP</code> (tarif plein).
      </div>

      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>AJOUTER UNE TRANCHE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CODE</div><input style={inp} value={newT.code} onChange={e => setNewT(p => ({ ...p, code: e.target.value }))} placeholder="T1" maxLength={10} /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>LIBELLÉ</div><input style={inp} value={newT.libelle} onChange={e => setNewT(p => ({ ...p, libelle: e.target.value }))} placeholder="Tranche 1 (revenu &lt; 25 000 €)" /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>DESCRIPTION</div><input style={inp} value={newT.description} onChange={e => setNewT(p => ({ ...p, description: e.target.value }))} placeholder="Optionnel" /></div>
          <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
        </div>
      </div>

      {tranches.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune tranche configurée</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            {['Code', 'Libellé', 'Description', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {tranches.map((t, i) => {
              const isEditing = editId === t.id
              const v = edit[t.id] || { code: '', libelle: '', description: '' }
              return (
                <tr key={t.id} style={{ borderBottom: i < tranches.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#4338CA' }}>
                    {isEditing ? <input style={{ ...inp, padding: '5px 8px', fontSize: 12 }} value={v.code} onChange={e => setField(t.id, 'code', e.target.value)} /> : t.code}
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 500 }}>
                    {isEditing ? <input style={{ ...inp, padding: '5px 8px', fontSize: 12 }} value={v.libelle} onChange={e => setField(t.id, 'libelle', e.target.value)} /> : t.libelle}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>
                    {isEditing ? <input style={{ ...inp, padding: '5px 8px', fontSize: 12 }} value={v.description} onChange={e => setField(t.id, 'description', e.target.value)} /> : (t.description || '—')}
                  </td>
                  <td style={{ padding: '11px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {isEditing ? (
                      <>
                        <button onClick={() => enregistrer(t.id)} style={{ fontSize: 11, color: '#fff', background: '#2563EB', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>Enregistrer</button>
                        <button onClick={() => setEditId(null)} style={{ fontSize: 11, color: '#64748B', background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditId(t.id)} style={{ fontSize: 11, color: '#475569', background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Modifier</button>
                        <button onClick={() => supprimer(t.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
