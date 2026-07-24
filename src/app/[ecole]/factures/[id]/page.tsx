'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { labelModePaiement, labelStatutFacture } from '@/lib/statuts'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { calculerEcartFactureContrat, regenererFactureDepuisContrat } from '@/lib/facture-contrat'
import { logAction } from '@/lib/audit-log'

/**
 * Vue facture dédiée admin (simplification UX — audit pt 22).
 * Tout au même endroit : lignes, règlements, avoirs imputés, échéancier,
 * boutons Imprimer / Encaisser / Verrouiller / Régénérer.
 */
export default function FactureDetailPage() {
  const params = useParams()
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()
  const factureId = params.id as string

  const [facture, setFacture] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [imputations, setImputations] = useState<any[]>([])
  const [echeances, setEcheances] = useState<any[]>([])
  const [ecart, setEcart] = useState<any>(null)
  const [contratAnnee, setContratAnnee] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showEncaisser, setShowEncaisser] = useState(false)
  const [encForm, setEncForm] = useState<any>({ montant: '', mode_paiement: 'virement', date_reglement: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
  const [modesEcole, setModesEcole] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const s = createClient()
    const { data: fact } = await s.from('factures_solde').select('*').eq('id', factureId).maybeSingle()
    if (!fact) { setFacture(null); setLoading(false); return }
    setFacture(fact)
    const [{ data: fam }, { data: lig }, { data: regl }, { data: imp }, { data: ech }, { data: modes }] = await Promise.all([
      s.from('familles').select('id, nom, numero, parent1_prenom, parent1_nom, parent1_email, parent1_telephone').eq('id', fact.famille_id).maybeSingle(),
      s.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', factureId).order('date_creation'),
      s.from('reglements').select('*').eq('facture_id', factureId).order('date_reglement', { ascending: false }),
      s.from('avoirs_imputations').select('*, avoirs(numero, motif)').eq('facture_id', factureId),
      s.from('cheques_prevus').select('*').eq('famille_id', fact.famille_id).order('date_echeance'),
      s.from('modes_reglement_ecole').select('type, label').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
    ])
    setFamille(fam); setLignes(lig ?? []); setReglements(regl ?? []); setImputations(imp ?? []); setEcheances(ech ?? []); setModesEcole(modes ?? [])
    setEncForm((p: any) => ({ ...p, montant: String(fact.solde_restant || '') }))
    // Écart facture/contrat
    try {
      const { data: contrat } = await s.from('contrats_scolarisation')
        .select('*, contrat_enfants(*, enfants(prenom, nom))')
        .eq('famille_id', fact.famille_id).eq('annee_scolaire', fact.annee_scolaire)
        .in('statut', ['valide', 'accepte', 'soumis']).maybeSingle()
      if (contrat) {
        setContratAnnee(contrat)
        setEcart(await calculerEcartFactureContrat(s, contrat, ecole.id, fact.annee_scolaire))
      }
    } catch { /* pas bloquant */ }
    setLoading(false)
  }, [factureId, ecole?.id])

  useEffect(() => { if (ecole?.id) load() }, [load, ecole?.id])

  async function encaisser() {
    const montant = Number(encForm.montant)
    if (!isFinite(montant) || montant <= 0) { toast.error('Montant invalide'); return }
    setSaving(true)
    const s = createClient()
    const { error } = await s.from('reglements').insert({
      ecole_id: ecole.id,
      facture_id: factureId,
      famille_id: facture.famille_id,
      montant,
      date_reglement: encForm.date_reglement,
      mode_paiement: encForm.mode_paiement,
      reference: encForm.reference || null,
      notes: encForm.notes || null,
    })
    setSaving(false)
    if (error) { toast.error('Erreur : ' + error.message); return }
    toast.success('Règlement enregistré')
    setShowEncaisser(false)
    load()
  }

  async function toggleVerrou() {
    const verrouiller = !facture.verrouillee
    const ok = await confirm({
      title: verrouiller ? 'Verrouiller la facture ?' : 'Déverrouiller la facture ?',
      message: verrouiller
        ? 'Les lignes deviendront immuables (protection BDD). Les règlements restent saisissables.'
        : 'Les lignes redeviendront modifiables.',
    })
    if (!ok) return
    const s = createClient()
    const { error } = await s.from('factures').update({
      verrouillee: verrouiller,
      verrouillee_le: verrouiller ? new Date().toISOString() : null,
    }).eq('id', factureId)
    if (error) { toast.error(error.message); return }
    await logAction(s, ecole.id, verrouiller ? 'facture_verrouillee' : 'facture_deverrouillee', { facture_id: factureId, numero: facture.numero })
    toast.success(verrouiller ? 'Facture verrouillée' : 'Facture déverrouillée')
    load()
  }

  async function regenerer() {
    if (!contratAnnee || !ecart) return
    const ok = await confirm({
      title: 'Régénérer depuis le contrat ?',
      message: `Lignes actuelles (${ecart.totalActuel.toLocaleString('fr-FR')} €) remplacées par le calcul du contrat (${ecart.totalTheorique.toLocaleString('fr-FR')} €). Règlements conservés.`,
      danger: true,
    })
    if (!ok) return
    setSaving(true)
    const s = createClient()
    const res = await regenererFactureDepuisContrat(s, contratAnnee, ecole.id, facture.annee_scolaire)
    setSaving(false)
    if (!res.ok) { toast.error(res.error || 'Erreur'); return }
    await logAction(s, ecole.id, 'facture_regeneree', { facture_id: factureId, numero: facture.numero })
    toast.success('Facture régénérée')
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement…</div>
  if (!facture) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Facture introuvable</div>

  const st = labelStatutFacture ? labelStatutFacture(facture.statut) : facture.statut
  const totalAvoirs = imputations.reduce((s: number, i: any) => s + Number(i.montant), 0)
  const today = new Date().toISOString().split('T')[0]
  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 6 }}>← Retour</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {facture.numero}
            {facture.verrouillee && <span style={{ fontSize: 12, background: '#F1F5F9', color: '#475569', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>🔒 Verrouillée</span>}
            <span style={{ fontSize: 12, background: facture.statut === 'paye' ? '#ECFDF5' : facture.statut === 'partiel' ? '#FEF3C7' : facture.statut === 'annule' ? '#F1F5F9' : '#FEE2E2', color: facture.statut === 'paye' ? '#065F46' : facture.statut === 'partiel' ? '#92400E' : facture.statut === 'annule' ? '#64748B' : '#991B1B', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>{typeof st === 'string' ? st : facture.statut}</span>
          </h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
            <a onClick={() => router.push(`/${ecole.slug}/familles/${facture.famille_id}`)} style={{ color: '#2563EB', cursor: 'pointer', fontWeight: 600 }}>{famille?.nom || 'Famille'}</a>
            {' · '}{facture.annee_scolaire} · Émise le {facture.date_emission ? new Date(facture.date_emission).toLocaleDateString('fr-FR') : '—'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Number(facture.solde_restant) > 0.01 && facture.statut !== 'annule' && (
            <button onClick={() => setShowEncaisser(true)} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>💰 Encaisser</button>
          )}
          <a href={`/factures/${factureId}/print?auto=true`} target="_blank" rel="noopener noreferrer"
            style={{ background: '#2563EB', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600 }}>🖨 Imprimer</a>
          <button onClick={toggleVerrou} style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {facture.verrouillee ? '🔓 Déverrouiller' : '🔒 Verrouiller'}
          </button>
        </div>
      </div>

      {/* Bandeau écart contrat */}
      {ecart?.enEcart && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#9A3412' }}>
            ⚠️ <strong>Écart avec le contrat :</strong> facturé {ecart.totalActuel.toLocaleString('fr-FR')} € · contrat {ecart.totalTheorique.toLocaleString('fr-FR')} € ({ecart.ecart > 0 ? '+' : ''}{ecart.ecart.toLocaleString('fr-FR')} €)
          </div>
          {!facture.verrouillee && (
            <button onClick={regenerer} disabled={saving} style={{ background: '#EA580C', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>↻ Régénérer</button>
          )}
        </div>
      )}

      {/* Récap montants */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {[
          { label: 'Total facturé', value: facture.total_facture, color: '#1E293B' },
          ...(totalAvoirs > 0 ? [{ label: 'Avoirs imputés', value: -totalAvoirs, color: '#059669' }] : []),
          { label: 'Total réglé', value: facture.total_regle, color: '#059669' },
          { label: 'Solde restant', value: facture.solde_restant, color: Number(facture.solde_restant) > 0 ? '#DC2626' : '#059669' },
        ].map((c: any) => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginTop: 4 }}>{Number(c.value).toLocaleString('fr-FR')} €</div>
          </div>
        ))}
      </div>

      {/* Lignes */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13 }}>Détail ({lignes.length} ligne{lignes.length > 1 ? 's' : ''})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {lignes.map((l: any, i: number) => (
                <tr key={l.id} style={{ borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}>
                  <td style={{ padding: '10px 20px', fontWeight: 500 }}>{l.enfants ? `${l.enfants.prenom || ''} ${l.enfants.nom || ''}`.trim() : 'Famille'}</td>
                  <td style={{ padding: '10px 20px', color: '#475569' }}>{l.description}</td>
                  <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700 }}>{Number(l.montant).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Règlements */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13 }}>Règlements ({reglements.length})</div>
        {reglements.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>Aucun règlement</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {reglements.map((r: any, i: number) => (
                  <tr key={r.id} style={{ borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}>
                    <td style={{ padding: '10px 20px', color: '#475569' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '10px 20px' }}><span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{labelModePaiement(r.mode_paiement)}</span></td>
                    <td style={{ padding: '10px 20px', color: '#64748B', fontSize: 12 }}>{r.reference || '—'}</td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Échéancier */}
      {echeances.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13 }}>Échéancier ({echeances.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {echeances.map((e: any, i: number) => {
                  const enRetard = !['encaisse', 'paye', 'rejete'].includes(e.statut) && e.date_echeance <= today
                  return (
                    <tr key={e.id} style={{ borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}>
                      <td style={{ padding: '9px 20px', fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{e.numero_cheque}</td>
                      <td style={{ padding: '9px 20px', color: '#475569' }}>{new Date(e.date_echeance).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '9px 20px', fontSize: 12, color: '#64748B' }}>{labelModePaiement(e.mode_paiement)}</td>
                      <td style={{ padding: '9px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                          background: e.statut === 'encaisse' ? '#ECFDF5' : enRetard ? '#FEF2F2' : e.statut === 'attente_reception' ? '#EEF2FF' : '#F1F5F9',
                          color: e.statut === 'encaisse' ? '#065F46' : enRetard ? '#991B1B' : e.statut === 'attente_reception' ? '#3730A3' : '#475569' }}>
                          {e.statut === 'encaisse' ? 'Encaissé' : enRetard ? 'En retard' : e.statut === 'attente_reception' ? 'Attente réception' : 'Prévu'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 20px', textAlign: 'right', fontWeight: 700 }}>{Number(e.montant).toLocaleString('fr-FR')} €</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modale encaissement */}
      {showEncaisser && (
        <div onClick={() => !saving && setShowEncaisser(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 440 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>💰 Encaisser — {famille?.nom}</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>{facture.numero} · solde restant {Number(facture.solde_restant).toLocaleString('fr-FR')} €</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Montant €</label><input type="number" step="0.01" style={inp} value={encForm.montant} onChange={e => setEncForm((p: any) => ({ ...p, montant: e.target.value }))} /></div>
                <div><label style={lbl}>Date</label><input type="date" style={inp} value={encForm.date_reglement} onChange={e => setEncForm((p: any) => ({ ...p, date_reglement: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Mode</label>
                  <select style={inp} value={encForm.mode_paiement} onChange={e => setEncForm((p: any) => ({ ...p, mode_paiement: e.target.value }))}>
                    {(modesEcole.length ? modesEcole : [{ type: 'virement', label: 'Virement' }, { type: 'cheque', label: 'Chèque' }, { type: 'especes', label: 'Espèces' }]).map((m: any) => (
                      <option key={m.type} value={m.type}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div><label style={lbl}>Référence</label><input style={inp} value={encForm.reference} onChange={e => setEncForm((p: any) => ({ ...p, reference: e.target.value }))} placeholder="N° chèque…" /></div>
              </div>
              <div><label style={lbl}>Notes</label><input style={inp} value={encForm.notes} onChange={e => setEncForm((p: any) => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setShowEncaisser(false)} disabled={saving} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
              <button onClick={encaisser} disabled={saving} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Enregistrement…' : 'Valider'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
