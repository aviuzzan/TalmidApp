'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const SITUATIONS: any = {
  marie: 'Marié(e)', celibataire: 'Célibataire', divorce: 'Divorcé(e)',
  veuf: 'Veuf/Veuve', separe: 'Séparé(e)', non_connu: 'Non connue'
}

export default function FamilleDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string

  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [transports, setTransports] = useState<any[]>([])
  const [facture, setFacture] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [modesPaiement, setModesPaiement] = useState<any[]>([])

  const initialTab = searchParams.get('tab') === 'facturation' ? 'facturation' : 'infos'
  const [tab, setTab] = useState<'infos' | 'enfants' | 'facturation'>(initialTab as any)
  const [showEnfantForm, setShowEnfantForm] = useState(false)
  const [showLigneForm, setShowLigneForm] = useState(false)
  const [showReglementForm, setShowReglementForm] = useState(false)
  const [editEnfantId, setEditEnfantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const ANNEE = '2025/2026'

  const emptyEnfant = {
    prenom: '', deuxieme_prenom: '', nom: '', date_naissance: '', genre: '',
    lieu_naissance: '', classe: '', regime: 'demi_pension', statut_inscription: 'en_attente',
    date_entree: '', date_sortie: '', etablissement_origine: '', transport: '',
    annee_scolaire: ANNEE,
  }
  const [enfantForm, setEnfantForm] = useState(emptyEnfant)
  const emptyLigne = { enfant_id: '', tarif_id: '', description: '', montant: '' }
  const [ligneForm, setLigneForm] = useState(emptyLigne)
  const emptyReglement = { montant: '', date_reglement: new Date().toISOString().split('T')[0], mode_paiement: '', reference: '', notes: '' }
  const [reglementForm, setReglementForm] = useState(emptyReglement)

  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: fam }, { data: enf }, { data: cls }, { data: trp }, { data: modes }, { data: tar }] = await Promise.all([
      supabase.from('familles').select('*').eq('id', id).single(),
      supabase.from('enfants').select('*').eq('famille_id', id).order('nom'),
      supabase.from('classes').select('*').order('ordre'),
      supabase.from('transports').select('*').order('nom'),
      supabase.from('modes_paiement').select('*').order('libelle'),
      supabase.from('tarifs').select('*').eq('annee_scolaire', ANNEE).order('nom'),
    ])
    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? [])
    setTransports(trp ?? []); setModesPaiement(modes ?? []); setTarifs(tar ?? [])

    const { data: fact } = await supabase.from('factures_solde').select('*').eq('famille_id', id).eq('annee_scolaire', ANNEE).single()
    if (fact) {
      setFacture(fact)
      const [{ data: lig }, { data: regl }] = await Promise.all([
        supabase.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', fact.id).order('date_creation'),
        supabase.from('reglements').select('*').eq('facture_id', fact.id).order('date_reglement', { ascending: false }),
      ])
      setLignes(lig ?? []); setReglements(regl ?? [])
    } else { setFacture(null); setLignes([]); setReglements([]) }
  }, [id])

  useEffect(() => { load() }, [load])

  function setE(k: string, v: any) { setEnfantForm(p => ({ ...p, [k]: v })) }

  function openEditEnfant(e: any) {
    setEnfantForm({
      prenom: e.prenom ?? '', deuxieme_prenom: e.deuxieme_prenom ?? '',
      nom: e.nom ?? '', date_naissance: e.date_naissance ?? '',
      genre: e.genre ?? '', lieu_naissance: e.lieu_naissance ?? '',
      classe: e.classe ?? '', regime: e.regime ?? 'demi_pension',
      statut_inscription: e.statut_inscription ?? 'en_attente',
      date_entree: e.date_entree ?? '', date_sortie: e.date_sortie ?? '',
      etablissement_origine: e.etablissement_origine ?? '',
      transport: e.transport ?? '', annee_scolaire: e.annee_scolaire ?? ANNEE,
    })
    setEditEnfantId(e.id); setShowEnfantForm(true); setError('')
  }

  async function saveEnfant(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      famille_id: id, prenom: enfantForm.prenom, deuxieme_prenom: enfantForm.deuxieme_prenom || null,
      nom: enfantForm.nom, date_naissance: enfantForm.date_naissance || null,
      genre: enfantForm.genre || null, lieu_naissance: enfantForm.lieu_naissance || null,
      classe: enfantForm.classe || null, regime: enfantForm.regime || 'demi_pension',
      statut_inscription: enfantForm.statut_inscription,
      date_entree: enfantForm.date_entree || null, date_sortie: enfantForm.date_sortie || null,
      etablissement_origine: enfantForm.etablissement_origine || null,
      transport: enfantForm.transport || null, annee_scolaire: enfantForm.annee_scolaire,
    }
    const { error: err } = editEnfantId
      ? await supabase.from('enfants').update(payload).eq('id', editEnfantId)
      : await supabase.from('enfants').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setShowEnfantForm(false); setEditEnfantId(null); setEnfantForm(emptyEnfant); load(); setSaving(false)
  }

  async function deleteEnfant(enfantId: string) {
    if (!confirm('Supprimer cet élève ?')) return
    await supabase.from('enfants').delete().eq('id', enfantId)
    load()
  }

  async function creerFacture() {
    setSaving(true)
    await supabase.from('factures').insert({ famille_id: id, annee_scolaire: ANNEE })
    load(); setSaving(false)
  }

  function onTarifChange(tarifId: string) {
    const tarif = tarifs.find(t => t.id === tarifId)
    const enfant = enfants.find(e => e.id === ligneForm.enfant_id)
    setLigneForm(p => ({
      ...p, tarif_id: tarifId,
      montant: tarif ? tarif.montant.toString() : p.montant,
      description: tarif && enfant ? `${tarif.nom} — ${enfant.prenom} ${enfant.nom}` : p.description,
    }))
  }

  function onEnfantChange(enfantId: string) {
    const enfant = enfants.find(e => e.id === enfantId)
    const tarif = tarifs.find(t => t.id === ligneForm.tarif_id)
    setLigneForm(p => ({
      ...p, enfant_id: enfantId,
      description: tarif && enfant ? `${tarif.nom} — ${enfant.prenom} ${enfant.nom}` : p.description,
    }))
  }

  async function saveLigne(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('facture_lignes').insert({
      facture_id: facture.id, enfant_id: ligneForm.enfant_id,
      tarif_id: ligneForm.tarif_id || null, description: ligneForm.description,
      montant: parseFloat(ligneForm.montant),
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowLigneForm(false); setLigneForm(emptyLigne); load(); setSaving(false)
  }

  async function deleteLigne(ligneId: string) {
    if (!confirm('Supprimer cette ligne ?')) return
    await supabase.from('facture_lignes').delete().eq('id', ligneId)
    load()
  }

  async function saveReglement(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('reglements').insert({
      facture_id: facture.id, famille_id: id,
      montant: parseFloat(reglementForm.montant),
      date_reglement: reglementForm.date_reglement,
      mode_paiement: reglementForm.mode_paiement,
      reference: reglementForm.reference || null,
      notes: reglementForm.notes || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    const newTotal = reglements.reduce((s, r) => s + Number(r.montant), 0) + parseFloat(reglementForm.montant)
    const statut = newTotal >= Number(facture.total_facture) ? 'solde' : newTotal > 0 ? 'partiel' : 'en_attente'
    await supabase.from('factures').update({ statut }).eq('id', facture.id)
    setShowReglementForm(false); setReglementForm(emptyReglement); load(); setSaving(false)
  }

  async function deleteReglement(reglId: string) {
    if (!confirm('Supprimer ce règlement ?')) return
    await supabase.from('reglements').delete().eq('id', reglId)
    load()
  }

  if (!famille) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}><div style={{ color: '#64748B' }}>Chargement...</div></div>

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }
  const lbl = (t: string, req?: boolean) => <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>{t}{req && <span style={{ color: '#DC2626' }}> *</span>}</label>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.push('/familles')} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour</button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{famille.nom}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>{famille.numero}</span>
            {famille.situation_maritale && <span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{SITUATIONS[famille.situation_maritale]}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E2E8F0' }}>
        {[{ id: 'infos', label: '👤 Informations' }, { id: 'enfants', label: `🎓 Élèves (${enfants.length})` }, { id: 'facturation', label: '💰 Facturation' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: 'transparent', color: tab === t.id ? '#2563EB' : '#64748B', borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent', marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* INFOS */}
      {tab === 'infos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { title: '👤 Parent 1', data: [['Prénom Nom', `${famille.parent1_prenom ?? ''} ${famille.parent1_nom ?? ''}`], ['Email', famille.parent1_email], ['Téléphone', famille.parent1_telephone], ['Emploi', famille.parent1_emploi], ['Adresse', [famille.parent1_numero_rue, famille.parent1_code_postal, famille.parent1_ville].filter(Boolean).join(' ') || '—']] },
            { title: '👤 Parent 2', data: [['Prénom Nom', `${famille.parent2_prenom ?? ''} ${famille.parent2_nom ?? ''}`], ['Email', famille.parent2_email], ['Téléphone', famille.parent2_telephone], ['Emploi', famille.parent2_emploi], ['Adresse', famille.parent2_ville ? [famille.parent2_numero_rue, famille.parent2_code_postal, famille.parent2_ville].filter(Boolean).join(' ') : 'Identique au parent 1']] },
          ].map(({ title, data }) => (
            <div key={title} className="card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{title}</h3>
              {data.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>{label}</span>
                  <span style={{ fontWeight: 500, color: value ? '#1E293B' : '#CBD5E1', textAlign: 'right', maxWidth: '60%' }}>{value || '—'}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>💰 Financier</h3>
            {[['Mode de paiement', famille.mode_paiement ?? '—'], ['Répartition', famille.part_pere != null ? `Parent 1: ${famille.part_pere}% / Parent 2: ${famille.part_mere}%` : '—']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ENFANTS */}
      {tab === 'enfants' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={() => { setEnfantForm(emptyEnfant); setEditEnfantId(null); setShowEnfantForm(true); setError('') }}>+ Ajouter un élève</button>
          </div>
          {enfants.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#94A3B8' }}>Aucun élève enregistré</div>
          ) : enfants.map(e => (
            <div key={e.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{e.genre === 'M' ? '👦' : e.genre === 'F' ? '👧' : '🧒'}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.prenom} {e.deuxieme_prenom ? `(${e.deuxieme_prenom})` : ''} {e.nom}</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {e.classe && <span style={{ marginRight: 8 }}>📚 {e.classe}</span>}
                    {e.regime && <span style={{ marginRight: 8 }}>🍽 {e.regime === 'demi_pension' ? 'Demi-pension' : e.regime === 'externe' ? 'Externe' : 'Interne'}</span>}
                    <span>📅 {e.annee_scolaire}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ background: e.statut_inscription === 'inscrit' ? '#ECFDF5' : '#FFFBEB', color: e.statut_inscription === 'inscrit' ? '#059669' : '#D97706', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                  {e.statut_inscription === 'inscrit' ? '✓ Inscrit' : '⏳ En attente'}
                </span>
                <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openEditEnfant(e)}>✏️</button>
                <button className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => deleteEnfant(e.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FACTURATION */}
      {tab === 'facturation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!facture ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <div style={{ color: '#475569', fontSize: 14, marginBottom: 20 }}>Aucune facture pour {ANNEE}</div>
              <button className="btn-primary" onClick={creerFacture} disabled={saving}>{saving ? 'Création...' : '+ Créer la facture'}</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: 'Total facturé', value: `${Number(facture.total_facture).toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
                  { label: 'Total réglé', value: `${Number(facture.total_regle).toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
                  { label: 'Solde restant', value: `${Number(facture.solde_restant).toLocaleString('fr-FR')} €`, color: Number(facture.solde_restant) > 0 ? '#DC2626' : '#059669', bg: Number(facture.solde_restant) > 0 ? '#FEF2F2' : '#ECFDF5' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>📋 Détail par élève</h3>
                  <button className="btn-secondary" style={{ padding: '5px 14px', fontSize: 12 }} onClick={() => { setLigneForm(emptyLigne); setShowLigneForm(true) }}>+ Ajouter</button>
                </div>
                {lignes.length === 0 ? <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune ligne</div> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      {['Élève', 'Description', 'Montant', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>{lignes.map((l, i) => (
                      <tr key={l.id} style={{ borderBottom: i < lignes.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{l.enfants?.prenom} {l.enfants?.nom}</td>
                        <td style={{ padding: '10px 12px', color: '#475569', fontSize: 13 }}>{l.description}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{Number(l.montant).toLocaleString('fr-FR')} €</td>
                        <td style={{ padding: '10px 12px' }}><button onClick={() => deleteLigne(l.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer' }}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>💳 Règlements reçus</h3>
                  <button className="btn-primary" style={{ padding: '5px 14px', fontSize: 12 }} onClick={() => { setReglementForm(emptyReglement); setShowReglementForm(true) }}>+ Règlement</button>
                </div>
                {reglements.length === 0 ? <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucun règlement</div> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      {['Date', 'Mode', 'Référence', 'Montant', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>{reglements.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: i < reglements.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '10px 12px' }}><span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{r.mode_paiement}</span></td>
                        <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 13 }}>{r.reference || '—'}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                        <td style={{ padding: '10px 12px' }}><button onClick={() => deleteReglement(r.id)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer' }}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal ligne */}
      {showLigneForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}><h2 style={{ fontSize: 17, fontWeight: 700 }}>➕ Ajouter une ligne</h2><button onClick={() => setShowLigneForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B' }}>✕</button></div>
            <form onSubmit={saveLigne} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>{lbl('Élève', true)}<select style={inp} value={ligneForm.enfant_id} onChange={e => onEnfantChange(e.target.value)} required><option value="">-- Sélectionner --</option>{enfants.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}</select></div>
              <div>{lbl('Tarif')}<select style={inp} value={ligneForm.tarif_id} onChange={e => onTarifChange(e.target.value)}><option value="">-- Sélectionner --</option>{tarifs.map(t => <option key={t.id} value={t.id}>{t.nom} — {Number(t.montant).toLocaleString('fr-FR')} €</option>)}</select></div>
              <div>{lbl('Description', true)}<input style={inp} value={ligneForm.description} onChange={e => setLigneForm(p => ({ ...p, description: e.target.value }))} required /></div>
              <div>{lbl('Montant (€)', true)}<input style={inp} type="number" min="0" step="0.01" value={ligneForm.montant} onChange={e => setLigneForm(p => ({ ...p, montant: e.target.value }))} required /></div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn-secondary" onClick={() => setShowLigneForm(false)}>Annuler</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : '✓ Ajouter'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal règlement */}
      {showReglementForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}><h2 style={{ fontSize: 17, fontWeight: 700 }}>💳 Enregistrer un règlement</h2><button onClick={() => setShowReglementForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B' }}>✕</button></div>
            <form onSubmit={saveReglement} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>{lbl('Montant (€)', true)}<input style={inp} type="number" min="0" step="0.01" value={reglementForm.montant} onChange={e => setReglementForm(p => ({ ...p, montant: e.target.value }))} required /></div>
              <div>{lbl('Date', true)}<input style={inp} type="date" value={reglementForm.date_reglement} onChange={e => setReglementForm(p => ({ ...p, date_reglement: e.target.value }))} required /></div>
              <div>{lbl('Mode de paiement', true)}<select style={inp} value={reglementForm.mode_paiement} onChange={e => setReglementForm(p => ({ ...p, mode_paiement: e.target.value }))} required><option value="">-- Sélectionner --</option>{modesPaiement.map((m: any) => <option key={m.id} value={m.libelle}>{m.libelle}</option>)}</select></div>
              <div>{lbl('Référence')}<input style={inp} value={reglementForm.reference} onChange={e => setReglementForm(p => ({ ...p, reference: e.target.value }))} placeholder="N° chèque, référence virement..." /></div>
              <div>{lbl('Notes')}<input style={inp} value={reglementForm.notes} onChange={e => setReglementForm(p => ({ ...p, notes: e.target.value }))} /></div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn-secondary" onClick={() => setShowReglementForm(false)}>Annuler</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : '✓ Enregistrer'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal enfant */}
      {showEnfantForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '22px 26px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>{editEnfantId ? '✏️ Modifier' : '➕ Nouvel élève'}</h2>
              <button onClick={() => setShowEnfantForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <form onSubmit={saveEnfant} style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Identité</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>{lbl('Prénom', true)}<input style={inp} value={enfantForm.prenom} onChange={e => setE('prenom', e.target.value)} required /></div>
                  <div>{lbl('2ème prénom')}<input style={inp} value={enfantForm.deuxieme_prenom} onChange={e => setE('deuxieme_prenom', e.target.value)} /></div>
                  <div>{lbl('Nom', true)}<input style={inp} value={enfantForm.nom} onChange={e => setE('nom', e.target.value)} required /></div>
                  <div>{lbl('Genre', true)}<select style={inp} value={enfantForm.genre} onChange={e => setE('genre', e.target.value)} required><option value="">-- Sélectionner --</option><option value="M">👦 Garçon</option><option value="F">👧 Fille</option></select></div>
                  <div>{lbl('Date de naissance', true)}<input style={inp} type="date" value={enfantForm.date_naissance} onChange={e => setE('date_naissance', e.target.value)} required /></div>
                  <div>{lbl('Lieu de naissance')}<input style={inp} value={enfantForm.lieu_naissance} onChange={e => setE('lieu_naissance', e.target.value)} /></div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Scolarité</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>{lbl('Classe', true)}<select style={inp} value={enfantForm.classe} onChange={e => setE('classe', e.target.value)} required><option value="">-- Sélectionner --</option>{classes.map((c: any) => <option key={c.id} value={c.nom}>{c.nom}</option>)}</select></div>
                  <div>{lbl('Régime', true)}<select style={inp} value={enfantForm.regime} onChange={e => setE('regime', e.target.value)}><option value="demi_pension">🍽 Demi-pension</option><option value="externe">🏠 Externe</option><option value="interne">🛏 Interne</option></select></div>
                  <div>{lbl('Statut')}<select style={inp} value={enfantForm.statut_inscription} onChange={e => setE('statut_inscription', e.target.value)}><option value="en_attente">⏳ En attente</option><option value="inscrit">✓ Inscrit</option><option value="refuse">✗ Refusé</option></select></div>
                  <div>{lbl('Année scolaire')}<select style={inp} value={enfantForm.annee_scolaire} onChange={e => setE('annee_scolaire', e.target.value)}><option value="2025/2026">2025/2026</option><option value="2026/2027">2026/2027</option></select></div>
                  <div>{lbl('Date d\'entrée', true)}<input style={inp} type="date" value={enfantForm.date_entree} onChange={e => setE('date_entree', e.target.value)} required /></div>
                  <div>{lbl('Date de sortie')}<input style={inp} type="date" value={enfantForm.date_sortie} onChange={e => setE('date_sortie', e.target.value)} /></div>
                  <div>{lbl('Établissement d\'origine')}<input style={inp} value={enfantForm.etablissement_origine} onChange={e => setE('etablissement_origine', e.target.value)} /></div>
                  <div>{lbl('Transport')}<select style={inp} value={enfantForm.transport} onChange={e => setE('transport', e.target.value)}><option value="">Aucun</option>{transports.map((t: any) => <option key={t.id} value={t.nom}>{t.nom}</option>)}</select></div>
                </div>
              </div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowEnfantForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : editEnfantId ? '✓ Mettre à jour' : '✓ Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
