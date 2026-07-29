'use client'
/**
 * ssss2-D — CLÔTURE D'EXERCICE ET REPORT DE SOLDE
 *
 * Écran de clôture qui fait vraiment quelque chose : contrôles préalables,
 * soldes réels, arbitrage famille par famille des reports, puis verrouillage.
 *
 * RAPPEL MÉTIER — à ne pas perdre de vue en modifiant ce fichier :
 * le solde impayé d'une famille vit sur son compte client 411, compte de
 * BILAN repris à l'ouverture de l'exercice suivant par les à-nouveaux.
 * Il n'y a RIEN à reporter comptablement. Cet écran ne crée donc AUCUNE
 * facture et AUCUNE ligne de facture : refacturer un solde le compterait deux
 * fois et relancerait le délai de prescription. Ce qu'on produit ici est un
 * objet de gestion (`reports_solde`), repris dans l'échéancier de l'année
 * suivante et affiché en information sur le relevé et le portail.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { logAction } from '@/lib/audit-log'
import { chargerParLots, chargerParTranchesEtLots } from '@/lib/pagination'
import { cloturerExercice, rouvrirExercice, statutLabel, type Exercice } from '@/lib/exercice'
import {
  MODES_REPORT,
  MODE_REPORT_DEFAUT,
  aideModeReport,
  annulerReport,
  appliquerReportsExercice,
  calculerSoldesCloture,
  changerModeReport,
  chargerModeReportEcole,
  chargerReports,
  labelModeReport,
  proposerReportsSolde,
  saisirReportSolde,
  validerReports,
  type ModeReport,
  type ReportSoldeAvecFamille,
  type ResultatApplicationReports,
  type SoldeCloture,
} from '@/lib/report-solde'

type Controles = {
  facturesBrouillon: number
  facturesNonVerrouillees: number
  reglementsNonPointes: number
  famillesSansCompteAuxiliaire: number
  anomalie: string | null
}

type FamilleLegere = { id: string; nom: string | null; numero: string | null }

const EUR = (n: number) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export default function CloturePage() {
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()
  const confirm = useConfirm()
  const { exercices, loading: exercicesLoading, reload: reloadExercices } = useExercice()

  const [origineId, setOrigineId] = useState('')
  const [cibleId, setCibleId] = useState('')
  const [modeEcole, setModeEcole] = useState<ModeReport>(MODE_REPORT_DEFAUT)

  const [controles, setControles] = useState<Controles | null>(null)
  const [soldes, setSoldes] = useState<SoldeCloture[]>([])
  const [soldesTronques, setSoldesTronques] = useState(false)
  const [reports, setReports] = useState<ReportSoldeAvecFamille[]>([])
  const [familles, setFamilles] = useState<FamilleLegere[]>([])

  const [chargementControles, setChargementControles] = useState(false)
  const [chargementSoldes, setChargementSoldes] = useState(false)
  const [chargementReports, setChargementReports] = useState(false)
  const [travailEnCours, setTravailEnCours] = useState(false)
  const [seuil, setSeuil] = useState('1.00')
  // Compte rendu de la dernière application des reports à l'échéancier.
  const [application, setApplication] = useState<ResultatApplicationReports | null>(null)
  const [applicationEnCours, setApplicationEnCours] = useState(false)

  // Saisie d'un solde d'ouverture (année précédente non facturée dans l'outil)
  const [saisieFamilleId, setSaisieFamilleId] = useState('')
  const [saisieFiltre, setSaisieFiltre] = useState('')
  const [saisieMontant, setSaisieMontant] = useState('')
  const [saisieMode, setSaisieMode] = useState<ModeReport>(MODE_REPORT_DEFAUT)
  const [saisieNote, setSaisieNote] = useState('')

  const origine = useMemo(() => exercices.find(e => e.id === origineId) ?? null, [exercices, origineId])
  const cible = useMemo(() => exercices.find(e => e.id === cibleId) ?? null, [exercices, cibleId])

  // ── Sélection par défaut : exercice le plus récent = cible, le précédent = origine.
  useEffect(() => {
    if (exercicesLoading || exercices.length === 0) return
    setCibleId(prev => prev || exercices[0].id)
    setOrigineId(prev => prev || (exercices[1]?.id ?? exercices[0].id))
  }, [exercices, exercicesLoading])

  // Si l'exercice d'origine chaîne explicitement un suivant, on l'adopte comme cible.
  useEffect(() => {
    if (!origine?.exercice_suivant_id) return
    if (exercices.some(e => e.id === origine.exercice_suivant_id)) {
      setCibleId(origine.exercice_suivant_id)
    }
  }, [origine, exercices])

  useEffect(() => {
    if (!ecole?.id) return
    chargerModeReportEcole(createClient(), ecole.id).then(m => {
      setModeEcole(m)
      setSaisieMode(m)
    })
  }, [ecole?.id])

  // ── Familles de l'école (sélecteur de la saisie manuelle). Paginé : au-delà
  //    de 1000 familles, une lecture simple serait tronquée sans le dire.
  useEffect(() => {
    if (!ecole?.id) return
    const s = createClient()
    chargerParLots<FamilleLegere>((debut, fin) => s
      .from('familles')
      .select('id, nom, numero')
      .eq('ecole_id', ecole.id)
      .order('nom', { ascending: true })
      .order('id', { ascending: true })
      .range(debut, fin)).then(res => {
      if (res.error) { console.error('[cloture] familles :', res.error); return }
      setFamilles(res.rows)
    })
  }, [ecole?.id])

  // ────────────────────────────────────────────────────────────────────────
  // Étape 2 — contrôles préalables (informatifs, non bloquants)
  // ────────────────────────────────────────────────────────────────────────
  const chargerControles = useCallback(async () => {
    if (!ecole?.id || !origine) return
    setChargementControles(true)
    const s = createClient()
    const code = origine.code
    let anomalie: string | null = null

    // `factures` n'a pas de colonne `ecole_id` : le cloisonnement passe par
    // `familles!inner(ecole_id)`, comme dans l'export FEC.
    const compter = async (appliquer: (q: any) => any): Promise<number | null> => {
      const q = appliquer(s.from('factures')
        .select('id, familles!inner(ecole_id)', { count: 'exact', head: true })
        .eq('familles.ecole_id', ecole.id)
        .eq('annee_scolaire', code))
      const { count, error } = await q
      if (error) { anomalie = error.message; return null }
      return count ?? 0
    }

    const [brouillon, nonVerrouillees] = await Promise.all([
      compter((q: any) => q.eq('statut', 'brouillon')),
      compter((q: any) => q.not('statut', 'in', '("annule","brouillon")').or('verrouillee.is.null,verrouillee.eq.false')),
    ])

    const { count: sansAux, error: auxErr } = await s
      .from('familles')
      .select('id', { count: 'exact', head: true })
      .eq('ecole_id', ecole.id)
      .is('compte_auxiliaire', null)
    if (auxErr) anomalie = auxErr.message

    // Règlements non pointés : règlements rattachés aux factures de l'exercice
    // qui n'ont aucun mouvement bancaire rapproché. Deux lectures paginées —
    // au-delà de 1000 règlements, un comptage naïf serait faux, pas partiel.
    let nonPointes: number | null = null
    const resRegl = await chargerParLots<{ id: string }>((debut, fin) => s
      .from('reglements')
      .select('id, factures!inner(annee_scolaire, familles!inner(ecole_id))')
      .eq('factures.familles.ecole_id', ecole.id)
      .eq('factures.annee_scolaire', code)
      .order('id', { ascending: true })
      .range(debut, fin))
    if (resRegl.error) {
      anomalie = resRegl.error
    } else if (resRegl.tronque) {
      anomalie = 'Lecture des règlements tronquée (garde-fou de pagination).'
    } else {
      const ids = resRegl.rows.map(r => r.id)
      const resMvt = await chargerParTranchesEtLots<{ reglement_id: string }>(ids, (tranche, debut, fin) => s
        .from('mouvements_bancaires')
        .select('reglement_id')
        .eq('ecole_id', ecole.id)
        .eq('statut', 'rapproche')
        .in('reglement_id', tranche)
        .order('reglement_id', { ascending: true })
        .order('id', { ascending: true })
        .range(debut, fin))
      if (resMvt.error) anomalie = resMvt.error
      else {
        const pointes = new Set(resMvt.rows.map(m => m.reglement_id).filter(Boolean))
        nonPointes = ids.filter(id => !pointes.has(id)).length
      }
    }

    setControles({
      facturesBrouillon: brouillon ?? 0,
      facturesNonVerrouillees: nonVerrouillees ?? 0,
      reglementsNonPointes: nonPointes ?? 0,
      famillesSansCompteAuxiliaire: sansAux ?? 0,
      anomalie,
    })
    setChargementControles(false)
  }, [ecole?.id, origine])

  // ────────────────────────────────────────────────────────────────────────
  // Étape 3 — soldes de clôture
  // ────────────────────────────────────────────────────────────────────────
  const chargerSoldes = useCallback(async () => {
    if (!ecole?.id || !origineId) return
    setChargementSoldes(true)
    const res = await calculerSoldesCloture(createClient(), ecole.id, origineId)
    if (res.error) {
      toast.error('Calcul des soldes : ' + res.error)
      setSoldes([])
    } else {
      const lignes = [...res.rows].sort((a, b) => Number(b.solde) - Number(a.solde))
      setSoldes(lignes)
    }
    setSoldesTronques(res.tronque)
    setChargementSoldes(false)
    // `toast` n'est pas mémoïsé par son provider : l'inclure ferait changer
    // l'identité de ce callback à chaque toast affiché, et re-déclencherait
    // les effets qui en dépendent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, origineId])

  // ────────────────────────────────────────────────────────────────────────
  // Étapes 4-5 — propositions de report
  // ────────────────────────────────────────────────────────────────────────
  const chargerPropositions = useCallback(async () => {
    if (!ecole?.id || !origineId || !cibleId) return
    setChargementReports(true)
    const res = await chargerReports(createClient(), {
      ecoleId: ecole.id,
      exerciceOrigineId: origineId,
      exerciceCibleId: cibleId,
      statuts: ['propose', 'valide'],
    })
    if (res.error) toast.error('Lecture des reports : ' + res.error)
    if (res.tronque) toast.error('Lecture des reports tronquée : la liste est incomplète.')
    setReports([...res.rows].sort((a, b) => Number(b.montant) - Number(a.montant)))
    setChargementReports(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id, origineId, cibleId])

  useEffect(() => {
    if (!origineId || !cibleId) return
    setControles(null); setSoldes([]); setReports([]); setApplication(null)
    chargerPropositions()
  }, [origineId, cibleId, chargerPropositions])

  async function handleProposer() {
    if (!origine || !cible) return
    if (origine.id === cible.id) { toast.error('L\'exercice cible doit être différent de l\'exercice à clôturer.'); return }
    const seuilNum = Number(seuil.replace(',', '.'))
    if (!Number.isFinite(seuilNum) || seuilNum < 0) { toast.error('Seuil invalide.'); return }
    setTravailEnCours(true)
    const res = await proposerReportsSolde(createClient(), {
      ecoleId: ecole.id,
      exerciceOrigineId: origine.id,
      exerciceCibleId: cible.id,
      seuil: seuilNum,
    })
    setTravailEnCours(false)
    if (!res.ok) { toast.error('Proposition des reports : ' + res.error); return }
    toast.success(`${res.resultat?.reports_crees ?? 0} report(s) proposé(s) · débiteur ${EUR(res.resultat?.total_debiteur ?? 0)} · créditeur ${EUR(res.resultat?.total_crediteur ?? 0)}`)
    await logAction(createClient(), ecole.id, 'reports_solde_proposes', {
      exercice_origine_id: origine.id, exercice_cible_id: cible.id,
      seuil: seuilNum, reports_crees: res.resultat?.reports_crees ?? 0,
    })
    await chargerPropositions()
  }

  async function handleChangerMode(report: ReportSoldeAvecFamille, mode: ModeReport) {
    const avant = report.mode
    setReports(rs => rs.map(r => (r.id === report.id ? { ...r, mode } : r)))
    const res = await changerModeReport(createClient(), report.id, mode)
    if (!res.ok) {
      setReports(rs => rs.map(r => (r.id === report.id ? { ...r, mode: avant } : r)))
      toast.error(res.error || 'Mode non enregistré')
    }
  }

  async function handleEcarter(report: ReportSoldeAvecFamille) {
    const ok = await confirm({
      title: 'Écarter ce report ?',
      message: `Le reliquat de ${report.familles?.nom || 'cette famille'} ne sera repris dans aucune échéance. La créance reste due sur le compte 411 : seule la reprise en gestion est abandonnée.`,
      confirmLabel: 'Écarter',
      danger: true,
    })
    if (!ok) return
    const motif = typeof window !== 'undefined' ? window.prompt('Motif de l\'abandon du report (obligatoire)') : null
    if (!motif || !motif.trim()) { toast.error('Report conservé : aucun motif saisi.'); return }
    const res = await annulerReport(createClient(), report.id, motif)
    if (!res.ok) { toast.error(res.error || 'Report non écarté'); return }
    toast.success('Report écarté')
    await logAction(createClient(), ecole.id, 'report_solde_annule', { report_id: report.id, motif })
    await chargerPropositions()
  }

  async function handleValider() {
    const aValider = reports.filter(r => r.statut === 'propose').map(r => r.id)
    if (aValider.length === 0) { toast.info('Aucun report au statut « proposé ».'); return }
    const ok = await confirm({
      title: `Valider ${aValider.length} report(s) ?`,
      message: 'Les reports validés seront repris dans l\'échéancier de l\'exercice cible et affichés aux familles. Aucune facture n\'est créée.',
      confirmLabel: 'Valider',
    })
    if (!ok) return
    setTravailEnCours(true)
    const res = await validerReports(createClient(), aValider)
    setTravailEnCours(false)
    if (!res.ok) { toast.error(res.error || 'Validation refusée'); return }
    toast.success(`${res.valides} report(s) validé(s)`)
    await logAction(createClient(), ecole.id, 'reports_solde_valides', {
      exercice_origine_id: origineId, exercice_cible_id: cibleId, nombre: res.valides,
    })
    await chargerPropositions()
    // Un report validé qui ne descend pas dans l'échéancier ne sert à rien : la
    // famille ne voit rien à payer. On enchaîne donc l'application, sans en
    // faire un échec bloquant si elle n'aboutit pas partout.
    await handleAppliquer({ silencieuxSiRien: true })
  }

  /**
   * Matérialise les reports validés en échéances dédiées sur l'exercice cible.
   *
   * Appelée automatiquement après la validation, ET disponible en permanence :
   * les contrats de l'année suivante sont très souvent signés APRÈS la clôture.
   * Les familles sans contrat au moment de l'opération ressortent en
   * `sans_contrat` — ce n'est pas un échec, c'est une action à relancer plus
   * tard. La fonction SQL est idempotente : rejouer ne crée aucun doublon.
   */
  async function handleAppliquer(opts?: { silencieuxSiRien?: boolean }) {
    if (!cible) { toast.error('Choisissez l\'exercice cible.'); return }
    setApplicationEnCours(true)
    const res = await appliquerReportsExercice(createClient(), ecole.id, cible.id)
    setApplicationEnCours(false)
    if (!res.ok || !res.resultat) {
      toast.error('Application des reports : ' + (res.error || 'compte rendu illisible'))
      return
    }
    const r = res.resultat
    setApplication(r)
    if (r.appliques === 0 && r.sans_contrat === 0 && r.ignores === 0) {
      if (!opts?.silencieuxSiRien) toast.info('Aucun report validé à appliquer sur cet exercice cible.')
    } else if (r.appliques === 0 && r.sans_contrat > 0) {
      toast.info(`${r.sans_contrat} famille(s) sans contrat sur ${cible.code} : leurs reports restent à appliquer.`)
    } else {
      toast.success(`${r.appliques} report(s) appliqué(s) · ${r.echeances_creees} échéance(s) créée(s)`)
    }
    await logAction(createClient(), ecole.id, 'reports_solde_appliques', {
      exercice_cible_id: cible.id, code_cible: cible.code,
      appliques: r.appliques, echeances_creees: r.echeances_creees,
      sans_contrat: r.sans_contrat, ignores: r.ignores,
    })
  }

  // ────────────────────────────────────────────────────────────────────────
  // Étape 6 — clôture / réouverture
  // ────────────────────────────────────────────────────────────────────────
  async function handleCloturer(force = false) {
    if (!origine) return
    if (!force) {
      const ok = await confirm({
        title: `Clôturer l'exercice ${origine.code} ?`,
        message: 'Le verrou est réel : toute écriture sur les factures, lignes de facture, règlements, échéances et avoirs de cet exercice sera refusée par la base. L\'exercice reste réouvrable depuis cet écran, avec saisie d\'un motif.',
        confirmLabel: 'Clôturer',
        danger: true,
      })
      if (!ok) return
    }
    setTravailEnCours(true)
    const res = await cloturerExercice(createClient(), origine.id, { force })
    setTravailEnCours(false)
    if (!res.ok) {
      if (res.reportsEnAttente && res.reportsEnAttente > 0) {
        const forcer = await confirm({
          title: 'Reports non arbitrés',
          message: res.error + '\n\nClôturer quand même ?',
          confirmLabel: 'Clôturer malgré tout',
          danger: true,
        })
        if (forcer) await handleCloturer(true)
        return
      }
      toast.error(res.error || 'Clôture refusée')
      return
    }
    if (res.avertissement) toast.info(res.avertissement)
    toast.success(`Exercice ${origine.code} clôturé`)
    await logAction(createClient(), ecole.id, 'exercice_cloture', {
      exercice_id: origine.id, code: origine.code, force, reports_en_attente: res.reportsEnAttente ?? 0,
    })
    await reloadExercices()
  }

  async function handleRouvrir(ex: Exercice) {
    const motif = typeof window !== 'undefined'
      ? window.prompt(`Motif de la réouverture de l'exercice ${ex.code} (obligatoire, tracé dans les notes)`)
      : null
    if (!motif || !motif.trim()) { toast.error('Réouverture annulée : aucun motif saisi.'); return }
    setTravailEnCours(true)
    const res = await rouvrirExercice(createClient(), ex.id, motif)
    setTravailEnCours(false)
    if (!res.ok) { toast.error(res.error || 'Réouverture refusée'); return }
    toast.success(`Exercice ${ex.code} rouvert`)
    await logAction(createClient(), ecole.id, 'exercice_rouvert', { exercice_id: ex.id, code: ex.code, motif })
    await reloadExercices()
  }

  // ────────────────────────────────────────────────────────────────────────
  // Étape 7 — saisie d'un solde d'ouverture
  // ────────────────────────────────────────────────────────────────────────
  async function handleSaisir() {
    if (!origine || !cible) { toast.error('Choisissez les deux exercices.'); return }
    if (!saisieFamilleId) { toast.error('Choisissez une famille.'); return }
    const montant = Number(saisieMontant.replace(',', '.'))
    if (!Number.isFinite(montant) || montant === 0) { toast.error('Montant invalide (positif = la famille doit, négatif = trop-perçu).'); return }
    setTravailEnCours(true)
    const res = await saisirReportSolde(createClient(), {
      familleId: saisieFamilleId,
      exerciceOrigineId: origine.id,
      exerciceCibleId: cible.id,
      montant,
      mode: saisieMode,
      note: saisieNote || null,
      source: 'saisi',
    })
    setTravailEnCours(false)
    if (!res.ok) { toast.error(res.error || 'Saisie refusée'); return }
    toast.success('Solde d\'ouverture enregistré')
    await logAction(createClient(), ecole.id, 'report_solde_saisi', {
      report_id: res.id, famille_id: saisieFamilleId, montant, mode: saisieMode,
      exercice_origine_id: origine.id, exercice_cible_id: cible.id,
    })
    setSaisieMontant(''); setSaisieNote(''); setSaisieFamilleId('')
    await chargerPropositions()
  }

  // ────────────────────────────────────────────────────────────────────────
  const totalDebiteur = soldes.reduce((s, l) => s + Math.max(0, Number(l.solde) || 0), 0)
  const totalCrediteur = soldes.reduce((s, l) => s + Math.min(0, Number(l.solde) || 0), 0)
  const proposes = reports.filter(r => r.statut === 'propose')
  const valides = reports.filter(r => r.statut === 'valide')
  const famillesFiltrees = useMemo(() => {
    const f = saisieFiltre.trim().toLowerCase()
    const base = f
      ? familles.filter(x => (x.nom || '').toLowerCase().includes(f) || (x.numero || '').toLowerCase().includes(f))
      : familles
    return base.slice(0, 300)
  }, [familles, saisieFiltre])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <button onClick={() => router.push(`/${ecole.slug}/parametres/exercices`)} style={{
          background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', marginBottom: 6,
        }}>← Exercices</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Clôture d'exercice et report de solde</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4, maxWidth: 900, lineHeight: 1.55 }}>
          Le solde impayé d'une famille vit sur son compte client 411, compte de bilan repris tel quel à
          l'ouverture de l'exercice suivant. Il n'y a donc rien à reporter comptablement : aucune facture
          n'est créée ici. Ce que vous préparez est une reprise du reliquat dans l'échéancier de l'année
          suivante, doublée d'une ligne d'information sur le relevé et le portail des familles.
        </p>
      </div>

      {/* ── Étape 1 : exercices ─────────────────────────────────────────── */}
      <Section numero={1} titre="Exercices concernés">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <Champ label="Exercice à clôturer">
            <select style={inp} value={origineId} onChange={e => setOrigineId(e.target.value)}>
              <option value="">— Choisir —</option>
              {exercices.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.code} — {statutLabel(ex.statut)}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Exercice cible (celui qui reprend les reliquats)">
            <select style={inp} value={cibleId} onChange={e => setCibleId(e.target.value)}>
              <option value="">— Choisir —</option>
              {exercices.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.code} — {statutLabel(ex.statut)}</option>
              ))}
            </select>
          </Champ>
          <Champ label="Mode de reprise par défaut (école)">
            <div style={{ ...inp, background: '#F8FAFC', color: '#475569' }}>{labelModeReport(modeEcole)}</div>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5 }}>
              Réglable dans les paramètres de l'école, surchargeable famille par famille à l'étape 4.
            </p>
          </Champ>
        </div>
        {origine && cible && origine.id === cible.id && (
          <Encart ton="alerte">L'exercice cible doit être différent de l'exercice à clôturer.</Encart>
        )}
        {origine?.statut === 'cloture' && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Encart ton="info">Cet exercice est clôturé. Les écritures y sont refusées par la base.</Encart>
            <button className="btn-secondary" disabled={travailEnCours} onClick={() => handleRouvrir(origine)}>
              Rouvrir l'exercice
            </button>
          </div>
        )}
      </Section>

      {/* ── Étape 2 : contrôles préalables ──────────────────────────────── */}
      <Section
        numero={2}
        titre="Contrôles préalables"
        action={
          <button className="btn-secondary" onClick={chargerControles} disabled={!origine || chargementControles}>
            {chargementControles ? 'Contrôle…' : 'Lancer les contrôles'}
          </button>
        }
      >
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 12px' }}>
          Informatif : rien n'empêche de clôturer, mais ces points sont ceux qu'un contrôle relèverait.
        </p>
        {!controles ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Contrôles non lancés.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <Compteur label="Factures en brouillon" valeur={controles.facturesBrouillon} />
              <Compteur label="Factures non verrouillées" valeur={controles.facturesNonVerrouillees} />
              <Compteur label="Règlements non pointés" valeur={controles.reglementsNonPointes} />
              <Compteur label="Familles sans compte auxiliaire" valeur={controles.famillesSansCompteAuxiliaire} />
            </div>
            {controles.anomalie && (
              <Encart ton="alerte">
                Un contrôle n'a pas pu aboutir : {controles.anomalie}. Les compteurs ci-dessus sont incomplets.
              </Encart>
            )}
          </>
        )}
      </Section>

      {/* ── Étape 3 : soldes ────────────────────────────────────────────── */}
      <Section
        numero={3}
        titre="Soldes de l'exercice à clôturer"
        action={
          <button className="btn-secondary" onClick={chargerSoldes} disabled={!origineId || chargementSoldes}>
            {chargementSoldes ? 'Calcul…' : 'Calculer les soldes'}
          </button>
        }
      >
        {soldesTronques && (
          <Encart ton="alerte">Lecture tronquée par le garde-fou de pagination : le tableau est incomplet.</Encart>
        )}
        {soldes.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>
            Aucun solde calculé. Si l'année précédente n'a pas été facturée dans TalmidApp, c'est normal :
            utilisez l'étape 7 pour saisir les soldes d'ouverture.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
              <Compteur label="Familles" valeur={soldes.length} />
              <Compteur label="Total débiteur" texte={EUR(totalDebiteur)} couleur="#991B1B" />
              <Compteur label="Total créditeur (trop-perçus)" texte={EUR(totalCrediteur)} couleur="#065F46" />
              <Compteur label="Solde net" texte={EUR(totalDebiteur + totalCrediteur)} />
            </div>
            <Tableau entetes={['Famille', 'Compte auxiliaire', 'Factures', 'Facturé', 'Réglé', 'Solde']} alignDroite={[3, 4, 5]}>
              {soldes.map(l => (
                <tr key={l.famille_id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={td}>{l.famille_nom || '—'}{l.famille_numero ? <span style={{ color: '#94A3B8' }}> · {l.famille_numero}</span> : null}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#4338CA' }}>{l.compte_auxiliaire || '—'}</td>
                  <td style={td}>{l.nb_factures}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{EUR(Number(l.total_facture))}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#065F46' }}>{EUR(Number(l.total_regle))}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: Number(l.solde) > 0 ? '#991B1B' : Number(l.solde) < 0 ? '#065F46' : '#64748B' }}>
                    {EUR(Number(l.solde))}
                  </td>
                </tr>
              ))}
            </Tableau>
          </>
        )}
      </Section>

      {/* ── Étape 4 : propositions ──────────────────────────────────────── */}
      <Section
        numero={4}
        titre="Propositions de report"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={lbl}>Seuil (€)</label>
              <input style={{ ...inp, width: 90 }} value={seuil} onChange={e => setSeuil(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={handleProposer} disabled={!origine || !cible || travailEnCours}>
              Proposer les reports
            </button>
          </div>
        }
      >
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 12px' }}>
          Les soldes inférieurs au seuil sont ignorés. L'opération est idempotente : la relancer ne crée pas de doublon.
          Chaque famille peut recevoir un mode différent de celui de l'école.
        </p>
        {chargementReports ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Chargement…</div>
        ) : reports.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Aucun report pour ce couple d'exercices.</div>
        ) : (
          <Tableau entetes={['Famille', 'Montant', 'Nature', 'Mode de reprise', 'Statut', 'Source', '']} alignDroite={[1]}>
            {reports.map(r => {
              const montant = Number(r.montant) || 0
              const modifiable = r.statut === 'propose'
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={td}>
                    {r.familles?.nom || '—'}
                    {r.familles?.numero ? <span style={{ color: '#94A3B8' }}> · {r.familles.numero}</span> : null}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: montant > 0 ? '#991B1B' : '#065F46' }}>
                    {EUR(montant)}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: '#475569' }}>
                    {montant < 0 ? 'Trop-perçu' : 'Reliquat dû'}
                  </td>
                  <td style={td}>
                    <select
                      style={{ ...inp, padding: '6px 9px', fontSize: 12, minWidth: 210 }}
                      value={String(r.mode)}
                      disabled={!modifiable}
                      onChange={e => handleChangerMode(r, e.target.value as ModeReport)}
                    >
                      {MODES_REPORT.map(m => <option key={m} value={m}>{labelModeReport(m)}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                      background: r.statut === 'valide' ? '#ECFDF5' : '#FEF3C7',
                      color: r.statut === 'valide' ? '#065F46' : '#92400E',
                    }}>{r.statut === 'valide' ? 'Validé' : 'Proposé'}</span>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: '#64748B' }}>{String(r.source)}</td>
                  <td style={td}>
                    <button onClick={() => handleEcarter(r)} style={{
                      background: 'transparent', border: 'none', color: '#94A3B8',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>Écarter</button>
                  </td>
                </tr>
              )
            })}
          </Tableau>
        )}
        {reports.length > 0 && (
          <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 10 }}>
            {labelModeReport(modeEcole)} — {aideModeReport(modeEcole)}
          </p>
        )}
      </Section>

      {/* ── Étape 5 : validation ────────────────────────────────────────── */}
      <Section
        numero={5}
        titre="Validation des reports"
        action={
          <button className="btn-primary" onClick={handleValider} disabled={proposes.length === 0 || travailEnCours}>
            Valider les {proposes.length} report(s) proposé(s)
          </button>
        }
      >
        <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.55 }}>
          {proposes.length} proposition(s) en attente d'arbitrage · {valides.length} report(s) déjà validé(s).
          Une fois validé, le report est repris dans l'échéancier généré pour l'exercice cible et affiché à la
          famille sur son portail. Aucune facture n'est émise.
        </p>

        {/* Application à l'échéancier — bouton PERMANENT, volontairement séparé
            de la validation : les contrats de l'année suivante sont souvent
            signés après la clôture, il faut pouvoir rejouer l'opération. */}
        <div style={{ marginTop: 16, borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              onClick={() => handleAppliquer()}
              disabled={!cible || applicationEnCours || travailEnCours}
            >
              {applicationEnCours ? 'Application…' : 'Appliquer les reports à l\'échéancier'}
            </button>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0, flex: 1, minWidth: 260, lineHeight: 1.5 }}>
              À relancer chaque fois qu'un contrat {cible?.code ?? 'de l\'exercice cible'} est signé après la
              clôture : les familles qui n'avaient pas encore de contrat n'ont pas d'échéancier où poser leur
              report. L'opération est rejouable sans risque, elle ne crée jamais de doublon.
            </p>
          </div>

          {application && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
                <Compteur label="Reports appliqués" valeur={application.appliques} />
                <Compteur label="Échéances créées" valeur={application.echeances_creees} />
                <Compteur
                  label="Familles sans contrat"
                  valeur={application.sans_contrat}
                  couleur={application.sans_contrat > 0 ? '#B45309' : undefined}
                />
                <Compteur label="Reports ignorés" valeur={application.ignores} />
              </div>
              {application.sans_contrat > 0 && (
                <Encart ton="alerte">
                  {application.sans_contrat} famille(s) n'ont pas encore de contrat (ou pas d'échéancier) sur
                  {' '}{cible?.code ?? 'l\'exercice cible'} : leur report est validé mais n'est repris dans aucune
                  échéance. Ce n'est pas un échec — revenez sur ce bouton une fois leurs contrats signés.
                </Encart>
              )}
              {application.ignores > 0 && (
                <Encart ton="info">
                  {application.ignores} report(s) non repris pour une autre raison : mode « aucune reprise dans
                  l'échéancier », ou report non validé.
                </Encart>
              )}
            </>
          )}
        </div>
      </Section>

      {/* ── Étape 6 : clôture ───────────────────────────────────────────── */}
      <Section
        numero={6}
        titre="Clôture de l'exercice"
        action={
          origine?.statut === 'cloture' ? (
            <button className="btn-secondary" disabled={travailEnCours} onClick={() => origine && handleRouvrir(origine)}>
              Rouvrir l'exercice
            </button>
          ) : (
            <button className="btn-danger" onClick={() => handleCloturer(false)} disabled={!origine || travailEnCours}>
              Clôturer {origine?.code ?? ''}
            </button>
          )
        }
      >
        <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.55 }}>
          La clôture pose un verrou réel : la base refuse ensuite toute écriture sur les factures, lignes de
          facture, règlements, échéances et avoirs de cet exercice. Ce verrou n'est pas définitif — l'exercice
          peut être rouvert depuis cet écran, la réouverture exigeant un motif qui est tracé dans ses notes.
          La clôture est refusée tant que des reports restent au statut « proposé » ; vous pouvez passer outre
          en connaissance de cause.
        </p>
      </Section>

      {/* ── Étape 7 : saisie d'un solde d'ouverture ─────────────────────── */}
      <Section numero={7} titre="Saisir un solde d'ouverture">
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 14px', lineHeight: 1.55 }}>
          À utiliser quand l'année précédente n'a pas été facturée dans TalmidApp (facturation faite ailleurs,
          ou reprise depuis un autre logiciel) : le calcul automatique ne trouve alors rien à reporter.
          Montant positif = la famille doit ; montant négatif = trop-perçu à déduire. Le report est créé
          directement au statut « validé ». Là encore, aucune facture n'est émise.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Champ label="Rechercher une famille">
            <input style={inp} value={saisieFiltre} onChange={e => setSaisieFiltre(e.target.value)} placeholder="Nom ou numéro" />
          </Champ>
          <Champ label="Famille">
            <select style={inp} value={saisieFamilleId} onChange={e => setSaisieFamilleId(e.target.value)}>
              <option value="">— Choisir —</option>
              {famillesFiltrees.map(f => (
                <option key={f.id} value={f.id}>{f.nom || 'Sans nom'}{f.numero ? ` · ${f.numero}` : ''}</option>
              ))}
            </select>
            {familles.length > famillesFiltrees.length && (
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5 }}>
                {famillesFiltrees.length} familles affichées sur {familles.length} — affinez la recherche.
              </p>
            )}
          </Champ>
          <Champ label="Montant (€)">
            <input style={inp} value={saisieMontant} onChange={e => setSaisieMontant(e.target.value)} placeholder="1250.00" />
          </Champ>
          <Champ label="Mode de reprise">
            <select style={inp} value={saisieMode} onChange={e => setSaisieMode(e.target.value as ModeReport)}>
              {MODES_REPORT.map(m => <option key={m} value={m}>{labelModeReport(m)}</option>)}
            </select>
          </Champ>
          <Champ label="Note (facultative)">
            <input style={inp} value={saisieNote} onChange={e => setSaisieNote(e.target.value)} placeholder="Reprise du logiciel précédent" />
          </Champ>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={handleSaisir} disabled={travailEnCours}>
            Enregistrer le solde d'ouverture
          </button>
        </div>
      </Section>
    </div>
  )
}

// ── Présentation ───────────────────────────────────────────────────────────

function Section({ numero, titre, action, children }: {
  numero: number; titre: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 13, background: '#EEF2FF', color: '#4338CA',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, flexShrink: 0,
          }}>{numero}</span>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: 0 }}>{titre}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
}

function Compteur({ label, valeur, texte, couleur }: {
  label: string; valeur?: number; texte?: string; couleur?: string
}) {
  const nul = typeof valeur === 'number' && valeur === 0
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: couleur ?? (nul ? '#065F46' : '#1E293B') }}>
        {texte ?? valeur ?? 0}
      </div>
    </div>
  )
}

function Encart({ ton, children }: { ton: 'info' | 'alerte'; children: React.ReactNode }) {
  const c = ton === 'alerte'
    ? { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E' }
    : { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1E40AF' }
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.fg,
      borderRadius: 9, padding: '10px 14px', fontSize: 12.5, marginTop: 12, lineHeight: 1.5,
    }}>{children}</div>
  )
}

function Tableau({ entetes, alignDroite, children }: {
  entetes: string[]; alignDroite?: number[]; children: React.ReactNode
}) {
  const droite = new Set(alignDroite ?? [])
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: '#F8FAFC' }}>
          <tr>
            {entetes.map((h, i) => (
              <th key={h + i} style={{
                textAlign: droite.has(i) ? 'right' : 'left', padding: '9px 12px',
                fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#fff', border: '1px solid #E2E8F0',
  borderRadius: 8, color: '#1E293B', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 5,
}
const td: React.CSSProperties = { padding: '10px 12px', color: '#1E293B' }
