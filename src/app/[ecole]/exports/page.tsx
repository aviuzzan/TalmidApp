'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { downloadCSV, formatDateCSV, formatMontantCSV } from '@/lib/csv-export'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'
import { logAction } from '@/lib/audit-log'
import { COLONNES_FAMILLES, COLONNES_ELEVES, type ColonneExport } from '@/lib/export-colonnes'
import { useAccesFinances } from '@/lib/acces-finances'

type ExportType = 'familles' | 'eleves' | 'factures' | 'reglements' | 'cheques' | 'fec'
type ExportAvecColonnes = 'familles' | 'eleves'

const COLS_CONFIG: Record<ExportAvecColonnes, ColonneExport[]> = {
  familles: COLONNES_FAMILLES,
  eleves: COLONNES_ELEVES,
}

function colonnesParDefaut(config: ColonneExport[]): string[] {
  return config.filter(c => c.defaut).map(c => c.key)
}

export default function ExportsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const { acces: accesFinances } = useAccesFinances()
  const annee = useAnneeScolaireActive()
  const { exercices, exerciceSelectionne, selectExercice } = useExercice()
  const [loading, setLoading] = useState<ExportType | ''>('')
  const [msg, setMsg] = useState('')
  const [tranches, setTranches] = useState<{ id: string, code: string, libelle: string }[]>([])
  const [filtreTrancheFamilles, setFiltreTrancheFamilles] = useState<string>('')
  const [colsSelection, setColsSelection] = useState<Record<ExportAvecColonnes, string[]>>({
    familles: colonnesParDefaut(COLONNES_FAMILLES),
    eleves: colonnesParDefaut(COLONNES_ELEVES),
  })
  const [colsModal, setColsModal] = useState<ExportAvecColonnes | null>(null)

  useEffect(() => {
    if (!ecole?.id) return
    createClient().from('tranches_facturation')
      .select('id, code, libelle')
      .eq('ecole_id', ecole.id)
      .order('ordre').then(({ data }) => setTranches(data || []))
    // Sélection de colonnes mémorisée par école (localStorage)
    const lire = (type: ExportAvecColonnes): string[] => {
      try {
        const raw = localStorage.getItem(`talmid_export_cols_${type}_${ecole.id}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            const valides = parsed.filter((k: any) => COLS_CONFIG[type].some(c => c.key === k))
            if (valides.length > 0) return valides
          }
        }
      } catch { /* localStorage indisponible ou JSON corrompu → défaut */ }
      return colonnesParDefaut(COLS_CONFIG[type])
    }
    setColsSelection({ familles: lire('familles'), eleves: lire('eleves') })
  }, [ecole?.id])

  function setCols(type: ExportAvecColonnes, keys: string[]) {
    setColsSelection(p => ({ ...p, [type]: keys }))
    try {
      localStorage.setItem(`talmid_export_cols_${type}_${ecole.id}`, JSON.stringify(keys))
    } catch { /* localStorage indisponible */ }
  }

  async function exportFamilles() {
    const colonnes = COLONNES_FAMILLES.filter(c => colsSelection.familles.includes(c.key))
    if (colonnes.length === 0) { setMsg('❌ Aucune colonne sélectionnée pour l\'export familles'); return }
    setLoading('familles'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'familles', tranche_id: filtreTrancheFamilles || null, colonnes: colonnes.map(c => c.key) })
    const s = createClient()
    let query = s.from('familles')
      .select('numero, nom, situation_maritale, statut_dossier, mode_paiement, part_pere, part_mere, garde, autorite_parentale, tranche_id, tranches_facturation(code, libelle), parent1_adresse, parent1_code_postal, parent1_ville, parent1_prenom, parent1_nom, parent1_email, parent1_telephone, parent1_emploi, parent2_prenom, parent2_nom, parent2_email, parent2_telephone, parent2_emploi, parent2_adresse, parent2_code_postal, parent2_ville')
      .eq('ecole_id', ecole.id)
    if (filtreTrancheFamilles) query = query.eq('tranche_id', filtreTrancheFamilles)
    const { data, error } = await query.order('nom')
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg('Aucune famille trouvée pour ce filtre'); setLoading(''); return }
    const trancheSelectionnee = filtreTrancheFamilles ? tranches.find(t => t.id === filtreTrancheFamilles) : null
    const suffixeFichier = trancheSelectionnee ? `-${trancheSelectionnee.code}` : ''
    const suffixeMsg = trancheSelectionnee ? ` (tranche ${trancheSelectionnee.code})` : ''
    const rows = data.map((f: any) => {
      const valeurs: Record<string, any> = {
        numero: f.numero,
        nom: f.nom,
        situation_maritale: f.situation_maritale,
        tranche_code: f.tranches_facturation?.code || '',
        tranche_libelle: f.tranches_facturation?.libelle || '',
        adresse: [f.parent1_adresse, f.parent1_code_postal, f.parent1_ville].filter(Boolean).join(' '),
        parent1_prenom: f.parent1_prenom,
        parent1_nom: f.parent1_nom,
        parent1_email: f.parent1_email,
        parent1_telephone: f.parent1_telephone,
        parent2_prenom: f.parent2_prenom,
        parent2_nom: f.parent2_nom,
        parent2_email: f.parent2_email,
        parent2_telephone: f.parent2_telephone,
        mode_paiement: f.mode_paiement || '',
        statut_dossier: f.statut_dossier || '',
        parent1_emploi: f.parent1_emploi || '',
        parent2_emploi: f.parent2_emploi || '',
        part_pere: f.part_pere ?? '',
        part_mere: f.part_mere ?? '',
        garde: f.garde || '',
        autorite_parentale: f.autorite_parentale || '',
        parent2_adresse: f.parent2_adresse || '',
        parent2_code_postal: f.parent2_code_postal || '',
        parent2_ville: f.parent2_ville || '',
      }
      return colonnes.map(c => valeurs[c.key])
    })
    downloadCSV(
      `familles-${ecole.slug}${suffixeFichier}-${new Date().toISOString().slice(0, 10)}.csv`,
      colonnes.map(c => c.label),
      rows,
    )
    setMsg(`✓ ${data.length} familles exportées${suffixeMsg}`)
    setLoading('')
  }

  async function exportEleves() {
    const colonnes = COLONNES_ELEVES.filter(c => colsSelection.eleves.includes(c.key))
    if (colonnes.length === 0) { setMsg('❌ Aucune colonne sélectionnée pour l\'export élèves'); return }
    setLoading('eleves'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'eleves', colonnes: colonnes.map(c => c.key) })
    const s = createClient()
    const { data, error } = await s.from('enfants')
      .select('prenom, deuxieme_prenom, nom, genre, date_naissance, lieu_naissance, ine, regime, date_sortie, classe_id, transport, instruction_religieuse, etude_garderie, statut_inscription, annee_scolaire, familles(numero, nom, parent1_email, parent1_telephone), classes(nom)')
      .eq('annee_scolaire', annee)
      .order('nom')
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg(`Aucun élève trouvé pour ${annee}`); setLoading(''); return }
    const rows = data.map((e: any) => {
      const valeurs: Record<string, any> = {
        prenom: e.prenom,
        nom: e.nom,
        date_naissance: formatDateCSV(e.date_naissance),
        famille_numero: e.familles?.numero || '',
        famille_nom: e.familles?.nom || '',
        classe: e.classes?.nom || '',
        statut: e.statut_inscription || '',
        transport: e.transport ? 'Oui' : 'Non',
        instruction_religieuse: e.instruction_religieuse ? 'Oui' : 'Non',
        etude_garderie: e.etude_garderie ? 'Oui' : 'Non',
        annee: e.annee_scolaire || '',
        deuxieme_prenom: e.deuxieme_prenom || '',
        genre: e.genre || '',
        lieu_naissance: e.lieu_naissance || '',
        ine: e.ine || '',
        regime: e.regime || '',
        parent1_email: e.familles?.parent1_email || '',
        parent1_telephone: e.familles?.parent1_telephone || '',
        date_sortie: formatDateCSV(e.date_sortie),
      }
      return colonnes.map(c => valeurs[c.key])
    })
    downloadCSV(
      `eleves-${annee}-${ecole.slug}.csv`,
      colonnes.map(c => c.label),
      rows,
    )
    setMsg(`✓ ${rows.length} élèves exportés (${annee})`)
    setLoading('')
  }

  async function exportFactures() {
    setLoading('factures'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'factures' })
    const s = createClient()
    // NOTE : `total_regle` exclut désormais les avoirs imputés. On expose donc
    // `total_avoirs_imputes` dans une colonne séparée pour traçabilité comptable.
    const { data, error } = await s.from('factures_solde')
      .select('numero, date_emission, annee_scolaire, statut, total_facture, total_regle, total_avoirs_imputes, solde_restant, familles(numero, nom)')
      .eq('annee_scolaire', annee)
      .order('date_emission', { ascending: false })
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg(`Aucune facture trouvée pour ${annee}`); setLoading(''); return }
    const rows = data.map((f: any) => [
      f.numero,
      formatDateCSV(f.date_emission),
      f.familles?.numero || '',
      f.familles?.nom || '',
      f.annee_scolaire,
      f.statut,
      formatMontantCSV(f.total_facture),
      formatMontantCSV(f.total_regle),
      formatMontantCSV(f.total_avoirs_imputes ?? 0),
      formatMontantCSV(f.solde_restant),
    ])
    downloadCSV(
      `factures-${annee}-${ecole.slug}.csv`,
      ['N° facture', 'Date émission', 'N° famille', 'Nom famille', 'Année', 'Statut', 'Total facturé €', 'Total réglé €', 'Avoirs imputés €', 'Solde restant €'],
      rows,
    )
    setMsg(`✓ ${rows.length} factures exportées (${annee})`)
    setLoading('')
  }

  async function exportReglements() {
    setLoading('reglements'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'reglements' })
    const s = createClient()
    // FIX audit 24/07/2026 (#372) : colonne mode_paiement, pas mode (inexistante — la requete echouait)
    // FIX audit 27/07/2026 : exclure les avoirs imputes (mode 'avoir') — ce ne sont pas
    // des encaissements de tresorerie. Le FEC les exclut deja : les deux exports se
    // rapprochent desormais. (L'export Factures a sa colonne "Avoirs imputes" dediee.)
    const { data, error } = await s.from('reglements')
      .select('date_reglement, montant, mode_paiement, reference, notes, factures!inner(numero, annee_scolaire, famille_id, familles(numero, nom))')
      .eq('factures.annee_scolaire', annee)
      .neq('mode_paiement', 'avoir')
      .order('date_reglement', { ascending: false })
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg(`Aucun règlement trouvé pour ${annee}`); setLoading(''); return }
    const rows = data.map((r: any) => [
      formatDateCSV(r.date_reglement),
      formatMontantCSV(r.montant),
      r.mode_paiement || '',
      r.reference || '',
      r.factures?.numero || '',
      r.factures?.familles?.numero || '',
      r.factures?.familles?.nom || '',
      r.notes || '',
    ])
    downloadCSV(
      `reglements-${annee}-${ecole.slug}.csv`,
      ['Date', 'Montant €', 'Mode', 'Référence', 'N° facture', 'N° famille', 'Nom famille', 'Notes'],
      rows,
    )
    setMsg(`✓ ${rows.length} règlements exportés (${annee})`)
    setLoading('')
  }

  async function exportFEC() {
    setLoading('fec'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'fec' })
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    // Périodes FEC : début + fin de l'exercice (par défaut 1er sept → 31 août année suivante)
    const [yDeb, yFin] = annee.split('-')
    const debut = `${yDeb}-09-01`
    const fin = `${yFin}-08-31`
    try {
      const res = await fetch(`/api/compta/fec?ecole_id=${ecole.id}&debut=${debut}&fin=${fin}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(err.error || 'Erreur génération FEC')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `FEC-${ecole.slug}-${annee}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setMsg(`✓ FEC exporté (${annee})`)
    } catch (e: any) {
      setMsg('❌ ' + e.message)
    }
    setLoading('')
  }

  async function exportCheques() {
    setLoading('cheques'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'cheques' })
    const s = createClient()
    const { data, error } = await s.from('cheques_prevus')
      .select('numero_cheque, montant, date_echeance, statut, encaisse_le, mode_paiement, note, familles(numero, nom, parent1_prenom, parent1_nom)')
      .eq('ecole_id', ecole.id)
      .order('date_echeance', { ascending: true })
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg('Aucun chèque trouvé'); setLoading(''); return }
    const rows = data.map((c: any) => [
      c.numero_cheque,
      formatMontantCSV(c.montant),
      formatDateCSV(c.date_echeance),
      c.statut,
      formatDateCSV(c.encaisse_le),
      c.mode_paiement || '',
      c.familles?.numero || '',
      c.familles?.nom || '',
      `${c.familles?.parent1_prenom || ''} ${c.familles?.parent1_nom || ''}`.trim(),
      c.note || '',
    ])
    downloadCSV(
      `cheques-${ecole.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['N° chèque', 'Montant €', 'Échéance', 'Statut', 'Encaissé le', 'Mode', 'N° famille', 'Nom famille', 'Tireur', 'Note'],
      rows,
    )
    setMsg(`✓ ${rows.length} chèques exportés`)
    setLoading('')
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }
  const btn: React.CSSProperties = { background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }
  const btnSec: React.CSSProperties = { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }

  // llll2 (fix revue Fable) : les 4 exports FINANCIERS ne sont proposes qu'avec acces_finances.
  const exportsBase: { id: ExportType; titre: string; desc: string; icon: string; fn: () => Promise<void>; depend_annee: boolean; finance?: boolean }[] = [
    { id: 'familles', titre: 'Familles', desc: 'Toutes les familles avec responsables et contacts.', icon: '👨‍👩‍👧', fn: exportFamilles, depend_annee: false },
    { id: 'eleves', titre: 'Élèves', desc: 'Tous les élèves inscrits pour l\'exercice sélectionné.', icon: '🎓', fn: exportEleves, depend_annee: true },
    { id: 'factures', titre: 'Factures', desc: 'Liste des factures avec montants, soldes, statuts.', icon: '💰', fn: exportFactures, depend_annee: true, finance: true },
    { id: 'reglements', titre: 'Règlements', desc: 'Tous les paiements encaissés (chèques, virements, CB…).', icon: '💸', fn: exportReglements, depend_annee: true, finance: true },
    { id: 'cheques', titre: 'Chèques (caution et autres)', desc: 'Suivi de tous les chèques (prévus, encaissés, restitués).', icon: '💳', fn: exportCheques, depend_annee: false, finance: true },
    { id: 'fec', titre: 'FEC — Fichier Échanges Comptables', desc: 'Export réglementaire France (BOFIP) pour votre comptable / contrôle fiscal. Format TXT normé.', icon: '📑', fn: exportFEC, depend_annee: true, finance: true },
  ]
  const exports = exportsBase.filter(e => !e.finance || accesFinances)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Exports CSV</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
            Téléchargez vos données au format Excel-compatible (CSV UTF-8, séparateur point-virgule).
          </p>
        </div>
        <select value={exerciceSelectionne?.id || ''} onChange={e => selectExercice(e.target.value)}
          style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
          {exercices.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.code}</option>
          ))}
        </select>
      </div>

      {msg && (
        <div style={{
          background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2',
          color: msg.startsWith('✓') ? '#065F46' : '#991B1B',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        }}>{msg}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {exports.map(e => (
          <div key={e.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 28 }}>{e.icon}</div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>{e.titre}</h3>
                {e.depend_annee && <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Exercice {annee}</div>}
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5 }}>{e.desc}</p>
            {e.id === 'familles' && tranches.length > 0 && (
              <select
                value={filtreTrancheFamilles}
                onChange={ev => setFiltreTrancheFamilles(ev.target.value)}
                style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#1E293B', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                <option value="">Toutes les tranches</option>
                {tranches.map(t => (
                  <option key={t.id} value={t.id}>{t.code} — {t.libelle}</option>
                ))}
              </select>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={e.fn} disabled={loading === e.id}
                style={{ ...btn, opacity: loading === e.id ? 0.6 : 1, cursor: loading === e.id ? 'wait' : 'pointer' }}>
                {loading === e.id ? 'Génération…' : '⬇ Télécharger CSV'}
              </button>
              {(e.id === 'familles' || e.id === 'eleves') && (
                <button onClick={() => setColsModal(e.id as ExportAvecColonnes)} style={btnSec}>
                  ⚙ Colonnes ({colsSelection[e.id as ExportAvecColonnes].length})
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14, fontSize: 12, color: '#1E40AF' }}>
        ℹ️ Les fichiers CSV s&apos;ouvrent directement dans Excel, LibreOffice ou Google Sheets. UTF-8 BOM inclus pour les accents.
      </div>

      {/* Modal choix des colonnes (Familles / Élèves) */}
      {colsModal && (() => {
        const type = colsModal
        const config = COLS_CONFIG[type]
        const sel = colsSelection[type]
        const toggle = (key: string) => {
          const next = sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key]
          // On conserve l'ordre canonique des colonnes
          setCols(type, config.filter(c => next.includes(c.key)).map(c => c.key))
        }
        const exporter = type === 'familles' ? exportFamilles : exportEleves
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: 0 }}>
                  ⚙ Colonnes de l&apos;export {type === 'familles' ? 'Familles' : 'Élèves'}
                </h2>
                <button onClick={() => setColsModal(null)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748B' }}>✕</button>
              </div>

              <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setCols(type, config.map(c => c.key))} style={{ ...btnSec, padding: '6px 12px', fontSize: 12 }}>Tout</button>
                  <button onClick={() => setCols(type, [])} style={{ ...btnSec, padding: '6px 12px', fontSize: 12 }}>Rien</button>
                  <button onClick={() => setCols(type, colonnesParDefaut(config))} style={{ ...btnSec, padding: '6px 12px', fontSize: 12 }}>Par défaut</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  {config.map(c => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer', padding: '4px 0' }}>
                      <input type="checkbox" checked={sel.includes(c.key)} onChange={() => toggle(c.key)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                      {c.label}
                      {!c.defaut && <span style={{ fontSize: 10, color: '#94A3B8' }}>(extra)</span>}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                  <span style={{ fontSize: 12, color: '#64748B' }}>{sel.length} colonne{sel.length > 1 ? 's' : ''} sélectionnée{sel.length > 1 ? 's' : ''}</span>
                  <button
                    onClick={() => { setColsModal(null); exporter() }}
                    disabled={sel.length === 0}
                    style={{ ...btn, opacity: sel.length === 0 ? 0.5 : 1, cursor: sel.length === 0 ? 'not-allowed' : 'pointer' }}>
                    ⬇ Exporter avec ces colonnes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
