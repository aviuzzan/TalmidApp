'use client'
/**
 * SecteursTab — CRUD des secteurs (établissements / cycles distincts).
 * Chaque secteur a un nom, un code, un préfixe de facture (numérotation propre).
 * Extrait de parametres/page.tsx.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export default function SecteursTab({ ecoleId }: { ecoleId: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [newNom, setNewNom] = useState('')
  const [edit, setEdit] = useState<Record<string, { nom: string; code: string; prefixe_facture: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', flex: 1, boxSizing: 'border-box' as const }
  const inpSm = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecoleId])

  async function load() {
    const { data } = await createClient().from('secteurs').select('*, classes(id, nom)').eq('ecole_id', ecoleId).order('ordre')
    const list = data ?? []
    setSecteurs(list)
    const e: Record<string, { nom: string; code: string; prefixe_facture: string }> = {}
    for (const s of list) e[s.id] = { nom: s.nom || '', code: s.code || '', prefixe_facture: s.prefixe_facture || '' }
    setEdit(e)
  }

  async function ajouter() {
    if (!newNom.trim()) return
    await createClient().from('secteurs').insert({ ecole_id: ecoleId, nom: newNom.trim(), ordre: secteurs.length })
    setNewNom(''); await load()
  }

  async function enregistrer(id: string) {
    const v = edit[id]
    if (!v || !v.nom.trim()) { toast.error('Le nom du secteur est obligatoire'); return }
    setSavingId(id)
    const { error } = await createClient().from('secteurs').update({
      nom: v.nom.trim(),
      code: v.code.trim() || null,
      prefixe_facture: v.prefixe_facture.trim().toUpperCase() || null,
    }).eq('id', id)
    setSavingId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Secteur enregistré'); await load()
  }

  async function supprimer(id: string) {
    const ok = await confirmDialog({ title: 'Supprimer ce secteur ?', danger: true })
    if (!ok) return
    const { error } = await createClient().from('secteurs').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Secteur supprimé'); await load()
  }

  function setField(id: string, k: 'nom' | 'code' | 'prefixe_facture', val: string) {
    setEdit(p => ({ ...p, [id]: { ...p[id], [k]: val } }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px' }}>
        Un secteur représente un établissement ou un cycle distinct. Le <strong>code</strong> sert d&apos;identifiant interne ; le <strong>préfixe de facture</strong> donne une numérotation propre (ex. <code>FLAN</code> → <code>FLAN-2026-0001</code>). Sans préfixe, la numérotation reste <code>FACT-…</code>.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input style={inp} value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom du nouveau secteur..." onKeyDown={e => e.key === 'Enter' && ajouter()} />
        <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Ajouter</button>
      </div>
      {secteurs.map(s => {
        const v = edit[s.id] || { nom: '', code: '', prefixe_facture: '' }
        return (
          <div key={s.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', padding: '12px 16px', background: '#F8FAFC', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 160px' }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>NOM</div>
                <input style={{ ...inpSm, width: '100%' }} value={v.nom} onChange={e => setField(s.id, 'nom', e.target.value)} />
              </div>
              <div style={{ flex: '1 1 90px' }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>CODE</div>
                <input style={{ ...inpSm, width: '100%' }} value={v.code} onChange={e => setField(s.id, 'code', e.target.value)} placeholder="ex. FLAN" />
              </div>
              <div style={{ flex: '1 1 110px' }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>PRÉFIXE FACTURE</div>
                <input style={{ ...inpSm, width: '100%' }} value={v.prefixe_facture} onChange={e => setField(s.id, 'prefixe_facture', e.target.value)} placeholder="FACT" />
              </div>
              <button onClick={() => enregistrer(s.id)} disabled={savingId === s.id}
                style={{ background: '#2563EB', border: 'none', borderRadius: 7, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {savingId === s.id ? '…' : 'Enregistrer'}
              </button>
              <button onClick={() => supprimer(s.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 7, padding: '8px 12px', cursor: 'pointer' }}>Supprimer</button>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{s.classes?.length || 0} classe(s) :</span>
              {(s.classes || []).map((c: any) => <span key={c.id} style={{ fontSize: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px' }}>{c.nom}</span>)}
              {(s.classes?.length || 0) === 0 && <span style={{ fontSize: 12, color: '#CBD5E1' }}>aucune classe rattachée</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
