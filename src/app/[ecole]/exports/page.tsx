'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { downloadCSV, formatDateCSV, formatMontantCSV } from '@/lib/csv-export'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'
import { logAction } from '@/lib/audit-log'

type ExportType = 'familles' | 'eleves' | 'factures' | 'reglements' | 'cheques' | 'fec'

export default function ExportsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const { exercices, exerciceSelectionne, selectExercice } = useExercice()
  const [loading, setLoading] = useState<ExportType | ''>('')
  const [msg, setMsg] = useState('')
  const [tranches, setTranches] = useState<{ id: string, code: string, libelle: string }[]>([])
  const [filtreTrancheFamilles, setFiltreTrancheFamilles] = useState<string>('')

  useEffect(() => {
    if (!ecole?.id) return
    createClient().from('tranches_facturation')
      .select('id, code, libelle')
      .eq('ecole_id', ecole.id)
      .order('ordre').then(({ data }) => setTranches(data || []))
  }, [ecole?.id])

  async function exportFamilles() {
    setLoading('familles'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'familles', tranche_id: filtreTrancheFamilles || null })
    const s = createClient()
    let query = s.from('familles')
      .select('numero, nom, situation_maritale, tranche_id, tranches_facturation(code, libelle), parent1_adresse, parent1_code_postal, parent1_ville, parent1_prenom, parent1_nom, parent1_email, parent1_telephone, parent2_prenom, parent2_nom, parent2_email, parent2_telephone, created_at')
      .eq('ecole_id', ecole.id)
    if (filtreTrancheFamilles) query = query.eq('tranche_id', filtreTrancheFamilles)
    const { data, error } = await query.order('nom')
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg('Aucune famille trouvée pour ce filtre'); setLoading(''); return }
    const trancheSelectionnee = filtreTrancheFamilles ? tranches.find(t => t.id === filtreTrancheFamilles) : null
    const suffixeFichier = trancheSelectionnee ? `-${trancheSelectionnee.code}` : ''
    const suffixeMsg = trancheSelectionnee ? ` (tranche ${trancheSelectionnee.code})` : ''
    downloadCSV(
      `familles-${ecole.slug}${suffixeFichier}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Numéro', 'Nom famille', 'Situation', 'Code tranche', 'Libellé tranche', 'Adresse', 'Resp1 prénom', 'Resp1 nom', 'Resp1 email', 'Resp1 tél', 'Resp2 prénom', 'Resp2 nom', 'Resp2 email', 'Resp2 tél', 'Créé le'],
      data.map((f: any) => [
        f.numero, f.nom, f.situation_maritale,
        f.tranches_facturation?.code || '',
        f.tranches_facturation?.libelle || '',
        [f.parent1_adresse, f.parent1_code_postal, f.parent1_ville].filter(Boolean).join(' '),
        f.parent1_prenom, f.parent1_nom, f.parent1_email, f.parent1_telephone,
        f.parent2_prenom, f.parent2_nom, f.parent2_email, f.parent2_telephone,
        formatDateCSV(f.created_at),
      ])
    )
    setMsg(`✓ ${data.length} familles exportées${suffixeMsg}`)
    setLoading('')
  }

  async function exportEleves() {
    setLoading('eleves'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'eleves' })
    const s = createClient()
    const { data, error } = await s.from('enfants')
      .select('prenom, nom, date_naissance, classe_id, transport, instruction_religieuse, etude_garderie, statut_inscription, annee_scolaire, familles(numero, nom), classes(nom)')
      .eq('annee_scolaire', annee)
      .order('nom')
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg(`Aucun élève trouvé pour ${annee}`); setLoading(''); return }
    const rows = data.map((e: any) => [
      e.prenom, e.nom, formatDateCSV(e.date_naissance),
      e.familles?.numero || '', e.familles?.nom || '',
      e.classes?.nom || '',
      e.statut_inscription || '',
      e.transport ? 'Oui' : 'Non',
      e.instruction_religieuse ? 'Oui' : 'Non',
      e.etude_garderie ? 'Oui' : 'Non',
      e.annee_scolaire || '',
    ])
    downloadCSV(
      `eleves-${annee}-${ecole.slug}.csv`,
      ['Prénom', 'Nom', 'Date naissance', 'N° famille', 'Nom famille', 'Classe', 'Statut', 'Transport', 'Instruction religieuse', 'Étude/Garderie', 'Année'],
      rows,
    )
    setMsg(`✓ ${rows.length} élèves exportés (${annee})`)
    setLoading('')
  }

  async function exportFactures() {
    setLoading('factures'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'factures' })
    const s = createClient()
    const { data, error } = await s.from('factures_solde')
      .select('numero, date_emission, annee_scolaire, statut, total_facture, total_regle, solde_restant, familles(numero, nom)')
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
      formatMontantCSV(f.solde_restant),
    ])
    downloadCSV(
      `factures-${annee}-${ecole.slug}.csv`,
      ['N° facture', 'Date émission', 'N° famille', 'Nom famille', 'Année', 'Statut', 'Total facturé €', 'Total réglé €', 'Solde restant €'],
      rows,
    )
    setMsg(`✓ ${rows.length} factures exportées (${annee})`)
    setLoading('')
  }

  async function exportReglements() {
    setLoading('reglements'); setMsg('')
    logAction(createClient(), ecole.id, 'export_csv', { type: 'reglements' })
    const s = createClient()
    const { data, error } = await s.from('reglements')
      .select('date_reglement, montant, mode, reference, notes, factures!inner(numero, annee_scolaire, famille_id, familles(numero, nom))')
      .eq('factures.annee_scolaire', annee)
      .order('date_reglement', { ascending: false })
    if (error) { setMsg('❌ Erreur : ' + error.message); setLoading(''); return }
    if (!data || data.length === 0) { setMsg(`Aucun règlement trouvé pour ${annee}`); setLoading(''); return }
    const rows = data.map((r: any) => [
      formatDateCSV(r.date_reglement),
      formatMontantCSV(r.montant),
      r.mode || '',
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

  const exports: { id: ExportType; titre: string; desc: string; icon: string; fn: () => Promise<void>; depend_annee: boolean }[] = [
    { id: 'familles', titre: 'Familles', desc: 'Toutes les familles avec responsables et contacts.', icon: '👨‍👩‍👧', fn: exportFamilles, depend_annee: false },
    { id: 'eleves', titre: 'Élèves', desc: 'Tous les élèves inscrits pour l\'exercice sélectionné.', icon: '🎓', fn: exportEleves, depend_annee: true },
    { id: 'factures', titre: 'Factures', desc: 'Liste des factures avec montants, soldes, statuts.', icon: '💰', fn: exportFactures, depend_annee: true },
    { id: 'reglements', titre: 'Règlements', desc: 'Tous les paiements encaissés (chèques, virements, CB…).', icon: '💸', fn: exportReglements, depend_annee: true },
    { id: 'cheques', titre: 'Chèques (caution et autres)', desc: 'Suivi de tous les chèques (prévus, encaissés, restitués).', icon: '💳', fn: exportCheques, depend_annee: false },
    { id: 'fec', titre: 'FEC — Fichier Échanges Comptables', desc: 'Export réglementaire France (BOFIP) pour votre comptable / contrôle fiscal. Format TXT normé.', icon: '📑', fn: exportFEC, depend_annee: true },
  ]

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
            <button onClick={e.fn} disabled={loading === e.id}
              style={{ ...btn, opacity: loading === e.id ? 0.6 : 1, cursor: loading === e.id ? 'wait' : 'pointer', alignSelf: 'flex-start' }}>
              {loading === e.id ? 'Génération…' : '⬇ Télécharger CSV'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14, fontSize: 12, color: '#1E40AF' }}>
        ℹ️ Les fichiers CSV s&apos;ouvrent directement dans Excel, LibreOffice ou Google Sheets. UTF-8 BOM inclus pour les accents.
      </div>
    </div>
  )
}
