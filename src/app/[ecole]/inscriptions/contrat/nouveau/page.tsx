'use client'
/**
 * Saisie ADMIN d'un contrat de scolarisation PAPIER.
 *
 * Reproduit la logique tarifaire du formulaire parent
 * (src/app/portail/inscriptions/contrat/page.tsx) mais côté admin :
 *  - sélection d'une famille de l'école,
 *  - enfants / classes / postes (obligatoires + options, groupe_exclusif),
 *  - assurance, mode de règlement, échéancier,
 *  - impression d'un contrat A4 semi-vierge (champs vides en pointillés),
 *  - validation immédiate via creerContratPapier (contrat 'valide' + facture
 *    + échéancier + scolarités N+1).
 */
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { getExerciceInscription } from '@/lib/annee-inscription'
import { labelModePaiement } from '@/lib/statuts'
import { useToast } from '@/components/ui/Toast'
import { creerContratPapier, genererLignesEcheancier } from '@/lib/contrat-papier'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
    {children}
  </div>
)

// Rendu "papier" : valeur ou ligne pointillée à compléter à la main
const dotted = (v: any, dots = '……………………………………') => {
  const s = (v ?? '').toString().trim()
  return s || dots
}

export default function ContratPapierAdminPage() {
  const router = useRouter()
  const ecole = useEcole()
  const toast = useToast()

  const [annee, setAnnee] = useState('')
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Sélection famille
  const [familles, setFamilles] = useState<any[]>([])
  const [rechercheFamille, setRechercheFamille] = useState('')
  const [familleId, setFamilleId] = useState('')
  const [loadingFamille, setLoadingFamille] = useState(false)

  // Données famille chargées
  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [modes, setModes] = useState<any[]>([])
  const [paiementConfig, setPaiementConfig] = useState<any>(null)
  const [datesEncaissement, setDatesEncaissement] = useState<any[]>([])
  const [reductions, setReductions] = useState<any[]>([])
  const [reductionAccordee, setReductionAccordee] = useState<any>(null)
  const [contratExistant, setContratExistant] = useState<any>(null)
  const [ecoleInfo, setEcoleInfo] = useState<any>(null)

  // Saisie contrat
  const [enfantsContrat, setEnfantsContrat] = useState<any[]>([])
  const [assuranceEcole, setAssuranceEcole] = useState(true)
  const [modeReglement, setModeReglement] = useState('')
  const [nbEcheances, setNbEcheances] = useState(10)
  const [dateEncaissement, setDateEncaissement] = useState<number | null>(null)
  const [observations, setObservations] = useState('')
  const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0])

  // Scan du contrat papier
  const [scanUploaded, setScanUploaded] = useState<{ url: string; nom: string } | null>(null)
  const [uploadingScan, setUploadingScan] = useState(false)
  const scanRef = useRef<HTMLInputElement | null>(null)

  // Aperçu / impression + modale succès
  const [apercu, setApercu] = useState(false)
  const [success, setSuccess] = useState<any>(null)
  const [afficherAvecContrat, setAfficherAvecContrat] = useState(false)

  useEffect(() => { init() }, [ecole?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function init() {
    if (!ecole?.id) return
    const s = createClient()
    const { data: { session: sess } } = await s.auth.getSession()
    setSession(sess)
    const [insc, { data: fams }, { data: ecData }] = await Promise.all([
      getExerciceInscription(s, ecole.id),
      s.from('familles').select('id, nom, numero, parent1_prenom, parent1_nom').eq('ecole_id', ecole.id).order('nom'),
      s.from('ecoles').select('nom, adresse, ville, telephone, email_contact, logo_url, assurance_proposee, assurance_montant_annuel').eq('id', ecole.id).single(),
    ])
    setAnnee(insc.code)
    // Marquer les familles qui ont DEJA un contrat valide pour l'annee d'inscription :
    // par defaut la liste ne montre que les familles SANS contrat (le vrai cas d'usage
    // du papier), avec une case pour afficher aussi les autres (correction/remplacement).
    const { data: contratsValides } = await s
      .from('contrats_scolarisation').select('famille_id')
      .eq('ecole_id', ecole.id).eq('annee_scolaire', insc.code).eq('statut', 'valide')
    const avecContrat = new Set(((contratsValides || []) as any[]).map(c => c.famille_id))
    setFamilles((fams ?? []).map((f: any) => ({ ...f, a_contrat: avecContrat.has(f.id) })))
    setEcoleInfo(ecData)
    if (ecData && ecData.assurance_proposee === false) setAssuranceEcole(false)
    setLoading(false)
  }

  async function chargerFamille(fid: string) {
    setFamilleId(fid)
    setFamille(null); setEnfants([]); setEnfantsContrat([]); setContratExistant(null); setReductionAccordee(null)
    setScanUploaded(null); setSuccess(null)
    if (!fid || !annee) return
    setLoadingFamille(true)
    const s = createClient()
    const [
      { data: fam }, { data: enf }, { data: cls }, { data: tar }, { data: mod },
      { data: payCfg }, { data: datesEnc }, { data: redsf }, { data: redAcc }, { data: cont },
    ] = await Promise.all([
      s.from('familles').select('*').eq('id', fid).single(),
      s.from('enfants').select('*, classes(id, nom, secteur_id, secteurs(id, nom))').eq('famille_id', fid),
      s.from('classes').select('id, nom, secteur_id, secteurs(id, nom)').eq('ecole_id', ecole.id).order('nom'),
      s.from('tarifs_secteur').select('*').eq('ecole_id', ecole.id).eq('annee_scolaire', annee).order('ordre'),
      s.from('modes_reglement_ecole').select('*').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('contrat_paiement_config').select('*').eq('ecole_id', ecole.id).maybeSingle(),
      s.from('dates_encaissement').select('*').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('reductions_famille_nombreuse').select('*').eq('ecole_id', ecole.id).eq('annee_scolaire', annee).order('nb_enfants'),
      s.from('demandes_reduction').select('id, tarif_accorde, statut').eq('famille_id', fid).eq('annee_scolaire', annee).eq('statut', 'accepte').maybeSingle(),
      s.from('contrats_scolarisation').select('id, statut').eq('famille_id', fid).eq('annee_scolaire', annee).maybeSingle(),
    ])
    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? [])
    setTarifs(tar ?? []); setModes(mod ?? [])
    setPaiementConfig(payCfg); setDatesEncaissement(datesEnc ?? [])
    setReductions(redsf ?? []); setReductionAccordee(redAcc); setContratExistant(cont)

    if (mod?.length) setModeReglement(mod[0].type)
    if (datesEnc?.length) setDateEncaissement(datesEnc[0].jour_du_mois)
    const maxE = payCfg?.nb_echeances_max || 12
    setNbEcheances(Math.min(maxE, 10))

    // Pré-cocher tous les enfants avec leur classe actuelle (ou vide) + postes obligatoires
    const trancheLoad = fam?.tranche_id
      || Array.from(new Set((tar ?? []).map((t: any) => t.tranche_id).filter(Boolean)))[0]
      || null
    setEnfantsContrat((enf ?? []).map((e: any) => {
      const cls2 = e.classes
      const secteurId = cls2?.secteur_id || ''
      const tarifsApp = (tar ?? []).filter((t: any) => {
        const matchSecteur = !t.secteur_id || t.secteur_id === secteurId
        const matchTranche = !t.tranche_id || t.tranche_id === trancheLoad
        return matchSecteur && matchTranche
      })
      const postesObl = e.classe_id ? tarifsApp.filter((t: any) => t.obligatoire).map((t: any) => ({ tarif_id: t.id, nom: t.nom_poste, montant: parseFloat(t.montant) || 0 })) : []
      return { enfant_id: e.id, classe_id: e.classe_id || '', classe_nom: cls2?.nom || '', postes: postesObl, sous_total: postesObl.reduce((sum: number, p: any) => sum + p.montant, 0) }
    }))
    setLoadingFamille(false)
  }

  // ── Logique tarifaire (miroir du portail) ──
  const trancheEffective = (() => {
    if (famille?.tranche_id) return famille.tranche_id
    const tranchesUtilisees = Array.from(new Set(tarifs.map((t: any) => t.tranche_id).filter(Boolean)))
    return tranchesUtilisees[0] || null
  })()

  function getTarifsForSecteur(secteurId: string) {
    return tarifs.filter((t: any) => {
      const matchSecteur = !t.secteur_id || t.secteur_id === secteurId
      const matchTranche = !t.tranche_id || t.tranche_id === trancheEffective
      return matchSecteur && matchTranche
    })
  }

  function setEnfantClasse(enfantId: string, classeId: string) {
    const cls = classes.find((c: any) => c.id === classeId)
    setEnfantsContrat(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      const tarifsDispos = getTarifsForSecteur(cls?.secteur_id || '')
      const postesObl = classeId ? tarifsDispos.filter((t: any) => t.obligatoire).map((t: any) => ({ tarif_id: t.id, nom: t.nom_poste, montant: parseFloat(t.montant) || 0 })) : []
      return { ...e, classe_id: classeId, classe_nom: cls?.nom || '', postes: postesObl, sous_total: postesObl.reduce((sum: number, t: any) => sum + t.montant, 0) }
    }))
  }

  function toggleEnfantContrat(enfantId: string) {
    setEnfantsContrat(prev => {
      if (prev.some(e => e.enfant_id === enfantId)) return prev.filter(e => e.enfant_id !== enfantId)
      return [...prev, { enfant_id: enfantId, classe_id: '', classe_nom: '', postes: [], sous_total: 0 }]
    })
  }

  function togglePoste(enfantId: string, tarif: any) {
    setEnfantsContrat(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      const exists = e.postes.find((p: any) => p.tarif_id === tarif.id)
      let newPostes: any[]
      if (exists) {
        newPostes = e.postes.filter((p: any) => p.tarif_id !== tarif.id)
      } else {
        // Respect du groupe_exclusif : cocher l'un décoche les autres du même groupe (comparaison lowercase)
        const groupe = (tarif.groupe_exclusif || '').toLowerCase()
        const idsAEvincer = groupe
          ? tarifs.filter((t: any) => (t.groupe_exclusif || '').toLowerCase() === groupe && t.id !== tarif.id).map((t: any) => t.id)
          : []
        const postesNettoyes = idsAEvincer.length ? e.postes.filter((p: any) => !idsAEvincer.includes(p.tarif_id)) : e.postes
        newPostes = [...postesNettoyes, { tarif_id: tarif.id, nom: tarif.nom_poste, montant: parseFloat(tarif.montant) || 0 }]
      }
      return { ...e, postes: newPostes, sous_total: newPostes.reduce((sum: number, p: any) => sum + (parseFloat(p.montant) || 0), 0) }
    }))
  }

  // ── Totaux (miroir du portail) ──
  const totalScolarite = enfantsContrat.reduce((sum, e) => sum + (e.sous_total || 0), 0)
  const nbEnfants = enfants.length
  const nbEnfantsAvecClasse = enfantsContrat.filter(e => e.classe_id).length

  const getReductionFN = () => {
    if (nbEnfantsAvecClasse < 2) return 0
    const trancheFamille = famille?.tranche_id || null
    const applicable = reductions.filter((r: any) => {
      if (parseInt(r.nb_enfants) > nbEnfants) return false
      if (Array.isArray(r.tranches_eligibles) && r.tranches_eligibles.length > 0) {
        if (!trancheFamille || !r.tranches_eligibles.includes(trancheFamille)) return false
      }
      return true
    })
    if (!applicable.length) return 0
    return parseFloat(applicable[applicable.length - 1].montant_reduction) || 0
  }

  const reductionFN = reductionAccordee ? 0 : getReductionFN()
  const montantAssuranceAnnuel = (ecoleInfo?.assurance_montant_annuel != null ? Number(ecoleInfo.assurance_montant_annuel) : 12) || 12
  const totalAssurance = (ecoleInfo?.assurance_proposee !== false && assuranceEcole) ? montantAssuranceAnnuel * nbEnfantsAvecClasse : 0

  const totalOptionsHorsReduction = enfantsContrat.reduce((sum, e) => {
    return sum + (e.postes || []).reduce((s2: number, p: any) => {
      const tarif = tarifs.find((t: any) => t.id === p.tarif_id)
      const inclus = tarif ? tarif.inclus_dans_reduction !== false : true
      return s2 + (inclus ? 0 : (parseFloat(p.montant) || 0))
    }, 0)
  }, 0)

  const totalAnnuel = reductionAccordee?.tarif_accorde
    ? parseFloat(reductionAccordee.tarif_accorde) + totalOptionsHorsReduction + totalAssurance
    : Math.max(0, totalScolarite - reductionFN) + totalAssurance
  const minEch = paiementConfig?.nb_echeances_min || 1
  const maxEch = paiementConfig?.nb_echeances_max || 12
  const montantEcheance = nbEcheances > 0 ? Math.round((totalAnnuel / nbEcheances) * 100) / 100 : 0

  const lignesEcheancier = genererLignesEcheancier({
    totalAnnuel, nbEcheances, anneeScolaire: annee, jourEcheance: dateEncaissement, modeReglement,
  })

  // ── Upload scan contrat papier ──
  async function uploadScan(file: File) {
    if (!session?.access_token) { toast?.error?.('Session expirée — reconnectez-vous'); return }
    setUploadingScan(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('familleId', familleId); fd.append('demandeId', '')
      fd.append('configId', 'contrat_papier'); fd.append('label', 'Contrat papier signé')
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: fd })
      const json = await res.json()
      if (json.success) {
        setScanUploaded({ url: json.url, nom: json.nom })
        toast?.success?.('Scan du contrat enregistré')
      } else {
        toast?.error?.('Upload échoué : ' + (json.error || 'erreur inconnue'))
      }
    } catch (e: any) {
      toast?.error?.('Upload échoué : ' + (e?.message || 'erreur réseau'))
    }
    setUploadingScan(false)
  }

  // ── Impression ──
  function imprimer() {
    setApercu(true)
    setTimeout(() => { window.print() }, 350)
  }

  // ── Validation ──
  async function valider() {
    if (saving) return
    if (!familleId) { toast?.error?.('Sélectionnez une famille'); return }
    if (enfantsContrat.filter(e => e.classe_id).length === 0) { toast?.error?.('Sélectionnez au moins une classe'); return }
    if (!modeReglement) { toast?.error?.('Choisissez un mode de règlement'); return }
    if (!signatureDate) { toast?.error?.('Renseignez la date de signature du contrat papier'); return }
    const msg = `Valider le contrat papier pour ${famille?.nom || 'cette famille'} ?\n\n`
      + `— Total annuel : ${totalAnnuel.toLocaleString('fr-FR')} €\n`
      + `— ${nbEcheances} échéance(s) — ${labelModePaiement(modeReglement)}\n`
      + `— Le contrat sera VALIDÉ immédiatement (facture + échéancier générés)`
      + (contratExistant ? '\n\n⚠ Un contrat existe déjà pour cette famille : il sera remplacé.' : '')
    if (!window.confirm(msg)) return
    setSaving(true)
    const s = createClient()
    const res = await creerContratPapier(s, {
      familleId,
      ecoleId: ecole.id,
      anneeScolaire: annee,
      enfantsContrat: enfantsContrat.filter(e => e.classe_id),
      assuranceEcole: ecoleInfo?.assurance_proposee !== false && assuranceEcole,
      assuranceMontantTotal: totalAssurance,
      modeReglement,
      nbEcheances,
      jourEcheance: dateEncaissement,
      montantTotal: totalAnnuel,
      observations: observations || null,
      demandeReductionId: reductionAccordee?.id || null,
      signatureDate,
      contratPapierUrl: scanUploaded?.url || null,
    })
    setSaving(false)
    if (!res.ok) {
      toast?.error?.(res.error || 'Erreur lors de la validation')
      return
    }
    setSuccess(res)
  }

  function nouveauContrat() {
    setSuccess(null); setFamilleId(''); setFamille(null); setEnfants([]); setEnfantsContrat([])
    setContratExistant(null); setReductionAccordee(null); setScanUploaded(null); setObservations('')
    setSignatureDate(new Date().toISOString().split('T')[0])
  }

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const famillesFiltrees = familles.filter((f: any) => {
    if (!afficherAvecContrat && f.a_contrat && f.id !== familleId) return false
    const q = rechercheFamille.trim().toLowerCase()
    if (!q) return true
    return `${f.nom || ''} ${f.parent1_prenom || ''} ${f.parent1_nom || ''} ${f.numero || ''}`.toLowerCase().includes(q)
  })
  const nbSansContrat = familles.filter((f: any) => !f.a_contrat).length

  // ─────────────────────────────────────────────────────────────
  // DOCUMENT A4 IMPRIMABLE (contrat semi-vierge)
  // ─────────────────────────────────────────────────────────────
  const DocumentA4 = () => {
    const cell: React.CSSProperties = { padding: '5px 8px', border: '1px solid #CBD5E1', fontSize: 11 }
    const th: React.CSSProperties = { ...cell, background: '#F1F5F9', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em' }
    const p1 = `${famille?.parent1_prenom || ''} ${famille?.parent1_nom || ''}`.trim()
    const p2 = `${famille?.parent2_prenom || ''} ${famille?.parent2_nom || ''}`.trim()
    const adresse = [famille?.parent1_adresse, famille?.parent1_code_postal, famille?.parent1_ville].filter(Boolean).join(' ')
    return (
      <div className="contrat-print-doc" style={{ background: '#fff', maxWidth: 760, margin: '0 auto', padding: '28px 34px', fontFamily: 'Georgia, "Times New Roman", serif', color: '#111', fontSize: 12, lineHeight: 1.45 }}>
        {/* En-tête */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{ecoleInfo?.nom || ecole.nom}</div>
          {(ecoleInfo?.adresse || ecoleInfo?.ville) && <div style={{ fontSize: 10, color: '#333' }}>{[ecoleInfo?.adresse, ecoleInfo?.ville].filter(Boolean).join(' — ')}{ecoleInfo?.telephone ? ` — ${ecoleInfo.telephone}` : ''}</div>}
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', marginTop: 8 }}>CONTRAT DE SCOLARISATION</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>Année scolaire {annee}</div>
        </div>

        {/* Bloc famille */}
        <div style={{ border: '1px solid #CBD5E1', padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', marginBottom: 6 }}>FAMILLE {famille?.nom ? `— ${famille.nom.toUpperCase()}` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 11 }}>
            <div>Responsable 1 : <strong>{dotted(p1)}</strong></div>
            <div>Responsable 2 : <strong>{dotted(p2)}</strong></div>
            <div style={{ gridColumn: '1 / -1' }}>Adresse : <strong>{dotted(adresse, '………………………………………………………………………………')}</strong></div>
            <div>Téléphone : <strong>{dotted(famille?.parent1_telephone)}</strong></div>
            <div>Email : <strong>{dotted(famille?.parent1_email)}</strong></div>
          </div>
        </div>

        {/* Tableau enfants */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <thead>
            <tr><th style={th}>Enfant</th><th style={th}>Classe</th><th style={th}>Prestations</th><th style={{ ...th, textAlign: 'right' }}>Sous-total</th></tr>
          </thead>
          <tbody>
            {enfantsContrat.filter(e => e.classe_id).map(e => {
              const enfant = enfants.find((en: any) => en.id === e.enfant_id)
              return (
                <tr key={e.enfant_id}>
                  <td style={cell}><strong>{dotted(`${enfant?.prenom || ''} ${enfant?.nom || ''}`.trim())}</strong></td>
                  <td style={cell}>{dotted(e.classe_nom)}</td>
                  <td style={cell}>{(e.postes || []).map((p: any) => `${p.nom} (${fmt(p.montant)})`).join(' · ') || '……………………'}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt(e.sous_total || 0)}</td>
                </tr>
              )
            })}
            {reductionAccordee?.tarif_accorde && (
              <tr><td style={{ ...cell, fontStyle: 'italic' }} colSpan={3}>Tarif accordé par la commission (enseignement + demi-pension)</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt(parseFloat(reductionAccordee.tarif_accorde))}</td></tr>
            )}
            {!reductionAccordee && reductionFN > 0 && (
              <tr><td style={{ ...cell, fontStyle: 'italic' }} colSpan={3}>Réduction famille nombreuse</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>− {fmt(reductionFN)}</td></tr>
            )}
            <tr>
              <td style={cell} colSpan={3}>Assurance scolaire {totalAssurance > 0 ? `(${montantAssuranceAnnuel} € × ${nbEnfantsAvecClasse} enfant${nbEnfantsAvecClasse > 1 ? 's' : ''})` : '— fournie par la famille'}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt(totalAssurance)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 800, fontSize: 12, background: '#F1F5F9' }} colSpan={3}>TOTAL ANNUEL</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 800, fontSize: 12, background: '#F1F5F9' }}>{fmt(totalAnnuel)}</td>
            </tr>
          </tbody>
        </table>

        {/* Règlement + échéancier */}
        <div style={{ fontSize: 11, marginBottom: 4 }}>
          Mode de règlement : <strong>{labelModePaiement(modeReglement) || dotted('')}</strong> — <strong>{nbEcheances}</strong> échéance(s){dateEncaissement ? <>, le <strong>{dateEncaissement}</strong> du mois</> : null}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr><th style={th}>N°</th>{lignesEcheancier.map(l => <th key={l.numero_cheque} style={{ ...th, textAlign: 'center' }}>{l.numero_cheque}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Date</td>{lignesEcheancier.map(l => <td key={l.numero_cheque} style={{ ...cell, textAlign: 'center', fontSize: 9 }}>{new Date(l.date_echeance + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>)}</tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Montant</td>{lignesEcheancier.map(l => <td key={l.numero_cheque} style={{ ...cell, textAlign: 'center', fontSize: 9 }}>{l.montant.toLocaleString('fr-FR')} €</td>)}</tr>
          </tbody>
        </table>

        {/* Autorisation image */}
        <div style={{ border: '1px solid #CBD5E1', padding: '8px 14px', marginBottom: 12, fontSize: 11 }}>
          <strong>Autorisation d&apos;image</strong> — J&apos;autorise la prise et l&apos;utilisation d&apos;images de mes enfants dans le cadre de la communication de {ecoleInfo?.nom || 'l\'établissement'} :
          <span style={{ marginLeft: 12, fontSize: 13 }}>☐ Oui&nbsp;&nbsp;&nbsp;☐ Non</span>
        </div>

        {/* Engagement (texte du portail) */}
        <div style={{ fontSize: 11, textAlign: 'justify', marginBottom: 16 }}>
          Nous soussigné(e)s, <strong>{dotted(p1)}</strong>{p2 ? <> et <strong>{p2}</strong></> : null}, reconnaissons avoir pris connaissance
          des tarifs pour l&apos;année scolaire {annee} et approuvons le règlement de l&apos;établissement.
          Nous nous engageons à régler la somme de <strong>{fmt(totalAnnuel)}</strong> selon les modalités choisies ci-dessus.
          {observations ? <><br /><em>Observations : {observations}</em></> : null}
        </div>

        {/* Fait à / signatures */}
        <div style={{ fontSize: 11, marginBottom: 10 }}>Fait à ……………………………………, le …… / …… / …………</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ border: '1px solid #111', height: 90, padding: '6px 10px', fontSize: 10 }}>Signature Parent 1<br /><span style={{ fontSize: 9, color: '#555' }}>(précédée de la mention « lu et approuvé »)</span></div>
          <div style={{ border: '1px solid #111', height: 90, padding: '6px 10px', fontSize: 10 }}>Signature Parent 2<br /><span style={{ fontSize: 9, color: '#555' }}>(précédée de la mention « lu et approuvé »)</span></div>
        </div>
      </div>
    )
  }

  // ── Mode aperçu / impression : on ne rend QUE le document (le CSS print masque le layout admin) ──
  if (apercu) {
    return (
      <>
        <style>{`
          @page { size: A4; margin: 12mm 14mm }
          @media print {
            body * { visibility: hidden !important }
            .contrat-print-doc, .contrat-print-doc * { visibility: visible !important }
            .contrat-print-doc { position: absolute !important; left: 0; top: 0; width: 100%; margin: 0 !important; padding: 0 !important }
          }
        `}</style>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }} className="contrat-print-toolbar">
          <button onClick={() => window.print()} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🖨 Imprimer</button>
          <button onClick={() => setApercu(false)} style={{ background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>← Retour au formulaire</button>
        </div>
        <DocumentA4 />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, sans-serif', maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={() => router.push(`/${ecole.slug}/inscriptions`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13 }}>← Retour</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0, flex: 1 }}>📄 Contrat papier — saisie admin ({annee})</h1>
      </div>

      {/* ── 1. Sélection famille ── */}
      <Section title="1. Famille">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Rechercher</label>
            <input style={inp} value={rechercheFamille} onChange={e => setRechercheFamille(e.target.value)} placeholder="Nom, prénom, n° famille..." />
          </div>
          <div>
            <label style={lbl}>Famille * <span style={{ textTransform: 'none', fontWeight: 400, color: '#94A3B8' }}>({nbSansContrat} sans contrat {annee})</span></label>
            <select style={inp} value={familleId} onChange={e => chargerFamille(e.target.value)}>
              <option value="">— Choisir une famille —</option>
              {famillesFiltrees.map((f: any) => (
                <option key={f.id} value={f.id}>{f.nom}{f.parent1_prenom ? ` (${f.parent1_prenom} ${f.parent1_nom || ''})` : ''}{f.numero ? ` — n°${f.numero}` : ''}{f.a_contrat ? ' — ⚠ contrat déjà validé' : ''}</option>
              ))}
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
          <input type="checkbox" checked={afficherAvecContrat} onChange={e => setAfficherAvecContrat(e.target.checked)} />
          Afficher aussi les familles qui ont déjà un contrat validé (correction / remplacement)
        </label>
        {loadingFamille && <div style={{ fontSize: 13, color: '#64748B' }}>Chargement de la famille...</div>}
        {contratExistant?.statut === 'valide' && (
          <div style={{ background: '#FFFBEB', border: '2px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
            ⚠ <strong>Contrat déjà validé</strong> — la saisie remplacera l&apos;existant (contrat, échéancier ; la facture existante sera conservée si elle est active).
          </div>
        )}
        {contratExistant && contratExistant.statut !== 'valide' && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E40AF' }}>
            ℹ Un contrat « {contratExistant.statut} » existe pour cette famille : il sera mis à jour et validé.
          </div>
        )}
        {reductionAccordee && (
          <div style={{ background: '#ECFDF5', border: '1px solid #10B981', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#065F46' }}>
            ✓ Réduction commission acceptée — tarif accordé : <strong>{Number(reductionAccordee.tarif_accorde).toLocaleString('fr-FR')} €</strong> (enseignement + demi-pension ; options en sus)
          </div>
        )}
      </Section>

      {familleId && famille && !loadingFamille && (
        <>
          {/* ── 2. Enfants ── */}
          <Section title="2. Enfants du contrat *">
            {enfants.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8' }}>Aucun enfant dans cette famille.</div>}
            {enfants.map((enfant: any) => {
              const enf = enfantsContrat.find(e => e.enfant_id === enfant.id) || { classe_id: '', postes: [], sous_total: 0 }
              const isSelected = enfantsContrat.some(e => e.enfant_id === enfant.id)
              const cls = classes.find((c: any) => c.id === enf.classe_id)
              const tarifsDispos = getTarifsForSecteur(cls?.secteur_id || '')
              return (
                <div key={enfant.id} style={{ border: `2px solid ${isSelected ? '#2563EB' : '#E2E8F0'}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: isSelected ? '#EFF6FF' : '#F8FAFC', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleEnfantContrat(enfant.id)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2563EB', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                      {enfant.classes?.nom && <div style={{ fontSize: 11, color: '#94A3B8' }}>Classe actuelle : {enfant.classes.nom}</div>}
                    </div>
                    {enf.sous_total > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{enf.sous_total.toLocaleString('fr-FR')} €</div>}
                  </div>
                  {isSelected && (
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={lbl}>Classe {annee} *</label>
                        <select style={inp} value={enf.classe_id || ''} onChange={e => setEnfantClasse(enfant.id, e.target.value)}>
                          <option value="">Choisir une classe</option>
                          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.nom}{c.secteurs?.nom ? ` — ${c.secteurs.nom}` : ''}</option>)}
                        </select>
                      </div>
                      {enf.classe_id && tarifsDispos.length > 0 && (
                        <div>
                          <label style={lbl}>Prestations</label>
                          {tarifsDispos.map((t: any) => {
                            const sel = enf.postes?.find((p: any) => p.tarif_id === t.id)
                            return (
                              <label key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: t.obligatoire ? 'default' : 'pointer', background: sel ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${sel ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input type="checkbox" checked={!!sel || t.obligatoire} disabled={t.obligatoire} onChange={() => !t.obligatoire && togglePoste(enfant.id, t)} />
                                  <span style={{ fontSize: 13 }}>
                                    {t.nom_poste}
                                    {t.obligatoire && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6 }}>(inclus)</span>}
                                    {t.groupe_exclusif && <span style={{ fontSize: 10, color: '#7C3AED', marginLeft: 6 }}>↔ {t.groupe_exclusif}</span>}
                                  </span>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0 }}>{(parseFloat(t.montant) || 0).toLocaleString('fr-FR')} €</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </Section>

          {/* ── 3. Assurance ── */}
          {ecoleInfo?.assurance_proposee !== false && (
            <Section title="3. Assurance scolaire">
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
                <input type="checkbox" checked={assuranceEcole} onChange={e => setAssuranceEcole(e.target.checked)} style={{ accentColor: '#2563EB' }} />
                <div>Assurance proposée par l&apos;établissement
                  <span style={{ fontWeight: 700, color: '#059669', marginLeft: 8 }}>{montantAssuranceAnnuel} € × {nbEnfantsAvecClasse} = {totalAssurance} €</span>
                </div>
              </label>
              {!assuranceEcole && <div style={{ fontSize: 12, color: '#64748B' }}>La famille fournit sa propre attestation d&apos;assurance pour {annee}.</div>}
            </Section>
          )}

          {/* ── 4. Règlement ── */}
          <Section title="4. Règlement *">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label style={lbl}>Mode de règlement *</label>
                <select style={inp} value={modeReglement} onChange={e => setModeReglement(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {modes.map((m: any) => <option key={m.id} value={m.type}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Nb échéances ({minEch}–{maxEch}) *</label>
                <select style={inp} value={nbEcheances} onChange={e => setNbEcheances(parseInt(e.target.value))}>
                  {Array.from({ length: maxEch - minEch + 1 }, (_, i) => minEch + i).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {datesEncaissement.length > 0 && (
                <div>
                  <label style={lbl}>Jour d&apos;encaissement</label>
                  <select style={inp} value={dateEncaissement ?? ''} onChange={e => setDateEncaissement(e.target.value ? parseInt(e.target.value) : null)}>
                    {datesEncaissement.map((d: any) => <option key={d.id} value={d.jour_du_mois}>{d.label || `${d.jour_du_mois} du mois`}</option>)}
                  </select>
                </div>
              )}
            </div>
            {nbEcheances > 1 && totalAnnuel > 0 && (
              <div style={{ fontSize: 12, color: '#64748B' }}>Soit <strong>{montantEcheance.toLocaleString('fr-FR')} €</strong> × {nbEcheances} {modeReglement === 'cheque' ? 'chèques' : 'échéances'} (dernière ajustée)</div>
            )}
            {lignesEcheancier.length > 0 && totalAnnuel > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px', background: '#F8FAFC', fontSize: 10, color: '#64748B', textTransform: 'uppercase' }}>N°</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', background: '#F8FAFC', fontSize: 10, color: '#64748B', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', background: '#F8FAFC', fontSize: 10, color: '#64748B', textTransform: 'uppercase' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesEcheancier.map(l => (
                      <tr key={l.numero_cheque} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '5px 10px' }}>{l.numero_cheque}</td>
                        <td style={{ padding: '5px 10px' }}>{new Date(l.date_echeance + 'T00:00:00').toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(l.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── 5. Récapitulatif ── */}
          <div style={{ background: '#1E293B', borderRadius: 14, padding: 24, color: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 16, letterSpacing: '0.06em' }}>RÉCAPITULATIF</div>
            {enfantsContrat.filter(e => e.sous_total > 0).map(e => {
              const enfant = enfants.find((en: any) => en.id === e.enfant_id)
              return <div key={e.enfant_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
                <span>{enfant?.prenom} — {e.classe_nom}</span><span>{e.sous_total.toLocaleString('fr-FR')} €</span>
              </div>
            })}
            {reductionFN > 0 && !reductionAccordee && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#34D399' }}><span>Réduction famille nombreuse</span><span>- {reductionFN.toLocaleString('fr-FR')} €</span></div>}
            {reductionAccordee && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#34D399' }}><span>Tarif accordé (enseignement + demi-pension)</span><span>{parseFloat(reductionAccordee.tarif_accorde).toLocaleString('fr-FR')} €</span></div>}
            {reductionAccordee && totalOptionsHorsReduction > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#94A3B8' }}><span>Options (transport, etc.)</span><span>+ {totalOptionsHorsReduction.toLocaleString('fr-FR')} €</span></div>}
            {totalAssurance > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}><span>Assurance scolaire</span><span>{totalAssurance} €</span></div>}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
              <span>Total annuel</span><span style={{ color: '#60A5FA' }}>{totalAnnuel.toLocaleString('fr-FR')} €</span>
            </div>
          </div>

          {/* ── 6. Contrat papier ── */}
          <Section title="6. Contrat papier signé">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label style={lbl}>Date de signature du papier *</label>
                <input style={inp} type="date" value={signatureDate} onChange={e => setSignatureDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Scan du contrat (PDF / JPG / PNG)</label>
                <input ref={scanRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadScan(f) }} />
                {scanUploaded ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>✓ {scanUploaded.nom}</span>
                    <button onClick={() => scanRef.current?.click()} style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>Remplacer</button>
                  </div>
                ) : (
                  <button onClick={() => scanRef.current?.click()} disabled={uploadingScan}
                    style={{ fontSize: 12, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', opacity: uploadingScan ? 0.6 : 1 }}>
                    {uploadingScan ? 'Upload...' : '📎 Joindre le scan'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <label style={lbl}>Observations</label>
              <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={observations} onChange={e => setObservations(e.target.value)} placeholder="Remarques éventuelles..." />
            </div>
          </Section>

          {/* ── 7. Actions ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={imprimer} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
              🖨 Imprimer le contrat pré-rempli
            </button>
            <button onClick={valider} disabled={saving} style={{ background: '#10B981', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Validation...' : '✓ Valider le contrat'}
            </button>
          </div>
        </>
      )}

      {/* ── Modale succès ── */}
      {success && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%' }}>
            <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', margin: '0 0 16px', color: '#1E293B' }}>Contrat papier validé</h2>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Famille</span><span style={{ fontWeight: 600 }}>{famille?.nom || '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Total annuel</span><span style={{ fontWeight: 700 }}>{totalAnnuel.toLocaleString('fr-FR')} €</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Échéances</span><span style={{ fontWeight: 600 }}>{nbEcheances} × {labelModePaiement(modeReglement)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Facture</span>
                <span style={{ fontWeight: 600 }}>{success.factureNumero || '—'}{success.factureDejaExistante ? ' (déjà existante)' : ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => router.push(success.factureId ? `/${ecole.slug}/factures/${success.factureId}` : `/${ecole.slug}/inscriptions`)}
                style={{ flex: 1, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {success.factureId ? 'Voir la facture' : 'Retour inscriptions'}
              </button>
              <button onClick={nouveauContrat}
                style={{ flex: 1, background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Nouveau contrat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
