'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type EditForm = {
  secteur_id: string
  tranche_id: string
  nom_poste: string
  montant: string
  obligatoire: boolean
  code_comptable: string
  inclus_dans_reduction: boolean
  groupe_exclusif: string
}

export default function TarifsTab({ ecoleId, annee }: { ecoleId: string; annee: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tranches, setTranches] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [newT, setNewT] = useState({ secteur_id: '', tranche_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '', inclus_dans_reduction: true, groupe_exclusif: '' })
  const [editing, setEditing] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ secteur_id: '', tranche_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '', inclus_dans_reduction: true, groupe_exclusif: '' })
  const [saving, setSaving] = useState(false)
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecoleId, annee])
  async function load() {
    const s = createClient()
    // Sans jointure tranches_facturation (cause un freeze quand la table n'a pas de match). On joint cote front via tranchesMap.
    const [{ data: sec }, { data: tar }, { data: tra }] = await Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', ecoleId).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*, secteurs(nom)').eq('ecole_id', ecoleId).eq('annee_scolaire', annee).order('ordre'),
      s.from('tranches_facturation').select('id, code, libelle').eq('ecole_id', ecoleId).order('ordre'),
    ])
    const tranchesMap = new Map<string, any>()
    ;((tra ?? []) as any[]).forEach(t => tranchesMap.set(t.id, t))
    const tarifsEnriched = ((tar ?? []) as any[]).map(t => ({ ...t, tranches_facturation: t.tranche_id ? tranchesMap.get(t.tranche_id) : null }))
    setSecteurs(sec ?? []); setTarifs(tarifsEnriched); setTranches(tra ?? [])
  }
  async function ajouter() {
    if (!newT.nom_poste.trim() || !newT.montant || parseFloat(newT.montant) <= 0) { toast.error('Poste obligatoire et montant > 0'); return }
    const { error } = await createClient().from('tarifs_secteur').insert({ ecole_id: ecoleId, annee_scolaire: annee, secteur_id: newT.secteur_id || null, tranche_id: newT.tranche_id || null, nom_poste: newT.nom_poste, montant: parseFloat(newT.montant), obligatoire: newT.obligatoire, code_comptable: newT.code_comptable || null, inclus_dans_reduction: newT.inclus_dans_reduction, groupe_exclusif: newT.groupe_exclusif.trim() || null, ordre: tarifs.length })
    if (error) { toast.error('Erreur : ' + error.message); return }
    setNewT({ secteur_id: '', tranche_id: '', nom_poste: '', montant: '', obligatoire: false, code_comptable: '', inclus_dans_reduction: true, groupe_exclusif: '' })
    toast.success('Tarif ajouté')
    await load()
  }
  function ouvrirEdition(t: any) {
    setEditForm({
      secteur_id: t.secteur_id || '',
      tranche_id: t.tranche_id || '',
      nom_poste: t.nom_poste || '',
      montant: String(t.montant ?? ''),
      obligatoire: !!t.obligatoire,
      code_comptable: t.code_comptable || '',
      inclus_dans_reduction: t.inclus_dans_reduction !== false,
      groupe_exclusif: t.groupe_exclusif || '',
    })
    setEditing(t)
  }
  async function enregistrerEdition() {
    if (!editing) return
    if (!editForm.nom_poste.trim() || !editForm.montant || parseFloat(editForm.montant) <= 0) { toast.error('Poste obligatoire et montant > 0'); return }
    setSaving(true)
    const { error } = await createClient().from('tarifs_secteur').update({
      secteur_id: editForm.secteur_id || null,
      tranche_id: editForm.tranche_id || null,
      nom_poste: editForm.nom_poste,
      montant: parseFloat(editForm.montant),
      obligatoire: editForm.obligatoire,
      code_comptable: editForm.code_comptable || null,
      inclus_dans_reduction: editForm.inclus_dans_reduction,
      groupe_exclusif: editForm.groupe_exclusif.trim() || null,
    }).eq('id', editing.id)
    if (error) { toast.error('Erreur : ' + error.message); setSaving(false); return }
    toast.success('Tarif modifié')
    setEditing(null)
    setSaving(false)
    await load()
  }
  async function supprimer(t: any) {
    const ok = await confirmDialog({ title: 'Supprimer ce tarif ?', message: `« ${t.nom_poste} » (${t.montant?.toLocaleString('fr-FR')}€) sera supprimé.`, danger: true })
    if (!ok) return
    const { error } = await createClient().from('tarifs_secteur').delete().eq('id', t.id)
    if (error) { toast.error('Erreur : ' + error.message); return }
    setTarifs(p => p.filter(x => x.id !== t.id))
    toast.success('Tarif supprimé')
  }
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
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
          <input type="checkbox" checked={newT.inclus_dans_reduction} onChange={e => setNewT(p => ({ ...p, inclus_dans_reduction: e.target.checked }))} style={{ marginTop: 2 }} />
          <span>
            <span style={{ fontWeight: 600 }}>Inclus dans la commission DDR</span>
            <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Coché = ce tarif est couvert par le tarif accordé en réduction. Décoché = ce tarif s&apos;ajoute EN PLUS au tarif accordé (typique pour options : cantine, navette, instruction religieuse...).</span>
          </span>
        </label>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>GROUPE EXCLUSIF (optionnel)</div>
          <input style={{ ...inp, maxWidth: 280 }} value={newT.groupe_exclusif} onChange={e => setNewT(p => ({ ...p, groupe_exclusif: e.target.value }))} placeholder="ex : transport" />
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Les tarifs partageant la même valeur sont mutuellement exclusifs (ex : Car et Navette dans «&nbsp;transport&nbsp;» → on ne peut choisir qu&apos;une option). Laisser vide si pas de groupe.</div>
        </div>
      </div>
      {tarifs.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun tarif pour {annee}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>{['Secteur', 'Tranche', 'Poste', 'Montant', 'Code', 'Obligatoire', ''].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
          <tbody>
            {tarifs.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < tarifs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: '#EFF6FF', color: '#2563EB', borderRadius: 5, padding: '2px 8px' }}>{t.secteurs?.nom || 'Tous'}</span></td>
                <td style={{ padding: '11px 14px' }}>{t.tranches_facturation ? <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '2px 8px' }} title={t.tranches_facturation.libelle}>{t.tranches_facturation.code}</span> : <span style={{ fontSize: 11, color: '#CBD5E1' }}>Toutes</span>}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {t.nom_poste}
                    {t.inclus_dans_reduction === false && (
                      <span title="Ce tarif s'ajoute EN PLUS du tarif accordé en commission DDR" style={{ fontSize: 10, background: '#FEF3C7', color: '#B45309', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>💡 Option</span>
                    )}
                    {t.groupe_exclusif && (
                      <span title={`Mutuellement exclusif avec les autres tarifs du groupe "${t.groupe_exclusif}"`} style={{ fontSize: 10, background: '#EDE9FE', color: '#6D28D9', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>↔ {t.groupe_exclusif}</span>
                    )}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#059669' }}>{t.montant?.toLocaleString('fr-FR')}€</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{t.code_comptable || '—'}</td>
                <td style={{ padding: '11px 14px' }}><span style={{ fontSize: 11, background: t.obligatoire ? 'rgba(16,185,129,0.1)' : '#F1F5F9', color: t.obligatoire ? '#10B981' : '#94A3B8', borderRadius: 5, padding: '2px 8px' }}>{t.obligatoire ? '✓ Oui' : 'Non'}</span></td>
                <td style={{ padding: '11px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => ouvrirEdition(t)} title="Modifier ce tarif" style={{ fontSize: 11, color: '#475569', background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>✏️ Modifier</button>
                  <button onClick={() => supprimer(t)} title="Supprimer ce tarif" style={{ fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div onClick={() => !saving && setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>Modifier le tarif</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 18 }}>Mettez à jour les informations du poste « {editing.nom_poste} ».</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>SECTEUR</div>
                  <select style={{ ...inp }} value={editForm.secteur_id} onChange={e => setEditForm(p => ({ ...p, secteur_id: e.target.value }))}>
                    <option value="">Tous</option>
                    {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>TRANCHE</div>
                  <select style={{ ...inp }} value={editForm.tranche_id} onChange={e => setEditForm(p => ({ ...p, tranche_id: e.target.value }))}>
                    <option value="">Toutes</option>
                    {tranches.map(t => <option key={t.id} value={t.id}>{t.code} — {t.libelle}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>POSTE</div>
                <input style={inp} value={editForm.nom_poste} onChange={e => setEditForm(p => ({ ...p, nom_poste: e.target.value }))} placeholder="Scolarité..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>MONTANT €</div>
                  <input style={inp} type="number" value={editForm.montant} onChange={e => setEditForm(p => ({ ...p, montant: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CODE COMPTA</div>
                  <input style={inp} value={editForm.code_comptable} onChange={e => setEditForm(p => ({ ...p, code_comptable: e.target.value }))} placeholder="706xxx" />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.obligatoire} onChange={e => setEditForm(p => ({ ...p, obligatoire: e.target.checked }))} />
                Poste obligatoire (inclus automatiquement)
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.inclus_dans_reduction} onChange={e => setEditForm(p => ({ ...p, inclus_dans_reduction: e.target.checked }))} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontWeight: 600 }}>Inclus dans la commission DDR</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Coché = ce tarif est couvert par le tarif accordé en réduction. Décoché = ce tarif s&apos;ajoute EN PLUS au tarif accordé (typique pour options : cantine, navette, instruction religieuse...).</span>
                </span>
              </label>
              <div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>GROUPE EXCLUSIF (optionnel)</div>
                <input style={inp} value={editForm.groupe_exclusif} onChange={e => setEditForm(p => ({ ...p, groupe_exclusif: e.target.value }))} placeholder="ex : transport" />
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Les tarifs partageant la même valeur sont mutuellement exclusifs dans le contrat (ex : Car et Navette dans «&nbsp;transport&nbsp;»).</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setEditing(null)} disabled={saving} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                Annuler
              </button>
              <button onClick={enregistrerEdition} disabled={saving} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
