'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { labelModePaiement, labelStatutFacture, couleurStatutFacture } from '@/lib/statuts'
import { useI18n } from '@/lib/i18n'
import { calcDuADateBatch, type DuADateResult } from '@/lib/du-a-date'
import { getAnneeCouranteSync } from '@/lib/annee-courante'
import { logAction } from '@/lib/audit-log'

type Tab = 'factures' | 'paiements'
// Fallback si la table modes_reglement_ecole est vide ou indisponible.
const MODES_PAIEMENT_FALLBACK: { code: string; libelle: string }[] = [
  { code: 'especes', libelle: 'Espèces' },
  { code: 'cheque', libelle: 'Chèque' },
  { code: 'virement', libelle: 'Virement' },
  { code: 'cb', libelle: 'Carte bancaire' },
  { code: 'sepa', libelle: 'Prélèvement SEPA' },
  { code: 'autre', libelle: 'Autre' },
]

export default function FinancesPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('factures')
  const [factures, setFactures] = useState<any[]>([])
  const [duAdates, setDuAdates] = useState<Record<string, DuADateResult>>({})
  const [reglements, setReglements] = useState<any[]>([])
  const [familles, setFamilles] = useState<any[]>([])
  // Modes de règlement actifs pour cette école (dynamique, depuis modes_reglement_ecole).
  // value = code persisté en BDD ; libelle = affichage humain.
  const [modesEcole, setModesEcole] = useState<{ code: string; libelle: string }[]>([])
  // Filtres paiements
  const [filtreFamille, setFiltreFamille] = useState<string>('')
  const [filtreMode, setFiltreMode] = useState<string>('')
  const [filtreDateDebut, setFiltreDateDebut] = useState<string>('')
  const [filtreDateFin, setFiltreDateFin] = useState<string>('')
  // Modal saisie paiement (depuis cet écran global)
  const [showPaiementForm, setShowPaiementForm] = useState(false)
  const emptyPaiement = {
    famille_id: '', facture_id: '', montant: '',
    date_reglement: new Date().toISOString().slice(0, 10),
    mode_paiement: 'cheque', reference: '', notes: '',
  }
  const [paiementForm, setPaiementForm] = useState<any>(emptyPaiement)
  const [loading, setLoading] = useState(true)
  const [showFactureForm, setShowFactureForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // L'année scolaire courante est calculée par le helper centralisé (@/lib/annee-courante).
  const [ANNEES_DISPO, setAnneesDispo] = useState<string[]>([])
  const [ANNEE, setANNEE] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('finances_annee') || getAnneeCouranteSync()
    }
    return getAnneeCouranteSync()
  })

  function changeAnnee(a: string) {
    setANNEE(a)
    if (typeof window !== 'undefined') localStorage.setItem('finances_annee', a)
  }

  // Charge la liste des annees depuis la table exercices (filtree par ecole)
  useEffect(() => {
    if (!ecole?.id) return
    const s = createClient()
    s.from('exercices').select('code').eq('ecole_id', ecole.id).order('code', { ascending: false }).then(({ data }) => {
      const codes = Array.from(new Set((data || []).map((r: any) => r.code).filter(Boolean))) as string[]
      if (codes.length) {
        // Assure que l'annee courante (deja selectionnee par defaut) est dans la liste
        const withCurrent = ANNEE && !codes.includes(ANNEE) ? [ANNEE, ...codes] : codes
        setAnneesDispo(withCurrent)
      }
    })
  }, [ecole?.id])

  // Charge les modes de règlement actifs configurés pour cette école.
  // Colonnes réelles (cf. modes_reglement_ecole) : `type` (code persisté) et `label` (libellé humain).
  // En cas d'échec ou de table vide, on retombe sur MODES_PAIEMENT_FALLBACK pour ne pas casser l'UI.
  useEffect(() => {
    if (!ecole?.id) return
    const s = createClient()
    s.from('modes_reglement_ecole')
      .select('type, label')
      .eq('ecole_id', ecole.id)
      .eq('actif', true)
      .order('ordre')
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) {
          setModesEcole(MODES_PAIEMENT_FALLBACK)
          return
        }
        setModesEcole(data.map((r: any) => ({ code: r.type, libelle: r.label })))
      })
  }, [ecole?.id])

  // Quand les modes sont chargés, on s'assure que le mode par défaut du formulaire est valide.
  useEffect(() => {
    if (modesEcole.length === 0) return
    setPaiementForm((p: any) => {
      if (p.mode_paiement && modesEcole.find(m => m.code === p.mode_paiement)) return p
      return { ...p, mode_paiement: modesEcole[0].code }
    })
  }, [modesEcole])

  const emptyFacture = { famille_id: '', annee_scolaire: ANNEE, notes: '' }
  const [factureForm, setFactureForm] = useState(emptyFacture)

  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: f }, { data: fam }, { data: regs }] = await Promise.all([
      supabase.from('factures_solde').select('*, familles(nom, numero)').eq('annee_scolaire', ANNEE).order('date_emission', { ascending: false }),
      supabase.from('familles').select('id, nom, numero').order('nom'),
      supabase.from('reglements').select('*, familles(nom, numero), factures(numero)').order('date_reglement', { ascending: false }),
    ])
    setFactures(f ?? [])
    setFamilles(fam ?? [])
    setReglements(regs ?? [])

    // Calcule le du a date pour chaque facture (echeances echues - reglements imputes).
    const facturesList = f ?? []
    if (facturesList.length > 0) {
      const duMap = await calcDuADateBatch(supabase, facturesList.map((x: any) => x.id))
      setDuAdates(duMap)
    } else {
      setDuAdates({})
    }

    setLoading(false)
  }, [ANNEE])

  useEffect(() => { load() }, [load])

  async function savePaiement(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    if (!paiementForm.facture_id || !paiementForm.montant || Number(paiementForm.montant) <= 0) {
      setError('Veuillez sélectionner une facture et un montant valide.')
      setSaving(false); return
    }
    const { error: err } = await supabase.from('reglements').insert({
      facture_id: paiementForm.facture_id,
      famille_id: paiementForm.famille_id,
      montant: Number(paiementForm.montant),
      date_reglement: paiementForm.date_reglement,
      mode_paiement: paiementForm.mode_paiement,
      reference: paiementForm.reference || null,
      notes: paiementForm.notes || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowPaiementForm(false); setPaiementForm(emptyPaiement); load(); setSaving(false)
  }

  async function deletePaiement(id: string) {
    const ok = await confirm({
      title: 'Supprimer ce règlement ?',
      message: 'Action irréversible — le statut de la facture sera recalculé.',
      danger: true,
    })
    if (!ok) return
    // Capturer les infos avant suppression pour l'audit-log
    const { data: regAvant } = await supabase.from('reglements').select('montant, mode_paiement, facture_id, famille_id').eq('id', id).maybeSingle()
    const { error } = await supabase.from('reglements').delete().eq('id', id)
    if (error) { toast.error('Suppression impossible : ' + error.message); return }
    // Statut facture recalcule automatiquement par le trigger BDD trg_reglements_statut
    await logAction(supabase, ecole.id, 'reglement_supprime', {
      reglement_id: id,
      montant: regAvant?.montant,
      mode_paiement: regAvant?.mode_paiement,
      facture_id: regAvant?.facture_id,
      famille_id: regAvant?.famille_id,
    })
    toast.success('Règlement supprimé')
    load()
  }

  async function saveFacture(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('factures').insert({
      famille_id: factureForm.famille_id,
      annee_scolaire: factureForm.annee_scolaire,
      notes: factureForm.notes || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowFactureForm(false); setFactureForm(emptyFacture); load(); setSaving(false)
  }

  function statutBadge(statut: string) {
    // Cas spécial : `solde` n'est pas couvert par labelStatutFacture (qui ne connaît que payée/partielle/...).
    // On l'aligne sur 'paye' visuellement pour cohérence.
    const c = String(statut || '').toLowerCase()
    if (c === 'solde') {
      return <span style={{ background: '#ECFDF5', color: '#065F46', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>Soldée</span>
    }
    const { bg, fg } = couleurStatutFacture(statut)
    const label = labelStatutFacture(statut)
    return <span style={{ background: bg, color: fg, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{label}</span>
  }

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }

  // Les factures annulees ne comptent ni dans le facture ni dans le restant a encaisser.
  // NOTE : depuis la refonte de la vue, `total_regle` EXCLUT les avoirs imputés.
  // Le reste à encaisser = solde_restant agrégé (qui reste mathématiquement correct).
  const facturesActives = factures.filter((f: any) => f.statut !== 'annule')
  const totalFacture = facturesActives.reduce((s: number, f: any) => s + Number(f.total_facture), 0)
  const totalRegle = facturesActives.reduce((s: number, f: any) => s + Number(f.total_regle), 0)
  const totalRestant = facturesActives.reduce((s: number, f: any) => s + Number(f.solde_restant || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header — titre uniquement. Le selecteur d'annee est dans le header global. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t('pages.finances.title')}</h1>
          <p style={{ color: '#64748B', fontSize: 13 }}>Facturation & règlements</p>
        </div>
        <button
          onClick={() => router.push(`/${ecole.slug}/parametres?tab=tarifs`)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#2563EB', fontSize: 12, fontWeight: 500, padding: 0,
          }}>
          Gérer les tarifs →
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { label: 'Total facturé', value: `${totalFacture.toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Total réglé', value: `${totalRegle.toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
          { label: 'Reste à encaisser', value: `${totalRestant.toLocaleString('fr-FR')} €`, color: totalRestant > 0 ? '#DC2626' : '#059669', bg: totalRestant > 0 ? '#FEF2F2' : '#ECFDF5' },
        ].map(s => (
          <div key={s.label} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{loading ? '...' : s.value}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs inline : Factures / Paiements. Les autres écrans finances (dashboard, relances,
          bordereau, analytique, SEPA) sont accessibles depuis la sidebar gauche. */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E2E8F0', flexWrap: 'wrap', overflowX: 'auto' }}>
        {[
          { id: 'factures',  label: `📄 Factures (${factures.length})` },
          { id: 'paiements', label: `💸 Paiements (${reglements.length})` },
        ].map(t => {
          const isActive = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id as Tab)}
              style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                fontWeight: isActive ? 600 : 400,
                background: 'transparent',
                color: isActive ? '#2563EB' : '#64748B',
                borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
                marginBottom: -2,
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Toolbar d'actions — sur sa propre ligne, séparée des tabs */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {tab === 'factures' && (
          <>
            <button onClick={() => router.push(`/${ecole.slug}/finances/avoirs`)}
              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🎁 Avoirs
            </button>
            <button className="btn-primary" onClick={() => { setFactureForm({ ...emptyFacture, annee_scolaire: ANNEE }); setShowFactureForm(true) }}>+ Nouvelle facture</button>
          </>
        )}
        {tab === 'paiements' && (
          <button className="btn-primary" onClick={() => setShowPaiementForm(true)}>+ Saisir un paiement</button>
        )}
      </div>

      {/* Factures tab */}
      {tab === 'factures' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['N° Facture', 'Famille', 'Total annuel', 'Réglé', 'Solde annuel', 'Dû à date', 'Statut', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
              ) : factures.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#CBD5E1' }}>Aucune facture pour {ANNEE}</td></tr>
              ) : factures.map((f, i) => {
                const du = duAdates[f.id]
                const duAdate = du?.duAdate || 0
                return (
                <tr key={f.id} style={{ borderBottom: i < factures.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>{f.numero}</td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{f.familles?.nom} <span style={{ color: '#94A3B8', fontSize: 11 }}>({f.familles?.numero})</span></td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{Number(f.total_facture).toLocaleString('fr-FR')} €</td>
                  <td style={{ padding: '13px 16px', color: '#059669', fontWeight: 600 }}>{Number(f.total_regle).toLocaleString('fr-FR')} €</td>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: '#475569' }}>
                    {Number(f.solde_restant).toLocaleString('fr-FR')} €
                  </td>
                  <td style={{ padding: '13px 16px', fontWeight: 700, color: duAdate > 0 ? '#DC2626' : '#94A3B8' }}>
                    {duAdate > 0 ? (
                      <>
                        {duAdate.toLocaleString('fr-FR')} €
                        {du?.nbEcheancesEchues ? <div style={{ fontSize: 10, color: '#991B1B', fontWeight: 500 }}>{du.nbEcheancesEchues} éch.</div> : null}
                      </>
                    ) : du?.prochaineEcheance ? (
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#64748B' }}>
                        Prochaine : {new Date(du.prochaineEcheance.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px' }}>{statutBadge(f.statut)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => router.push(`/${ecole.slug}/familles/${f.famille_id}?tab=facturation`)}>
                      Voir →
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paiements tab */}
      {tab === 'paiements' && (() => {
        const reglementsFiltres = reglements.filter(r => {
          if (filtreFamille && r.famille_id !== filtreFamille) return false
          if (filtreMode && r.mode_paiement !== filtreMode) return false
          if (filtreDateDebut && r.date_reglement < filtreDateDebut) return false
          if (filtreDateFin && r.date_reglement > filtreDateFin) return false
          return true
        })
        const totalPeriode = reglementsFiltres.reduce((s, r) => s + Number(r.montant || 0), 0)
        return (
          <>
            {/* Filtres */}
            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Famille</label>
                <select style={inp} value={filtreFamille} onChange={e => setFiltreFamille(e.target.value)}>
                  <option value="">Toutes</option>
                  {familles.map(f => <option key={f.id} value={f.id}>{f.nom} ({f.numero})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Mode</label>
                <select style={inp} value={filtreMode} onChange={e => setFiltreMode(e.target.value)}>
                  <option value="">Tous</option>
                  {(modesEcole.length > 0 ? modesEcole : MODES_PAIEMENT_FALLBACK).map(m => (
                    <option key={m.code} value={m.code}>{m.libelle}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Du</label>
                <input type="date" style={inp} value={filtreDateDebut} onChange={e => setFiltreDateDebut(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Au</label>
                <input type="date" style={inp} value={filtreDateFin} onChange={e => setFiltreDateFin(e.target.value)} />
              </div>
              <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Total période</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2563EB' }}>{totalPeriode.toLocaleString('fr-FR')} €</div>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                    {['Date', 'Famille', 'Facture', 'Montant', 'Mode', 'Référence', 'Notes', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
                  ) : reglementsFiltres.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#CBD5E1' }}>Aucun règlement {reglements.length > 0 ? 'pour ces filtres' : 'enregistré'}</td></tr>
                  ) : reglementsFiltres.map((r, i) => {
                    const isAvoir = r.mode_paiement === 'avoir'
                    const rowBgBase = isAvoir ? '#FAF5FF' : 'transparent'
                    return (
                    <tr key={r.id} style={{ borderBottom: i < reglementsFiltres.length - 1 ? '1px solid #F1F5F9' : 'none', background: rowBgBase }}
                      onMouseEnter={e => (e.currentTarget.style.background = isAvoir ? '#F3E8FF' : '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBgBase)}>
                      <td style={{ padding: '13px 16px', color: '#475569', fontSize: 12 }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 600 }}>{r.familles?.nom} <span style={{ color: '#94A3B8', fontSize: 11 }}>({r.familles?.numero})</span></td>
                      <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>{r.factures?.numero}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 700, color: isAvoir ? '#7C3AED' : '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{
                          background: isAvoir ? '#F3E8FF' : '#F1F5F9',
                          color: isAvoir ? '#6B21A8' : '#475569',
                          borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                        }}>
                          {isAvoir ? '🎁 Avoir imputé' : labelModePaiement(r.mode_paiement)}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>{r.reference || '—'}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes || ''}>{r.notes || '—'}</td>
                      <td style={{ padding: '13px 16px' }}>
                        <button onClick={() => deletePaiement(r.id)} className="btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} title="Supprimer">🗑️</button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      })()}

      {/* Modal saisie paiement */}
      {showPaiementForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>💸 Saisir un paiement</h2>
              <button onClick={() => setShowPaiementForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>
            {error && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}
            <form onSubmit={savePaiement} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Famille *</label>
                <select required style={inp} value={paiementForm.famille_id}
                  onChange={e => setPaiementForm((p: any) => ({ ...p, famille_id: e.target.value, facture_id: '' }))}>
                  <option value="">— Sélectionner une famille —</option>
                  {familles.map(f => <option key={f.id} value={f.id}>{f.nom} ({f.numero})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Facture *</label>
                <select required style={inp} value={paiementForm.facture_id}
                  onChange={e => setPaiementForm((p: any) => ({ ...p, facture_id: e.target.value }))}
                  disabled={!paiementForm.famille_id}>
                  <option value="">— Sélectionner une facture —</option>
                  {factures.filter(f => f.famille_id === paiementForm.famille_id).map(f => (
                    <option key={f.id} value={f.id}>
                      {f.numero} — Total {Number(f.total_facture).toLocaleString('fr-FR')} € / Reste {Number(f.solde_restant).toLocaleString('fr-FR')} €
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Montant (€) *</label>
                  <input required type="number" step="0.01" min="0.01" style={inp} value={paiementForm.montant}
                    onChange={e => setPaiementForm((p: any) => ({ ...p, montant: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Date *</label>
                  <input required type="date" style={inp} value={paiementForm.date_reglement}
                    onChange={e => setPaiementForm((p: any) => ({ ...p, date_reglement: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Mode de paiement *</label>
                <select required style={inp} value={paiementForm.mode_paiement}
                  onChange={e => setPaiementForm((p: any) => ({ ...p, mode_paiement: e.target.value }))}>
                  {(modesEcole.length > 0 ? modesEcole : MODES_PAIEMENT_FALLBACK).map(m => (
                    <option key={m.code} value={m.code}>{m.libelle}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Référence (n° chèque, virement…)</label>
                <input type="text" style={inp} value={paiementForm.reference}
                  onChange={e => setPaiementForm((p: any) => ({ ...p, reference: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Notes</label>
                <textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }} value={paiementForm.notes}
                  onChange={e => setPaiementForm((p: any) => ({ ...p, notes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setShowPaiementForm(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nouvelle facture */}
      {showFactureForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>📄 Nouvelle facture</h2>
              <button onClick={() => setShowFactureForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>
            <form onSubmit={saveFacture} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Année scolaire</label>
                <select style={inp} value={factureForm.annee_scolaire} onChange={e => setFactureForm(p => ({ ...p, annee_scolaire: e.target.value }))}>
                  {ANNEES_DISPO.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Famille *</label>
                <select style={inp} value={factureForm.famille_id} onChange={e => setFactureForm(p => ({ ...p, famille_id: e.target.value }))} required>
                  <option value="">-- Sélectionner une famille --</option>
                  {familles.map((f: any) => <option key={f.id} value={f.id}>{f.nom} ({f.numero})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Notes</label>
                <textarea style={{ ...inp, height: 80, resize: 'vertical' }} value={factureForm.notes} onChange={e => setFactureForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optionnel" />
              </div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowFactureForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : '✓ Créer la facture'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
