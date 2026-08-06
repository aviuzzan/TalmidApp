'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { labelStatutFacture, labelModePaiement } from '@/lib/statuts'
import { logAction } from '@/lib/audit-log'
import { chargerParLots } from '@/lib/pagination'
import { estReportComptable, labelModeReport, libelleReport, type ReportSoldeActif } from '@/lib/report-solde'
import { appAlert, appConfirm } from '@/components/ui/ConfirmDialog'

/**
 * Phrase explicative sous une ligne de report. Elle DÉPEND de `source` : la
 * formulation historique (« la créance figure déjà sur ce compte via les
 * factures de … ») est fausse dès que l'exercice d'origine n'a pas été facturé
 * dans TalmidApp, ce qui est précisément le cas de l'école pilote. Annoncer au
 * lecteur que la créance est ailleurs sur le relevé alors qu'elle n'y est pas
 * est pire qu'une absence d'explication.
 */
function phraseReport(rep: ReportSoldeActif): string {
  const exercice = rep.exercice_origine_code || 'l\'exercice d\'origine'
  if (!estReportComptable(rep)) {
    return `Ligne non comptabilisée : la créance figure déjà sur ce compte via les factures de ${exercice}.`
  }
  const origine = String(rep.source) === 'importe' ? 'repris à l\'import' : 'repris manuellement'
  return `Solde d'ouverture ${origine} — les factures de ${exercice} ne figurent pas dans TalmidApp : cette ligne est comptabilisée et entre dans les totaux ci-dessous.`
}

type Facture = {
  id: string; numero: string; date_emission: string; statut: string;
  total_facture: number; total_regle: number; total_avoirs_imputes: number; solde_restant: number;
}
type Reglement = {
  id: string; facture_id: string; montant: number; date_reglement: string;
  mode_paiement: string; reference: string | null; notes: string | null;
}
type Famille = {
  id: string; nom: string; email: string | null; numero: string | null
  /** Colonne persistée, convention unique partagée avec le FEC. */
  compte_auxiliaire: string | null
}

// FIX audit 24/07/2026 pt 5 : codes lowercase normalises (valeur stockee) + label affiche.
// Avant, on stockait 'Espèces'/'Chèque'/'CB' capitalises -> filtres, FEC et stats les rataient.
const MODES: { value: string; label: string }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'virement', label: 'Virement' },
  { value: 'cb', label: 'CB' },
  { value: 'sepa', label: 'SEPA' },
  { value: 'autre', label: 'Autre' },
]

export default function CompteFamillePage() {
  const params = useParams()
  const router = useRouter()
  const ecole = useEcole()
  const familleId = params.id as string
  const [loading, setLoading] = useState(true)
  const [famille, setFamille] = useState<Famille | null>(null)
  const [factures, setFactures] = useState<Facture[]>([])
  const [reglements, setReglements] = useState<Reglement[]>([])
  const [pointes, setPointes] = useState<Set<string>>(new Set())
  // Reports de solde VALIDÉS de la famille, tous exercices cibles confondus.
  //
  // FIX ssss2 pt3 — leur traitement DÉPEND DE `source`, cf. `estReportComptable()` :
  //   - 'calcule' : la créance a été facturée dans TalmidApp, elle figure déjà
  //     dans le grand livre ci-dessous. Ligne d'INFORMATION, hors totaux.
  //   - 'saisi' / 'importe' : l'exercice d'origine n'a PAS été facturé dans
  //     TalmidApp (cas de l'école pilote, zéro facture sur 2025-2026). Aucune
  //     facture ne porte cette créance : la ligne est un vrai solde d'ouverture,
  //     elle est COMPTABILISÉE et entre dans les totaux.
  const [reports, setReports] = useState<ReportSoldeActif[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<any>({
    facture_id: '', montant: '', mode_paiement: 'cheque',
    date_reglement: new Date().toISOString().slice(0,10),
    reference: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [familleId])

  async function load() {
    setLoading(true)
    const s = createClient()
    const [{ data: fam }, { data: facs }, { data: regs }, resReports] = await Promise.all([
      s.from('familles').select('id, nom, email, numero, compte_auxiliaire').eq('id', familleId).single(),
      s.from('factures_solde').select('*').eq('famille_id', familleId).order('date_emission', { ascending: false }),
      s.from('reglements').select('*').eq('famille_id', familleId).order('date_reglement', { ascending: false }),
      // Reports validés, toutes cibles confondues : le relevé est multi-exercices.
      chargerParLots<ReportSoldeActif>((debut, fin) => s
        .from('reports_solde_actifs')
        .select('id, ecole_id, famille_id, exercice_cible_id, exercice_origine_id, exercice_origine_code, montant, mode, source, note, valide_le, montant_echeance')
        .eq('famille_id', familleId)
        .order('valide_le', { ascending: true })
        .order('id', { ascending: true })
        .range(debut, fin)),
    ])
    setFamille(fam)
    setFactures((facs ?? []) as Facture[])
    setReglements((regs ?? []) as Reglement[])
    if (resReports.error) console.error('[compte] reports de solde :', resReports.error)
    setReports(resReports.rows)

    // Pointage : un reglement est "rapproche" s'il a un mouvement_bancaire qui pointe vers lui
    const reglIds = ((regs ?? []) as Reglement[]).map(r => r.id)
    if (reglIds.length > 0) {
      const { data: mvts } = await s.from('mouvements_bancaires').select('reglement_id').in('reglement_id', reglIds).eq('statut', 'rapproche')
      setPointes(new Set(((mvts ?? []) as any[]).map(m => m.reglement_id).filter(Boolean)))
    } else {
      setPointes(new Set())
    }
    setLoading(false)
  }

  async function saveReglement() {
    if (!form.facture_id || !form.montant || Number(form.montant) <= 0) {
      await appAlert('Veuillez sélectionner une facture et un montant valide.')
      return
    }
    setSaving(true)
    const s = createClient()
    const { error } = await s.from('reglements').insert({
      facture_id: form.facture_id,
      famille_id: familleId,
      montant: Number(form.montant),
      date_reglement: form.date_reglement,
      mode_paiement: form.mode_paiement,
      reference: form.reference || null,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) { await appAlert('Erreur: ' + error.message); return }
    setShowModal(false)
    setForm({
      facture_id: '', montant: '', mode_paiement: 'cheque',
      date_reglement: new Date().toISOString().slice(0,10),
      reference: '', notes: '',
    })
    await load()
  }

  async function supprimerReglement(id: string) {
    if (!await appConfirm('Supprimer ce règlement ? Cette action est irréversible.')) return
    const s = createClient()
    const { data: regAvant } = await s.from('reglements').select('montant, mode_paiement, facture_id, famille_id').eq('id', id).maybeSingle()
    const { error } = await s.from('reglements').delete().eq('id', id)
    if (error) { await appAlert('Erreur: ' + error.message); return }
    // Statut facture recalcule par le trigger BDD trg_reglements_statut
    await logAction(s, ecole.id, 'reglement_supprime', {
      reglement_id: id, montant: regAvant?.montant, mode_paiement: regAvant?.mode_paiement,
      facture_id: regAvant?.facture_id, famille_id: regAvant?.famille_id,
    })
    await load()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!famille) return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Famille introuvable</div>

  // FIX audit 27/07 : exclure les factures annulees/brouillon des totaux et du grand
  // livre 411 — sinon le releve imprime divergeait de la fiche famille (qui les exclut).
  const facturesActives = factures.filter(f => !['annule', 'annulee', 'brouillon'].includes(String(f.statut || '').toLowerCase()))
  const facturesOuvertes = facturesActives.filter(f => Number(f.solde_restant) > 0)

  // Reports repris manuellement (`saisi`) ou importés d'un autre logiciel
  // (`importe`) : les factures de l'exercice d'origine ne sont PAS dans
  // TalmidApp, donc la créance n'apparaît nulle part ailleurs sur ce relevé.
  // Ne pas les compter sous-estimerait la dette de la famille du montant exact
  // du report — c'est le cas réel de l'école pilote.
  const reportsComptables = reports.filter(estReportComptable)
  const reportDebit = reportsComptables.reduce((acc, r) => acc + Math.max(0, Number(r.montant) || 0), 0)
  const reportCredit = reportsComptables.reduce((acc, r) => acc + Math.max(0, -(Number(r.montant) || 0)), 0)

  const totalFacture = facturesActives.reduce((acc, f) => acc + Number(f.total_facture || 0), 0) + reportDebit
  const totalRegle = facturesActives.reduce((acc, f) => acc + Number(f.total_regle || 0), 0) + reportCredit
  const soldeTotal = facturesActives.reduce((acc, f) => acc + Number(f.solde_restant || 0), 0) + reportDebit - reportCredit

  // Code de compte auxiliaire client (plan comptable : 411 = Clients).
  // FIX ssss2-D : on lit désormais la colonne PERSISTÉE `familles.compte_auxiliaire`,
  // qui est celle utilisée par l'export FEC. Le code recalculé à la volée qui se
  // trouvait ici divergeait dès qu'un numéro de famille était modifié après coup :
  // le relevé et le FEC désignaient alors la même famille par deux codes
  // différents, ce qui rend tout lettrage impossible. Le calcul n'est conservé
  // qu'en repli, à l'identique de `compteAuxiliaireDeRepli()` du FEC.
  const auxBase = (famille.numero || famille.nom || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10)
  const auxCode = famille.compte_auxiliaire || ('411' + (auxBase || 'CLIENT'))

  const mouvements: {
    date: string; type: 'facture' | 'reglement' | 'report'; libelle: string;
    debit: number; credit: number; id: string; montantInfo?: number
    /** Report comptabilisé (source 'saisi'/'importe') : il pèse sur le solde. */
    comptabilise?: boolean
  }[] = []

  // Reports de solde antérieurs, EN TÊTE du relevé (ce sont des à-nouveaux).
  //   - source 'calcule' : ligne d'INFORMATION, ni débit, ni crédit, ni solde
  //     cumulé. La créance est déjà représentée par les factures de l'exercice
  //     d'origine listées ci-dessous ; la compter une seconde fois la doublerait.
  //   - source 'saisi' / 'importe' : solde d'ouverture repris à la main, aucune
  //     facture correspondante en base. La ligne est COMPTABILISÉE, sinon le
  //     relevé annonce une dette inférieure à la dette réelle.
  for (const r of reports) {
    const montant = Number(r.montant) || 0
    const comptabilise = estReportComptable(r)
    mouvements.push({
      date: r.valide_le ? String(r.valide_le).slice(0, 10) : '',
      type: 'report',
      libelle: libelleReport(r),
      debit: comptabilise ? Math.max(0, montant) : 0,
      credit: comptabilise ? Math.max(0, -montant) : 0,
      id: r.id, montantInfo: montant, comptabilise,
    })
  }
  for (const f of facturesActives) {
    mouvements.push({
      date: f.date_emission, type: 'facture',
      libelle: 'Facture ' + f.numero,
      debit: Number(f.total_facture || 0), credit: 0, id: f.id,
    })
  }
  for (const r of reglements) {
    const fac = factures.find(f => f.id === r.facture_id)
    const isPointe = pointes.has(r.id)
    const isAvoir = r.mode_paiement === 'avoir'
    mouvements.push({
      date: r.date_reglement, type: 'reglement',
      libelle: (isAvoir ? 'Avoir imputé' : 'Règlement ' + labelModePaiement(r.mode_paiement))
        + (fac ? ' / ' + fac.numero : '')
        + (r.reference ? ' (' + r.reference + ')' : '')
        + (isPointe ? ' ✓ pointé' : ''),
      debit: 0, credit: Number(r.montant || 0), id: r.id,
    })
  }
  // Les lignes d'information restent EN TÊTE ; seuls les mouvements comptables
  // sont classés chronologiquement (le solde cumulé doit rester lisible).
  mouvements.sort((a, b) => {
    if (a.type === 'report' && b.type !== 'report') return -1
    if (b.type === 'report' && a.type !== 'report') return 1
    return a.date.localeCompare(b.date)
  })

  const statutColor = (s: string) => {
    if (s === 'paye') return { bg: '#ECFDF5', fg: '#065F46' }
    if (s === 'partiel') return { bg: '#FEF3C7', fg: '#92400E' }
    if (s === 'annule') return { bg: '#F1F5F9', fg: '#64748B' }
    if (s === 'brouillon') return { bg: '#EFF6FF', fg: '#1E40AF' }
    return { bg: '#FEE2E2', fg: '#991B1B' }
  }

  return (
    <div className="compte-famille-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .compte-famille-page { padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <button onClick={() => router.push('/' + ecole.slug + '/familles/' + familleId)}
            style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>
            ← Retour fiche famille
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>
            Compte client (411) — {famille.nom}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: '#EEF2FF', color: '#4338CA', borderRadius: 6, padding: '3px 9px' }}>
              {auxCode}
            </span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>Compte auxiliaire client · grand livre débit / crédit</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} style={btnSec}>Imprimer relevé</button>
          <button onClick={() => setShowModal(true)} style={btnPrim} disabled={facturesOuvertes.length === 0}>
            + Nouveau règlement
          </button>
        </div>
      </div>

      {/* Bascule vue administrative / vue comptable */}
      <div className="no-print" style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 9, padding: 3, marginBottom: 18 }}>
        <button onClick={() => router.push('/' + ecole.slug + '/familles/' + familleId + '?tab=facturation')}
          style={{ background: 'transparent', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: '#64748B', cursor: 'pointer' }}>
          Vue administrative
        </button>
        <button disabled
          style={{ background: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#1E293B', cursor: 'default', boxShadow: '0 1px 3px rgba(15,23,42,0.08)' }}>
          Vue comptable (411)
        </button>
      </div>

      <div className="print-only" style={{ display: 'none', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Compte client (411) — {ecole.nom}</h1>
        <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>
          {famille.nom} · {auxCode} · Édité le {new Date().toLocaleDateString('fr-FR')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <Card label="Total facturé" value={totalFacture} color="#1E293B" />
        <Card label="Total réglé" value={totalRegle} color="#065F46" />
        <Card label="Solde dû" value={soldeTotal} color={soldeTotal > 0 ? '#991B1B' : '#065F46'} highlight />
      </div>

      {/* Les soldes d'ouverture repris à la main ne correspondent à aucune
          facture en base : sans cette mention, l'écart entre le tableau des
          factures et les totaux ci-dessus serait inexplicable pour le lecteur. */}
      {reportsComptables.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 9, padding: '10px 14px', fontSize: 12, lineHeight: 1.55, marginBottom: 20 }}>
          Les totaux ci-dessus incluent {reportsComptables.length} solde(s) d&apos;ouverture repris manuellement
          ({(reportDebit - reportCredit).toFixed(2)} € net), dont les factures d&apos;origine ne sont pas dans TalmidApp.
          Ils ne figurent donc pas dans le tableau des factures ci-dessous, mais bien dans le relevé chronologique.
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 10px' }}>Factures ({factures.length})</h2>
        {factures.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune facture</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={th}>N°</th>
                  <th style={th}>Date</th>
                  <th style={th}>Statut</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Réglé</th>
                  <th style={{ ...th, textAlign: 'right' }}>Solde</th>
                </tr>
              </thead>
              <tbody>
                {factures.map(f => {
                  const c = statutColor(f.statut)
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={td}>{f.numero}</td>
                      <td style={td}>{new Date(f.date_emission).toLocaleDateString('fr-FR')}</td>
                      <td style={td}>
                        <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                          {labelStatutFacture(f.statut)}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{Number(f.total_facture).toFixed(2)} €</td>
                      <td style={{ ...td, textAlign: 'right', color: '#065F46' }}>{Number(f.total_regle).toFixed(2)} €</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: Number(f.solde_restant) > 0 ? '#991B1B' : '#065F46' }}>
                        {Number(f.solde_restant).toFixed(2)} €
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 10px' }}>Relevé chronologique</h2>
        {mouvements.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun mouvement</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Libellé</th>
                  <th style={{ ...th, textAlign: 'right' }}>Débit</th>
                  <th style={{ ...th, textAlign: 'right' }}>Crédit</th>
                  <th style={{ ...th, textAlign: 'right' }}>Solde cumulé</th>
                  <th className="no-print" style={{ ...th, width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let solde = 0
                  return mouvements.map(m => {
                    if (m.type === 'report') {
                      const rep = reports.find(r => r.id === m.id)
                      const montant = Number(m.montantInfo) || 0
                      // Un report comptabilisé pèse sur le solde cumulé comme
                      // n'importe quelle écriture : il doit être ajouté AVANT
                      // l'affichage de la ligne.
                      if (m.comptabilise) solde += m.debit - m.credit
                      return (
                        <tr key={m.type + m.id} style={{ borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                          <td style={td}>{m.date ? new Date(m.date).toLocaleDateString('fr-FR') : '—'}</td>
                          <td style={td}>
                            <span style={{
                              background: m.comptabilise ? '#FEF3C7' : '#EEF2FF',
                              color: m.comptabilise ? '#92400E' : '#4338CA',
                              fontSize: 10, fontWeight: 700,
                              padding: '2px 7px', borderRadius: 4, marginRight: 8, textTransform: 'uppercase',
                            }}>{m.comptabilise ? 'Solde d\'ouverture' : 'Information'}</span>
                            {m.libelle}
                            {!m.comptabilise && <span style={{ color: '#64748B' }}> — {montant.toFixed(2)} €</span>}
                            {rep ? (
                              <span style={{ color: '#94A3B8', fontSize: 11, display: 'block', marginTop: 3 }}>
                                Reprise dans l'échéancier : {labelModeReport(rep.mode)}
                                {' · déjà repris '}{Number(rep.montant_echeance || 0).toFixed(2)} €.
                                {' '}{phraseReport(rep)}
                              </span>
                            ) : null}
                          </td>
                          <td style={{ ...td, textAlign: 'right', color: m.debit > 0 ? '#1E293B' : '#CBD5E1' }}>
                            {m.debit > 0 ? m.debit.toFixed(2) + ' €' : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', color: m.credit > 0 ? '#065F46' : '#CBD5E1' }}>
                            {m.credit > 0 ? m.credit.toFixed(2) + ' €' : '—'}
                          </td>
                          <td style={{
                            ...td, textAlign: 'right',
                            fontWeight: m.comptabilise ? 600 : 400,
                            color: m.comptabilise ? (solde > 0 ? '#991B1B' : '#065F46') : '#CBD5E1',
                          }}>
                            {m.comptabilise ? solde.toFixed(2) + ' €' : '—'}
                          </td>
                          <td className="no-print" style={td}></td>
                        </tr>
                      )
                    }
                    solde += m.debit - m.credit
                    return (
                      <tr key={m.type + m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={td}>{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                        <td style={td}>{m.libelle}</td>
                        <td style={{ ...td, textAlign: 'right', color: m.debit > 0 ? '#1E293B' : '#CBD5E1' }}>
                          {m.debit > 0 ? m.debit.toFixed(2) + ' €' : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: m.credit > 0 ? '#065F46' : '#CBD5E1' }}>
                          {m.credit > 0 ? m.credit.toFixed(2) + ' €' : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: solde > 0 ? '#991B1B' : '#065F46' }}>
                          {solde.toFixed(2)} €
                        </td>
                        <td className="no-print" style={td}>
                          {m.type === 'reglement' && (
                            <button onClick={() => supprimerReglement(m.id)}
                              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 14 }}
                              title="Supprimer ce règlement">Suppr</button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Totaux</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1E293B' }}>{totalFacture.toFixed(2)} €</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#065F46' }}>{totalRegle.toFixed(2)} €</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: soldeTotal > 0 ? '#991B1B' : '#065F46' }}>{soldeTotal.toFixed(2)} €</td>
                  <td className="no-print" style={td}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="no-print" style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Nouveau règlement</h3>

            <Field label="Facture *">
              <select value={form.facture_id} onChange={e => setForm({ ...form, facture_id: e.target.value })} style={inp}>
                <option value="">— Choisir —</option>
                {facturesOuvertes.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.numero} — solde {Number(f.solde_restant).toFixed(2)} €
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Montant € *">
                <input type="number" step="0.01" value={form.montant}
                  onChange={e => setForm({ ...form, montant: e.target.value })} style={inp} />
              </Field>
              <Field label="Date">
                <input type="date" value={form.date_reglement}
                  onChange={e => setForm({ ...form, date_reglement: e.target.value })} style={inp} />
              </Field>
            </div>

            <Field label="Mode">
              <select value={form.mode_paiement} onChange={e => setForm({ ...form, mode_paiement: e.target.value })} style={inp}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>

            <Field label="Référence (n° chèque, etc.)">
              <input type="text" value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })} style={inp} />
            </Field>

            <Field label="Note">
              <input type="text" value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowModal(false)} style={btnSec} disabled={saving}>Annuler</button>
              <button onClick={saveReglement} style={btnPrim} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
const btnPrim: React.CSSProperties = { background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnSec: React.CSSProperties = { background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '8px 10px' }

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function Card({ label, value, color, highlight }: { label: string; value: number; color: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? color + '0F' : '#fff',
      border: '1px solid ' + (highlight ? color + '40' : '#E2E8F0'),
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value.toFixed(2)} €</div>
    </div>
  )
}
