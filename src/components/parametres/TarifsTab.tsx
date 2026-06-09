'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function TarifsTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tranches, setTranches] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [newT, setNewT] = useState({ secteur_id: '', tranche_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '' })
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  useEffect(() => {
    const s = createClient()
    // Sans jointure tranches_facturation (cause un freeze quand la table n'a pas de match). On joint cote front via tranchesMap.
    Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre'),
      s.from('tranches_facturation').select('id, code, libelle').eq('ecole_id', ecoleId).order('ordre'),
    ]).then(([{ data: sec }, { data: tar }, { data: tra }]) => {
      const tranchesMap = new Map<string, any>()
      ;((tra ?? []) as any[]).forEach(t => tranchesMap.set(t.id, t))
      const tarifsEnriched = ((tar ?? []) as any[]).map(t => ({ ...t, tranches_facturation: t.tranche_id ? tranchesMap.get(t.tranche_id) : null }))
      setSecteurs(sec ?? []); setTarifs(tarifsEnriched); setTranches(tra ?? [])
    })
  }, [ecoleId, annee])
  async function ajouter() {
    if (!newT.nom_poste || !newT.montant) return
    await createClient().from('tarifs_secteur').insert({ ecole_id: ecoleId, annee_scolaire: annee, secteur_id: newT.secteur_id || null, tranche_id: newT.tranche_id || null, nom_poste: newT.nom_poste, montant: parseFloat(newT.montant), obligatoire: newT.obligatoire, code_comptable: newT.code_comptable || null, ordre: tarifs.length })
    const { data } = await createClient().from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre')
    const tranchesMap = new Map<string, any>()
    tranches.forEach((t: any) => tranchesMap.set(t.id, t))
    const enriched = ((data ?? []) as any[]).map(t => ({ ...t, tranches_facturation: t.tranche_id ? tranchesMap.get(t.tranche_id) : null }))
    setTarifs(enriched); setNewT({ secteur_id: '', tranche_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '' })
  }
  async function supprimer(id: string) { await createClient().from('tarifs_secteur').delete().eq('id', id); setTarifs(p => p.filter(t => t.id !== id)) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>AJOUTER UN POSTE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.6fr 1fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>SECTEUR</div><select style={{ ...inp }} value={newT.secteur_id} onChange={e => setNewT(p => ({ ...p, secteur_id: e.target.value }))}><option value="">Tous</option>{secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>TRANCHE</div><select style={{ ...inp }} value={newT.tranche_id} onChange={e => setNewT(p => ({ ...p, tranche_id: e.target.value }))}><option value="">Toutes</option>{tranches.map(t => <option key={t.id} value={t.id}>{t.code} — {t.libelle}</option>)}</select></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>POSTE</div><input style={inp} value={newT.nom_poste} onChange={e => setNewT(p => ({ ...p, nom_poste: e.target.value }))} placeholder="Scolarité..." /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>MONTANT €</div><input style={inp} type="number" value={newT.montant} onChange={e => setNewT(p => ({ ...p, montant: e.target.value }))} /></div>
          <div><div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CODE COMPTA</div><input style={inp} value={newT.code_comptable} onChange={e => setNewT(p => ({ ...p, code_comptable: e.target.value }))} placeholder="706xxx" /></div>
          <button onClick={ajouter} style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
          <input type="checkbox" checked={newT.obligatoire} onChange={e => setNewT(p => ({ ...p, obligatoire: e.target.checked }))} />
          Poste obligatoire (inclus automatiquement)
        </label>
      </div>
      {tarifs.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun tarif pour {annee}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Secteur', 'Tranche', 'Poste', 'Montant', 'Code', 'Obligatoire', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {tarifs.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tarifs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: '#EFF6FF', color: '#2563EB', borderRadius: 5, padding: '2px 8px' }}>{t.secteurs?.nom || 'Tous'}</span></td>
                <td style={{ padding: '11px 14px' }}>{t.tranches_facturation ? <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '2px 8px' }} title={t.tranches_facturation.libelle}>{t.tranches_facturation.code}</span> : <span style={{ fontSize: 11, color: '#CBD5E1' }}>Toutes</span>}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500 }}>{t.nom_poste}</td>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{t.montant?.toLocaleString('fr-FR')}€</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{t.code_comptable || '—'}</td>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: t.obligatoire ? 'rgba(16,185,129,0.1)' : '#F1F5F9', color: t.obligatoire ? '#10B981' : '#94A3B8', borderRadius: 5, padding: '2px 8px' }}>{t.obligatoire ? '✓ Oui' : 'Non'}</span></td>
                <td style={{ padding: '11px 14px' }}><button onClick={() => supprimer(t.id)} style={{ fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
