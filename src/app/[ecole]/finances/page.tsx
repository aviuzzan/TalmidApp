'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { labelModePaiement } from '@/lib/statuts'
import { useI18n } from '@/lib/i18n'
import { calcDuADateBatch, type DuADateResult } from '@/lib/du-a-date'

type Tab = 'tarifs' | 'factures' | 'paiements'
const MODES_PAIEMENT = ['Espèces', 'Chèque', 'Virement', 'CB', 'SEPA', 'Autre']

export default function FinancesPage() {
  const { t } = useI18n()
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('factures')
  const [tarifs, setTarifs] = useState<any[]>([])
  const [factures, setFactures] = useState<any[]>([])
  const [duAdates, setDuAdates] = useState<Record<string, DuADateResult>>({})
  const [reglements, setReglements] = useState<any[]>([])
  const [familles, setFamilles] = useState<any[]>([])
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
    mode_paiement: 'Chèque', reference: '', notes: '',
  }
  const [paiementForm, setPaiementForm] = useState<any>(emptyPaiement)
  const [loading, setLoading] = useState(true)
  const [showTarifForm, setShowTarifForm] = useState(false)
  const [showFactureForm, setShowFactureForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Détection auto de l'année scolaire courante (sept → août)
  function detectAnnee(): string {
    const d = new Date()
    const m = d.getMonth() + 1
    const y = d.getFullYear()
    return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
  }
  const ANNEES_DISPO = ['2024-2025', '2025-2026', '2026-2027', '2027-2028']
  const [ANNEE, setANNEE] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('finances_annee') || detectAnnee()
    }
    return detectAnnee()
  })

  function changeAnnee(a: string) {
    setANNEE(a)
    if (typeof window !== 'undefined') localStorage.setItem('finances_annee', a)
  }

  const emptyTarif = { nom: '', montant: '', annee_scolaire: ANNEE, description: '' }
  const [tarifForm, setTarifForm] = useState(emptyTarif)

  const emptyFacture = { famille_id: '', annee_scolaire: ANNEE, notes: '' }
  const [factureForm, setFactureForm] = useState(emptyFacture)

  const supabase = createClient()

  const load = useCallback(async () => {
    const [{ data: t }, { data: f }, { data: fam }, { data: regs }] = await Promise.all([
      supabase.from('tarifs').select('*').eq('annee_scolaire', ANNEE).order('nom'),
      supabase.from('factures_solde').select('*, familles(nom, numero)').eq('annee_scolaire', ANNEE).order('date_emission', { ascending: false }),
      supabase.from('familles').select('id, nom, numero').order('nom'),
      supabase.from('reglements').select('*, familles(nom, numero), factures(numero)').order('date_reglement', { ascending: false }),
    ])
    setTarifs(t ?? [])
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

  async function saveTarif(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('tarifs').insert({
      nom: tarifForm.nom,
      montant: parseFloat(tarifForm.montant),
      annee_scolaire: tarifForm.annee_scolaire,
      description: tarifForm.description || null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowTarifForm(false); setTarifForm(emptyTarif); load(); setSaving(false)
  }

  async function deleteTarif(id: string) {
    const ok = await confirm({ title: 'Supprimer ce tarif ?', danger: true })
    if (!ok) return
    const { error } = await supabase.from('tarifs').delete().eq('id', id)
    if (error) { toast.error('Suppression impossible : ' + error.message); return }
    toast.success('Tarif supprimé')
    load()
  }

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
    const { error } = await supabase.from('reglements').delete().eq('id', id)
    if (error) { toast.error('Suppression impossible : ' + error.message); return }
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
    const map: any = {
      en_attente: ['#D97706', '#FFFBEB', 'En attente'],
      partiel: ['#2563EB', '#EFF6FF', 'Partiellement réglée'],
      paye: ['#059669', '#ECFDF5', 'Payée'],
      payee: ['#059669', '#ECFDF5', 'Payée'],
      solde: ['#059669', '#ECFDF5', 'Soldée'],
      annule: ['#64748B', '#F1F5F9', 'Annulée'],
      annulee: ['#64748B', '#F1F5F9', 'Annulée'],
      brouillon: ['#475569', '#F1F5F9', 'Brouillon'],
      verrouillee: ['#4338CA', '#EEF2FF', 'Verrouillée'],
    }
    const [c, bg, label] = map[String(statut || '').toLowerCase()] ?? ['#64748B', '#F1F5F9', statut]
    return <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{label}</span>
  }

  const inp = { width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none' }

  // Les factures annulees ne comptent ni dans le facture ni dans le restant a encaisser
  const facturesActives = factures.filter((f: any) => f.statut !== 'annule')
  const totalFacture = facturesActives.reduce((s: number, f: any) => s + Number(f.total_facture), 0)
  const totalRegle = facturesActives.reduce((s: number, f: any) => s + Number(f.total_regle), 0)
  const totalRestant = totalFacture - totalRegle

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header — titre uniquement. Le selecteur d'annee est dans le header global. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t('pages.finances.title')}</h1>
          <p style={{ color: '#64748B', fontSize: 13 }}>Facturation & Règlements — {ANNEE}</p>
        </div>
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

      {/* Tabs unifiés : tabs inline (Factures/Paiements/Tarifs) + liens vers pages séparées (Dashboard/Relances/Bordereau/Analytique/SEPA) */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #E2E8F0', flexWrap: 'wrap', overflowX: 'auto' }}>
        {[
          { id: 'factures',  label: `📄 Factures (${factures.length})`, type: 'inline' as const },
          { id: 'paiements', label: `💸 Paiements (${reglements.length})`, type: 'inline' as const },
          { id: 'tarifs',    label: `💰 Tarifs (${tarifs.length})`, type: 'inline' as const },
          { id: 'dashboard', label: '📊 Tableau de bord',       type: 'page' as const, href: 'finances/dashboard' },
          { id: 'relances',  label: '🔔 Relances impayés',       type: 'page' as const, href: 'finances/relances' },
          { id: 'bordereau', label: '🧾 Bordereau chèques',      type: 'page' as const, href: 'finances/bordereau' },
          { id: 'analytique',label: '📈 Compta analytique',      type: 'page' as const, href: 'finances/analytique' },
          { id: 'sepa',      label: '🏦 Export SEPA',            type: 'page' as const, href: 'inscriptions/sepa' },
        ].map(t => {
          const isInlineActive = t.type === 'inline' && tab === t.id
          return (
            <button key={t.id} onClick={() => t.type === 'inline' ? setTab(t.id as Tab) : router.push(`/${ecole.slug}/${t.href}`)}
              style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                fontWeight: isInlineActive ? 600 : 400,
                background: 'transparent',
                color: isInlineActive ? '#2563EB' : '#64748B',
                borderBottom: isInlineActive ? '2px solid #2563EB' : '2px solid transparent',
                marginBottom: -2,
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Toolbar d'actions — sur sa propre ligne, séparée des tabs */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {tab === 'tarifs' && (
          <button className="btn-primary" onClick={() => { setTarifForm({ ...emptyTarif, annee_scolaire: ANNEE }); setShowTarifForm(true) }}>+ Nouveau tarif</button>
        )}
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

      {/* Tarifs tab */}
      {tab === 'tarifs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tarifs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px', color: '#94A3B8' }}>
              Aucun tarif configuré pour {ANNEE} — cliquez sur "Nouveau tarif"
            </div>
          ) : tarifs.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.nom}</div>
                {t.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{t.description}</div>}
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t.annee_scolaire}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB' }}>{Number(t.montant).toLocaleString('fr-FR')} €</div>
                <button onClick={() => deleteTarif(t.id)} className="btn-danger" style={{ padding: '5px 12px', fontSize: 12 }}>🗑️</button>
              </div>
            </div>
          ))}
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
                  {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
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
                  ) : reglementsFiltres.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: i < reglementsFiltres.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '13px 16px', color: '#475569', fontSize: 12 }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 600 }}>{r.familles?.nom} <span style={{ color: '#94A3B8', fontSize: 11 }}>({r.familles?.numero})</span></td>
                      <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontSize: 12, color: '#94A3B8' }}>{r.factures?.numero}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{labelModePaiement(r.mode_paiement)}</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B' }}>{r.reference || '—'}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12, color: '#64748B', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes || ''}>{r.notes || '—'}</td>
                      <td style={{ padding: '13px 16px' }}>
                        <button onClick={() => deletePaiement(r.id)} className="btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} title="Supprimer">🗑️</button>
                      </td>
                    </tr>
                  ))}
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
                  {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
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

      {/* Modal nouveau tarif */}
      {showTarifForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>💰 Nouveau tarif</h2>
              <button onClick={() => setShowTarifForm(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
            </div>
            <form onSubmit={saveTarif} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Année scolaire</label>
                <select style={inp} value={tarifForm.annee_scolaire} onChange={e => setTarifForm(p => ({ ...p, annee_scolaire: e.target.value }))}>
                  {ANNEES_DISPO.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Nom du tarif *</label>
                <input style={inp} value={tarifForm.nom} onChange={e => setTarifForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: Scolarité Kita, Scolarité CP..." required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Montant annuel (€) *</label>
                <input style={inp} type="number" min="0" step="0.01" value={tarifForm.montant} onChange={e => setTarifForm(p => ({ ...p, montant: e.target.value }))} placeholder="Ex: 3600" required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5 }}>Description</label>
                <input style={inp} value={tarifForm.description} onChange={e => setTarifForm(p => ({ ...p, description: e.target.value }))} placeholder="Optionnel" />
              </div>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTarifForm(false)}>Annuler</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
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
