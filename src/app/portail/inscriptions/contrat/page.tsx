'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatStatut } from '@/lib/inscriptions'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { labelModePaiement } from '@/lib/statuts'

// IMPORTANT : Section au niveau module (sinon re-mount + scroll-jump à chaque keystroke).
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
    {children}
  </div>
)

export default function ContratPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const parent = useParentCtx()
  const ks = () => {} // no-op (ancien hack scroll cassait la saisie)

  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [ecoleInfo, setEcoleInfo] = useState<{ nom: string; nom_creancier?: string; ics_sepa?: string; assurance_proposee?: boolean; assurance_montant_annuel?: number } | null>(null)
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [famille, setFamille] = useState<any>(null)
  const [famForm, setFamForm] = useState<any>({})
  const [famModified, setFamModified] = useState(false)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [modes, setModes] = useState<any[]>([])
  const [paiementConfig, setPaiementConfig] = useState<any>(null)
  const [datesEncaissement, setDatesEncaissement] = useState<any[]>([])
  const [reductions, setReductions] = useState<any[]>([])
  const [reductionAccordee, setReductionAccordee] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)
  const [mandatExistant, setMandatExistant] = useState<any>(null)

  // Alerte DDR
  const [ddrStatut, setDdrStatut] = useState<string | null>(null)

  // Enfants contrat
  const [enfantsContrat, setEnfantsContrat] = useState<any[]>([])

  // Règlement
  const [modeReglement, setModeReglement] = useState('')
  const [nbEcheances, setNbEcheances] = useState(10)
  const [dateEncaissement, setDateEncaissement] = useState<number | null>(null)
  const [assuranceEcole, setAssuranceEcole] = useState(true)
  const [autorisationImage, setAutorisationImage] = useState(false)
  const [cautionAcceptee, setCautionAcceptee] = useState(false)
  const [observations, setObservations] = useState('')

  // Mandat SEPA
  const [sepaIban, setSepaIban] = useState('')
  const [sepaBic, setSepaBic] = useState('')
  const [sepaTitulaire, setSepaTitulaire] = useState('')
  const [sepaRibUploaded, setSepaRibUploaded] = useState<any>(null)
  const [uploadingRib, setUploadingRib] = useState(false)
  const ribRef = useRef<HTMLInputElement | null>(null)

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [signatureData, setSignatureData] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session: sess } } = await s.auth.getSession()
    if (!sess) { router.push('/login'); return }
    setSession(sess)

    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', sess.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [
      { data: fam }, { data: enf }, { data: cls },
      { data: tar }, { data: mod },
      { data: payCfg }, { data: datesEnc }, { data: redsf },
      { data: redAcc }, { data: cont }, { data: ddr }, { data: mandat },
    ] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*, classes(id, nom, secteur_id, secteurs(id, nom))').eq('famille_id', profile.famille_id),
      s.from('classes').select('id, nom, secteur_id, secteurs(id, nom)').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('tarifs_secteur').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).order('ordre'),
      s.from('modes_reglement_ecole').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('contrat_paiement_config').select('*').eq('ecole_id', profile.ecole_id).single(),
      s.from('dates_encaissement').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('reductions_famille_nombreuse').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).order('nb_enfants'),
      s.from('demandes_reduction').select('tarif_accorde, statut, id').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).eq('statut', 'accepte').single(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(*)').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).single(),
      s.from('demandes_reduction').select('statut').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).single(),
      s.from('mandats_sepa').select('*').eq('famille_id', profile.famille_id).eq('ecole_id', profile.ecole_id).eq('actif', true).single(),
    ])

    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? [])
    setTarifs(tar ?? []); setModes(mod ?? [])
    setPaiementConfig(payCfg); setDatesEncaissement(datesEnc ?? [])
    setReductions(redsf ?? []); setReductionAccordee(redAcc); setContrat(cont)
    setMandatExistant(mandat); setDdrStatut(ddr?.statut || null)

    // Charger les infos de l'école pour les textes dynamiques (nom institution, SEPA, assurance)
    const { data: ecData } = await s.from('ecoles').select('nom, nom_creancier, ics_sepa, assurance_proposee, assurance_montant_annuel').eq('id', profile.ecole_id).single()
    setEcoleInfo(ecData)
    // Si l'école ne propose pas d'assurance, le défaut est "fournit son propre justificatif"
    if (ecData && ecData.assurance_proposee === false) setAssuranceEcole(false)

    if (fam) setFamForm(fam)
    if (mod?.length && !modeReglement) setModeReglement(mod[0].type)
    if (datesEnc?.length) setDateEncaissement(datesEnc[0].jour_du_mois)
    const maxEch = payCfg?.nb_echeances_max || 12
    setNbEcheances(Math.min(maxEch, 10))

    // Mandat existant → pré-remplir
    if (mandat) {
      setSepaIban(mandat.iban); setSepaBic(mandat.bic); setSepaTitulaire(mandat.titulaire_compte)
    } else if (fam) {
      setSepaTitulaire(`${fam.parent1_prenom || ''} ${fam.parent1_nom || ''}`.trim())
    }

    // Pré-sélectionner enfants
    if (enf?.length && !cont) {
      // Tranche effective : tranche de la famille, sinon première tranche présente dans les tarifs
      const trancheFamilleLoad = fam?.tranche_id
        || Array.from(new Set((tar ?? []).map((t: any) => t.tranche_id).filter(Boolean)))[0]
        || null
      setEnfantsContrat(enf.map((e: any) => {
        const cls2 = e.classes
        const secteurId = cls2?.secteur_id || ''
        const tarifsApp = (tar ?? []).filter((t: any) => {
          const matchSecteur = !t.secteur_id || t.secteur_id === secteurId
          const matchTranche = !t.tranche_id || t.tranche_id === trancheFamilleLoad
          return matchSecteur && matchTranche
        })
        const postesObl = e.classe_id ? tarifsApp.filter((t: any) => t.obligatoire).map((t: any) => ({ tarif_id: t.id, nom: t.nom_poste, montant: parseFloat(t.montant) || 0 })) : []
        return { enfant_id: e.id, classe_id: e.classe_id || '', classe_nom: cls2?.nom || '', postes: postesObl, sous_total: postesObl.reduce((s: number, p: any) => s + p.montant, 0) }
      }))
    } else if (cont?.contrat_enfants) {
      setEnfantsContrat(cont.contrat_enfants)
    }

    setLoading(false)
  }

  // Tranche effective de la famille : sa tranche_id si définie, sinon la tranche
  // par défaut de l'école (la première par ordre, typiquement "Officiel").
  const trancheEffective = (() => {
    if (famille?.tranche_id) return famille.tranche_id
    const tranchesUtilisees = Array.from(new Set(tarifs.map((t: any) => t.tranche_id).filter(Boolean)))
    return tranchesUtilisees[0] || null
  })()

  // Calculs tarifs : filtre par secteur ET par tranche effective
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
      const postesObl = tarifsDispos.filter((t: any) => t.obligatoire).map((t: any) => ({ tarif_id: t.id, nom: t.nom_poste, montant: parseFloat(t.montant) || 0 }))
      return { ...e, classe_id: classeId, classe_nom: cls?.nom || '', postes: postesObl, sous_total: postesObl.reduce((s: number, t: any) => s + t.montant, 0) }
    }))
  }

  function toggleEnfantContrat(enfantId: string) {
    ks()
    setEnfantsContrat(prev => {
      if (prev.some(e => e.enfant_id === enfantId)) return prev.filter(e => e.enfant_id !== enfantId)
      return [...prev, { enfant_id: enfantId, classe_id: '', classe_nom: '', postes: [], sous_total: 0 }]
    })
  }

  function togglePoste(enfantId: string, tarif: any) {
    ks()
    setEnfantsContrat(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      const exists = e.postes.find((p: any) => p.tarif_id === tarif.id)
      const newPostes = exists ? e.postes.filter((p: any) => p.tarif_id !== tarif.id) : [...e.postes, { tarif_id: tarif.id, nom: tarif.nom_poste, montant: parseFloat(tarif.montant) || 0 }]
      return { ...e, postes: newPostes, sous_total: newPostes.reduce((s: number, p: any) => s + (parseFloat(p.montant) || 0), 0) }
    }))
  }

  const totalScolarite = enfantsContrat.reduce((s, e) => s + (e.sous_total || 0), 0)
  const nbEnfants = enfants.length
  const nbEnfantsAvecClasse = enfantsContrat.filter(e => e.classe_id).length

  const getReductionFN = () => {
    if (nbEnfantsAvecClasse < 2) return 0
    const trancheFamille = famille?.tranche_id || null
    const applicable = reductions.filter((r: any) => {
      if (parseInt(r.nb_enfants) > nbEnfants) return false
      // tranches_eligibles : null/[] = toutes ; sinon doit contenir la tranche de la famille
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
  const totalAssurance = (ecoleInfo?.assurance_proposee !== false && assuranceEcole) ? montantAssuranceAnnuel * Math.max(1, nbEnfantsAvecClasse) : 0

  // Si DDR validée : le tarif accordé couvre uniquement les postes 'inclus_dans_reduction'
  // (enseignement + demi-pension). Les options (transport, navette, etc.) restent à charge.
  const totalOptionsHorsReduction = enfantsContrat.reduce((s, e) => {
    return s + (e.postes || []).reduce((s2: number, p: any) => {
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

  // Signature
  function startSign(e: React.MouseEvent | React.TouchEvent) {
    isDrawing.current = true
    const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height
    const x = ('touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left
    const y = ('touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x * scaleX, y * scaleY)
  }

  function drawSign(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return; e.preventDefault()
    const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height
    const x = ('touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left
    const y = ('touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top
    ctx.lineTo(x * scaleX, y * scaleY); ctx.stroke()
  }

  function stopSign() {
    isDrawing.current = false
    if (canvasRef.current) setSignatureData(canvasRef.current.toDataURL('image/png'))
  }

  function clearSign() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureData('')
  }

  // Upload RIB
  async function uploadRib(file: File) {
    setUploadingRib(true)
    const fd = new FormData()
    fd.append('file', file); fd.append('familleId', familleId); fd.append('demandeId', ''); fd.append('configId', 'rib_sepa'); fd.append('label', 'RIB SEPA')
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: fd })
    const json = await res.json()
    if (json.success) setSepaRibUploaded({ url: json.url, nom_fichier: json.nom })
    setUploadingRib(false)
  }

  async function soumettre() {
    if (enfantsContrat.filter(e => e.classe_id).length === 0) { alert('Veuillez sélectionner au moins une classe'); return }
    if (!modeReglement) { alert('Choisissez un mode de règlement'); return }
    // (caution chèques retirée — plus exigée)
    if (modeReglement === 'sepa' && (!sepaIban || !sepaBic || !sepaTitulaire)) { alert('Renseignez les informations du mandat SEPA (IBAN, BIC, titulaire)'); return }
    if (!signatureData) { alert('Veuillez signer le contrat'); return }
    if (nouvelEnfantEnAttente) {
      alert("Un nouvel enfant est en attente de validation par l'etablissement. Le contrat sera disponible une fois la validation effectuee.")
      return
    }

    setSaving(true)
    const s = createClient()

    if (famModified) {
      await s.from('familles').update({
        parent1_prenom: famForm.parent1_prenom, parent1_nom: famForm.parent1_nom,
        parent1_email: famForm.parent1_email, parent1_telephone: famForm.parent1_telephone,
        parent1_adresse: famForm.parent1_adresse, parent1_code_postal: famForm.parent1_code_postal,
        parent1_ville: famForm.parent1_ville, parent2_prenom: famForm.parent2_prenom,
        parent2_nom: famForm.parent2_nom, parent2_email: famForm.parent2_email,
        parent2_telephone: famForm.parent2_telephone,
      }).eq('id', familleId)
    }

    // Uploader signature
    let sigUrl = ''
    if (signatureData) {
      const blob = await (await fetch(signatureData)).blob()
      const file = new File([blob], 'signature_contrat.png', { type: 'image/png' })
      const fd = new FormData()
      fd.append('file', file); fd.append('familleId', familleId); fd.append('demandeId', '')
      fd.append('configId', 'signature_contrat'); fd.append('label', 'Signature contrat')
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: fd })
      const json = await res.json()
      sigUrl = json.url || ''
    }

    const payload: any = {
      famille_id: familleId, ecole_id: ecoleId, annee_scolaire: anneeInscription,
      demande_reduction_id: reductionAccordee ? (await s.from('demandes_reduction').select('id').eq('famille_id', familleId).eq('annee_scolaire', anneeInscription).single()).data?.id : null,
      assurance_ecole: assuranceEcole, assurance_montant_total: totalAssurance,
      mode_reglement: modeReglement, nb_echeances: nbEcheances,
      montant_total: totalAnnuel, autorisation_image: autorisationImage,
      caution_acceptee: cautionAcceptee, observations: observations || null,
      engagement_lu: true, statut: 'soumis', soumis_le: new Date().toISOString(),
      signature_url: sigUrl, signature_date: new Date().toISOString(),
      droit_image: autorisationImage,
    }

    let contratId = contrat?.id
    if (contratId) {
      const { data: upd, error: updErr } = await s.from('contrats_scolarisation').update(payload).eq('id', contratId).select()
      if (updErr || !upd || upd.length === 0) {
        setSaving(false)
        alert('Erreur lors de la soumission du contrat : ' + (updErr?.message || 'aucune ligne modifiée. Contactez l\'administration.'))
        return
      }
      await s.from('contrat_enfants').delete().eq('contrat_id', contratId)
    } else {
      const { data: nc, error: insErr } = await s.from('contrats_scolarisation').insert(payload).select().single()
      if (insErr || !nc) {
        setSaving(false)
        alert('Erreur lors de la création du contrat : ' + (insErr?.message || 'inconnue'))
        return
      }
      contratId = nc.id
    }

    if (contratId) {
      for (const e of enfantsContrat.filter(ec => ec.classe_id)) {
        const cls = classes.find((c: any) => c.id === e.classe_id)
        await s.from('contrat_enfants').insert({ contrat_id: contratId, enfant_id: e.enfant_id, secteur_id: cls?.secteur_id || null, classe_prevue: e.classe_nom, postes: e.postes, sous_total: e.sous_total })
      }

      // Sauvegarder scolarité N actuelle pour N+1
      await s.from('familles').update({ scolarite_n1: totalAnnuel, scolarite_n1_annee: anneeInscription }).eq('id', familleId)

      // Mandat SEPA
      if (modeReglement === 'sepa') {
        const rum = `BH-${famille?.numero || familleId.slice(0, 8)}-${new Date().getFullYear()}`
        const mandatPayload = { famille_id: familleId, ecole_id: ecoleId, contrat_id: contratId, iban: sepaIban.replace(/\s/g, '').toUpperCase(), bic: sepaBic.toUpperCase(), titulaire_compte: sepaTitulaire, rib_url: sepaRibUploaded?.url || null, rum, date_signature: new Date().toISOString().split('T')[0], actif: true }
        if (mandatExistant) {
          await s.from('mandats_sepa').update(mandatPayload).eq('id', mandatExistant.id)
        } else {
          await s.from('mandats_sepa').insert(mandatPayload)
        }
      }

      // Générer chèques/échéances — l'échéancier démarre en septembre de l'année scolaire
      if ((modeReglement === 'cheque' || modeReglement === 'sepa') && nbEcheances > 0 && dateEncaissement) {
        await s.from('cheques_prevus').delete().eq('contrat_id', contratId)
        // Année scolaire "2026-2027" => septembre 2026 (mois index 8)
        const anneeDebut = parseInt(anneeInscription.split('-')[0]) || new Date().getFullYear()
        const moisDebut = 8
        // Les chèques restent invisibles tant que l'admin n'a pas validé leur réception.
        const statutInitial = modeReglement === 'cheque' ? 'attente_reception' : 'prevu'
        const cheques = []
        for (let i = 0; i < nbEcheances; i++) {
          let m = moisDebut + i; let y = anneeDebut
          while (m > 11) { m -= 12; y++ }
          const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(dateEncaissement).padStart(2, '0')}`
          cheques.push({ contrat_id: contratId, famille_id: familleId, ecole_id: ecoleId, numero_cheque: i + 1, montant: montantEcheance, date_echeance: dateStr, statut: statutInitial, mode_paiement: modeReglement })
        }
        await s.from('cheques_prevus').insert(cheques)
      }
    }

    // Notification email aux admins (best-effort)
    try {
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ecole_id: ecoleId, famille_id: familleId, type: 'contrat_soumis' }),
      })
    } catch {}

    setSaving(false)
    router.push('/portail/inscriptions')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  if (!parent.estPrincipal) return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>Démarche réservée au parent principal</h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>Cette démarche d&apos;inscription est gérée par le parent principal de la famille. Vous pouvez en suivre l&apos;avancement depuis la page « Année N+1 ».</p>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ marginTop: 18, background: '#2563EB', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Retour</button>
      </div>
    </div>
  )

  if (contrat?.statut === 'soumis' || contrat?.statut === 'valide') {
    const st = formatStatut(contrat.statut)
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>← Retour</button>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>Contrat soumis</h2>
        <span style={{ fontSize: 14, fontWeight: 700, color: st.color, background: st.bg, padding: '8px 20px', borderRadius: 20, display: 'inline-block', marginTop: 12 }}>{st.label}</span>
        <div style={{ marginTop: 24, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: '#64748B' }}>Total annuel</span>
            <span style={{ fontWeight: 700 }}>{contrat.montant_total?.toLocaleString('fr-FR')} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#64748B' }}>Règlement</span>
            <span style={{ fontWeight: 600 }}>{labelModePaiement(contrat.mode_reglement)} — {contrat.nb_echeances} échéance(s)</span>
          </div>
        </div>
      </div>
    )
  }

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
  const nouvelEnfantEnAttente = enfants.some((e: any) => e.statut_inscription === 'en_attente')

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>← Retour</button>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>Contrat de scolarisation {anneeInscription}</h1>
      </div>

      {/* ── VERROU NOUVEL ENFANT EN ATTENTE ── */}
      {nouvelEnfantEnAttente && (
        <div style={{ background: '#FFFBEB', border: '2px solid #FDE68A', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⏳</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>Nouvel enfant en attente de validation</div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>
              Vous avez ajouté un enfant qui doit d&apos;abord être validé par l&apos;établissement.
              Le contrat de réinscription sera disponible une fois la validation effectuée — le tarif dépend du nombre d&apos;enfants.
            </div>
          </div>
        </div>
      )}

      {/* ── ALERTE DDR ── */}
      {ddrStatut && ddrStatut !== 'accepte' && (
        <div style={{ background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>Demande de réduction en cours</div>
            <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.5 }}>
              Votre demande de réduction n'a pas encore été traitée (statut : <strong>{formatStatut(ddrStatut).label}</strong>).
              Vous pouvez continuer le contrat, mais le tarif final pourra être ajusté après la décision de la commission.
            </div>
          </div>
        </div>
      )}

      {/* ── INFOS FAMILLE ── */}
      <Section title="1. Vos informations">
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Vérifiez et corrigez si nécessaire.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Prénom resp. 1 *</label><input style={inp} value={famForm.parent1_prenom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_prenom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>Nom resp. 1 *</label><input style={inp} value={famForm.parent1_nom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_nom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>Adresse *</label><input style={inp} value={famForm.parent1_adresse || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_adresse: e.target.value })); setFamModified(true) }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>CP *</label><input style={inp} value={famForm.parent1_code_postal || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_code_postal: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>Ville *</label><input style={inp} value={famForm.parent1_ville || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_ville: e.target.value })); setFamModified(true) }} /></div>
          </div>
          <div><label style={lbl}>Portable *</label><input style={inp} value={famForm.parent1_telephone || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_telephone: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>Email *</label><input style={inp} type="email" value={famForm.parent1_email || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_email: e.target.value })); setFamModified(true) }} /></div>
          {(famForm.parent2_prenom || famForm.parent2_nom) && <>
            <div><label style={lbl}>Prénom resp. 2</label><input style={inp} value={famForm.parent2_prenom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_prenom: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>Nom resp. 2</label><input style={inp} value={famForm.parent2_nom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_nom: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>Portable resp. 2</label><input style={inp} value={famForm.parent2_telephone || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_telephone: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>Email resp. 2</label><input style={inp} type="email" value={famForm.parent2_email || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_email: e.target.value })); setFamModified(true) }} /></div>
          </>}
        </div>
      </Section>

      {/* ── ENFANTS ── */}
      <Section title="2. Enfants à (ré)inscrire *">
        {enfants.map((enfant: any) => {
          const enf = enfantsContrat.find(e => e.enfant_id === enfant.id) || { classe_id: '', postes: [], sous_total: 0 }
          const isSelected = enfantsContrat.some(e => e.enfant_id === enfant.id)
          const cls = classes.find((c: any) => c.id === enf.classe_id)
          const tarifsDispos = getTarifsForSecteur(cls?.secteur_id || '')
          return (
            <div key={enfant.id} style={{ border: `2px solid ${isSelected ? '#2563EB' : '#E2E8F0'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
              <div style={{ padding: '12px 16px', background: isSelected ? '#EFF6FF' : '#F8FAFC', display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleEnfantContrat(enfant.id)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2563EB', flexShrink: 0 }} />
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{enfant.prenom?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                    {enfant.statut_inscription === 'en_attente' && (
                      <span style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>⏳ En attente</span>
                    )}
                  </div>
                  {enfant.classes?.nom && <div style={{ fontSize: 11, color: '#94A3B8' }}>Classe actuelle : {enfant.classes.nom}</div>}
                </div>
                {enf.sous_total > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{enf.sous_total.toLocaleString('fr-FR')} €</div>}
              </div>
              {isSelected && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={lbl}>Classe souhaitée 2026/2027 *</label>
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
                              <span style={{ fontSize: 13 }}>{t.nom_poste}{t.obligatoire && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6 }}>(inclus)</span>}</span>
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

      {/* ── ASSURANCE ── (masquée si l'école ne propose pas d'assurance) */}
      {ecoleInfo?.assurance_proposee !== false && (
        <Section title="3. Assurance scolaire">
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
            <input type="radio" checked={assuranceEcole} onChange={() => { ks(); setAssuranceEcole(true) }} />
            <div>Assurance proposée par l'établissement
              <span style={{ fontWeight: 700, color: '#059669', marginLeft: 8 }}>{montantAssuranceAnnuel} € × {Math.max(1, nbEnfantsAvecClasse)} = {totalAssurance} €</span>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: !assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${!assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
            <input type="radio" checked={!assuranceEcole} onChange={() => { ks(); setAssuranceEcole(false) }} />
            Je fournis ma propre attestation d'assurance valide pour {anneeInscription}
          </label>
        </Section>
      )}

      {/* ── TOTAL ── */}
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
        {assuranceEcole && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}><span>Assurance scolaire</span><span>{totalAssurance} €</span></div>}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
          <span>Total annuel</span><span style={{ color: '#60A5FA' }}>{totalAnnuel.toLocaleString('fr-FR')} €</span>
        </div>
      </div>

      {/* ── RÈGLEMENT ── */}
      <Section title="4. Mode de règlement *">
        {modes.map((m: any) => (
          <div key={m.id} style={{ border: `1px solid ${modeReglement === m.type ? '#BFDBFE' : '#E2E8F0'}`, background: modeReglement === m.type ? '#EFF6FF' : '#F8FAFC', borderRadius: 10, padding: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input type="radio" checked={modeReglement === m.type} onChange={() => { ks(); setModeReglement(m.type) }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{m.label}</span>
            </label>

            {modeReglement === m.type && (
              <div style={{ marginTop: 14, marginLeft: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Infos configurées par l'école (ordre chèque, IBAN, instructions) */}
                {m.config && (m.config.ordre_cheque || m.config.iban || m.config.conditions) && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14, fontSize: 12, color: '#92400E', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {m.config.ordre_cheque && (
                      <div><strong>Chèques à l'ordre de :</strong> {m.config.ordre_cheque}</div>
                    )}
                    {m.config.iban && (
                      <div>
                        <strong>IBAN du bénéficiaire :</strong> <span style={{ fontFamily: 'monospace' }}>{m.config.iban}</span>
                        {m.config.bic && <> · <strong>BIC :</strong> {m.config.bic}</>}
                        {m.config.titulaire && <> · <strong>Titulaire :</strong> {m.config.titulaire}</>}
                      </div>
                    )}
                    {m.config.conditions && (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.config.conditions}</div>
                    )}
                  </div>
                )}

                {/* Nb échéances */}
                <div>
                  <label style={lbl}>Nombre d'échéances *</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Array.from({ length: maxEch - minEch + 1 }, (_, i) => minEch + i).map(n => (
                      <button key={n} onClick={() => { ks(); setNbEcheances(n) }}
                        style={{ width: 44, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: nbEcheances === n ? 700 : 400, background: nbEcheances === n ? '#2563EB' : '#F1F5F9', color: nbEcheances === n ? '#fff' : '#475569' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {nbEcheances > 1 && <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>Soit <strong>{montantEcheance.toLocaleString('fr-FR')} €</strong> × {nbEcheances} {m.type === 'cheque' ? 'chèques' : 'prélèvements'}</div>}
                </div>

                {/* Date encaissement */}
                {datesEncaissement.length > 0 && (
                  <div>
                    <label style={lbl}>Date d'encaissement *</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {datesEncaissement.map((d: any) => (
                        <button key={d.id} onClick={() => { ks(); setDateEncaissement(d.jour_du_mois) }}
                          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: dateEncaissement === d.jour_du_mois ? 600 : 400, background: dateEncaissement === d.jour_du_mois ? '#2563EB' : '#F1F5F9', color: dateEncaissement === d.jour_du_mois ? '#fff' : '#475569' }}>
                          {d.label || `${d.jour_du_mois} du mois`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mandat SEPA */}
                {m.type === 'sepa' && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
                      {mandatExistant ? '✓ Mandat SEPA existant — vérifiez les informations' : 'Nouveau mandat de prélèvement SEPA'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div><label style={lbl}>IBAN *</label><input style={inp} value={sepaIban} onChange={e => { ks(); setSepaIban(e.target.value) }} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div><label style={lbl}>BIC *</label><input style={inp} value={sepaBic} onChange={e => { ks(); setSepaBic(e.target.value) }} placeholder="BNPAFRPP" /></div>
                        <div><label style={lbl}>Titulaire du compte *</label><input style={inp} value={sepaTitulaire} onChange={e => { ks(); setSepaTitulaire(e.target.value) }} /></div>
                      </div>
                      <div>
                        <label style={lbl}>RIB (PDF ou image)</label>
                        <input ref={ribRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadRib(f) }} />
                        {sepaRibUploaded ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>✓ {sepaRibUploaded.nom_fichier}</span>
                            <button onClick={() => ribRef.current?.click()} style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>Remplacer</button>
                          </div>
                        ) : (
                          <button onClick={() => ribRef.current?.click()} disabled={uploadingRib}
                            style={{ fontSize: 12, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
                            {uploadingRib ? 'Upload...' : '📎 Joindre le RIB'}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                        <strong>Créancier :</strong> {ecoleInfo?.nom_creancier || ecoleInfo?.nom || 'l\'établissement'}{ecoleInfo?.ics_sepa ? ` — ICS : ${ecoleInfo.ics_sepa}` : ''}<br />
                        En signant ce contrat, vous autorisez {ecoleInfo?.nom_creancier || ecoleInfo?.nom || 'l\'établissement'} à envoyer des instructions à votre banque pour débiter votre compte.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* ── AUTORISATION IMAGE + OBSERVATIONS ── */}
      <Section title="5. Autorisations et observations">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
          <input type="checkbox" checked={autorisationImage} onChange={e => { ks(); setAutorisationImage(e.target.checked) }} style={{ marginTop: 2, flexShrink: 0, accentColor: '#2563EB' }} />
          J'autorise la prise et l'utilisation d'images de mes enfants dans le cadre de la communication de {ecoleInfo?.nom || 'l\'institution scolaire'}.
        </label>
        <div>
          <label style={lbl}>Observations</label>
          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={observations} onChange={e => { ks(); setObservations(e.target.value) }} placeholder="Remarques éventuelles..." />
        </div>
      </Section>

      {/* ── ENGAGEMENT + SIGNATURE ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Engagement et signature</div>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', padding: '14px 18px', fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 16 }}>
          Nous soussigné(e)s, <strong>{famForm.parent1_prenom} {famForm.parent1_nom}</strong>, reconnaissons avoir pris connaissance des tarifs pour l'année scolaire {anneeInscription} et approuvons le règlement de l'établissement. {totalAnnuel > 0 ? <>Nous nous engageons à régler la somme de <strong>{totalAnnuel.toLocaleString('fr-FR')} €</strong> selon les modalités choisies.</> : <span style={{ color: '#92400E' }}>⚠️ Le total de scolarité n'est pas encore calculé. Sélectionnez une classe pour chaque enfant.</span>}
        </div>

        <label style={lbl}>Signature *</label>
        <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 8px' }}>Signez dans le cadre ci-dessous</p>
        <div style={{ border: `2px solid ${signatureData ? '#10B981' : '#E2E8F0'}`, borderRadius: 10, overflow: 'hidden', background: '#fff', touchAction: 'none' }}>
          <canvas ref={canvasRef} width={600} height={150}
            style={{ display: 'block', width: '100%', cursor: 'crosshair' }}
            onMouseDown={startSign} onMouseMove={drawSign} onMouseUp={stopSign} onMouseLeave={stopSign}
            onTouchStart={startSign} onTouchMove={drawSign} onTouchEnd={stopSign} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button onClick={clearSign} style={{ fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>↺ Effacer</button>
          {signatureData && <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>✓ Signature enregistrée</span>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>Annuler</button>
        <button onClick={soumettre} disabled={saving || nouvelEnfantEnAttente} style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (saving || nouvelEnfantEnAttente) ? 'not-allowed' : 'pointer', opacity: (saving || nouvelEnfantEnAttente) ? 0.7 : 1 }}>
          {saving ? 'Envoi...' : '📝 Soumettre le contrat'}
        </button>
      </div>
    </div>
  )
}
