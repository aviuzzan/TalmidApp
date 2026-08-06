'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatStatut } from '@/lib/inscriptions'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { labelModePaiement } from '@/lib/statuts'
import { useI18n } from '@/lib/i18n'
import { validerIban, formaterIban, nettoyerIban, validerBic } from '@/lib/iban'
import { trouverClasseSuivante } from '@/lib/scolarite'
import { fmtDate } from '@/lib/format-date'
import { appAlert } from '@/components/ui/ConfirmDialog'

// IMPORTANT : Section au niveau module (sinon re-mount + scroll-jump à chaque keystroke).
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
    {children}
  </div>
)

// ── Classe N+1 : LE PASSAGE DE CLASSE FAIT FOI (décision client 28/07) ──
// 68 contrats sur 94 portaient la classe EN COURS au lieu de celle de l'année
// suivante : le parent ne choisit plus. La classe est déterminée par l'appli
//   (a) scolarité déjà créée sur l'exercice d'inscription (N+1) → définitive ;
//   (b) sinon classe suivante calculée depuis l'année en cours → à confirmer ;
//   (c) sinon (enfant nouveau, aucune scolarité) → sélecteur libre (admission).
// La RPC soumettre_contrat_famille refait le contrôle côté serveur.
type SourceClasse = 'scolarite_n1' | 'passage_calcule'
type ClasseImposee = {
  classe_id: string
  classe_nom: string
  secteur_id: string | null
  secteur_nom: string | null
  source: SourceClasse
}
type PosteContrat = { tarif_id: string; nom: string; montant: number }

// Postes d'un enfant pour un secteur donné : tarifs obligatoires + options
// encore applicables (même filtre secteur/tranche que getTarifsForSecteur —
// une classe N+1 peut changer de secteur, ex. Kita 5 → Kita 6, et les tarifs
// doivent suivre).
const postesPourSecteur = (
  tarifsSource: any[], trancheId: string | null, secteurId: string | null, optionIds: string[] = [],
): PosteContrat[] => {
  const options = new Set(optionIds)
  return (tarifsSource || [])
    .filter((t: any) => {
      const matchSecteur = !t.secteur_id || t.secteur_id === (secteurId || '')
      const matchTranche = !t.tranche_id || t.tranche_id === trancheId
      return matchSecteur && matchTranche && (t.obligatoire || options.has(t.id))
    })
    .map((t: any) => ({ tarif_id: t.id, nom: t.nom_poste, montant: parseFloat(t.montant) || 0 }))
}

const sommePostes = (postes: PosteContrat[]): number =>
  postes.reduce((s, p) => s + (Number(p.montant) || 0), 0)

export default function ContratPage() {
  const { anneeInscription, exerciceInscriptionId } = useAnneeInscription()
  const router = useRouter()
  const parent = useParentCtx()
  const { t, lang } = useI18n()
  // Marqueur « formulaire modifié » (ex no-op scroll) : alimente le garde beforeunload.
  const dirtyRef = useRef(false)
  const ks = () => { dirtyRef.current = true }

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
  const [placesMap, setPlacesMap] = useState<Map<string, { complet: boolean; nb_inscrits: number; places_max: number | null }>>(new Map())

  // Alerte DDR
  const [ddrStatut, setDdrStatut] = useState<string | null>(null)

  // Enfants contrat
  const [enfantsContrat, setEnfantsContrat] = useState<any[]>([])
  const [admissions, setAdmissions] = useState<Record<string, string>>({})
  // Classe N+1 imposée par l'établissement (cf. en-tête du fichier)
  const [classesImposees, setClassesImposees] = useState<Record<string, ClasseImposee>>({})

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

  // Garde : avertir avant de fermer/rafraîchir l'onglet si le formulaire a été
  // modifié et non soumis (pas d'autosave — simple garde-fou, audit 28/07).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

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
      s.from('contrat_paiement_config').select('*').eq('ecole_id', profile.ecole_id).maybeSingle(),
      s.from('dates_encaissement').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('reductions_famille_nombreuse').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).order('nb_enfants'),
      s.from('demandes_reduction').select('tarif_accorde, statut, id').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).eq('statut', 'accepte').maybeSingle(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(*)').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('demandes_reduction').select('statut').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('mandats_sepa').select('*').eq('famille_id', profile.famille_id).eq('ecole_id', profile.ecole_id).eq('actif', true).maybeSingle(),
    ])

    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? [])
    setTarifs(tar ?? []); setModes(mod ?? [])
    setPaiementConfig(payCfg); setDatesEncaissement(datesEnc ?? [])
    setReductions(redsf ?? []); setReductionAccordee(redAcc); setContrat(cont)
    setMandatExistant(mandat); setDdrStatut(ddr?.statut || null)

    // Compteurs de places (RPC) pour bloquer les options completes
    try {
      const { data: placesData } = await s.rpc('places_options', { p_ecole_id: profile.ecole_id, p_annee: anneeInscription })
      const pm = new Map<string, any>()
      ;(placesData || []).forEach((r: any) => pm.set(r.tarif_id, { complet: !!r.complet, nb_inscrits: Number(r.nb_inscrits) || 0, places_max: r.places_max == null ? null : Number(r.places_max) }))
      setPlacesMap(pm)
    } catch { /* RPC absente = pas de blocage */ }

    // Charger les infos de l'école pour les textes dynamiques (nom institution, SEPA, assurance)
    // + exercice courant (= année en cours) pour le calcul de la classe N+1.
    const { data: ecData } = await s.from('ecoles').select('nom, nom_creancier, ics_sepa, assurance_proposee, assurance_montant_annuel, exercice_courant_id').eq('id', profile.ecole_id).single()
    setEcoleInfo(ecData)

    // Verrou DDR : si famille éligible mais pas de réponse ni renoncement → on bascule sur un mode lock
    // (l'utilisateur sera redirigé vers /portail/inscriptions où la décision se prend)
    try {
      const { data: cfgInsc } = await s.from('inscriptions_config').select('tranches_eligibles_ddr').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).maybeSingle()
      const eligiblesTr: string[] = (cfgInsc as any)?.tranches_eligibles_ddr || []
      const trancheEligible = fam?.tranche_id && eligiblesTr.includes(fam.tranche_id)
      const renoncements = (fam?.renoncements_ddr || {}) as Record<string, any>
      const aRenonce = !!renoncements[anneeInscription]
      const ddrTraitee = ddr && ['accepte', 'refuse'].includes(ddr.statut)
      if (trancheEligible && !ddrTraitee && !aRenonce && !cont) {
        if (typeof window !== 'undefined') router.push('/portail/inscriptions')
        return
      }
    } catch {}
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

    // Tranche effective : tranche de la famille, sinon première tranche présente dans les tarifs
    const trancheFamilleLoad: string | null = fam?.tranche_id
      || (Array.from(new Set((tar ?? []).map((t: any) => t.tranche_id).filter(Boolean)))[0] as string | undefined)
      || null

    // ── Classe N+1 : le passage de classe fait foi ──────────────────────────
    // (a) scolarité de l'exercice d'inscription → classe définitive ;
    // (b) sinon classe suivante calculée depuis l'année en cours ;
    // (c) sinon rien d'imposé → le sélecteur reste libre (enfant nouveau).
    const clsList: any[] = cls ?? []
    const enfantsList: any[] = enf ?? []
    const imposees: Record<string, ClasseImposee> = {}
    if (enfantsList.length > 0) {
      const exCourantId: string | null = (ecData as any)?.exercice_courant_id || null
      let scoRows: any[] = []
      try {
        const { data: sco } = await s.from('scolarites')
          .select('enfant_id, exercice_id, ecole_id, classe_id, annee_scolaire')
          .in('enfant_id', enfantsList.map((e: any) => e.id))
        scoRows = (sco ?? []).filter((r: any) => !r.ecole_id || r.ecole_id === profile.ecole_id)
      } catch { /* scolarités illisibles côté parent : on retombe sur enfants.classe_id */ }

      const imposer = (classeId: string, source: SourceClasse): ClasseImposee | null => {
        const c = clsList.find((x: any) => x.id === classeId)
        if (!c) return null
        return {
          classe_id: c.id,
          classe_nom: c.nom || '',
          secteur_id: c.secteur_id || null,
          secteur_nom: c.secteurs?.nom || null,
          source,
        }
      }

      for (const e of enfantsList) {
        // (a) scolarité déjà créée sur l'année demandée
        const scoN1 = scoRows.find((r: any) => r.enfant_id === e.id && r.classe_id && (
          exerciceInscriptionId ? r.exercice_id === exerciceInscriptionId : r.annee_scolaire === anneeInscription
        ))
        const depuisN1 = scoN1 ? imposer(scoN1.classe_id, 'scolarite_n1') : null
        if (depuisN1) { imposees[e.id] = depuisN1; continue }
        // (b) classe de l'année en cours (scolarités = source de vérité ;
        //     enfants.classe_id en miroir si la scolarité n'est pas lisible)
        const scoCourante = scoRows.find((r: any) => r.enfant_id === e.id && r.classe_id
          && exCourantId && r.exercice_id === exCourantId)
        const classeActuelleId: string = scoCourante?.classe_id || e.classe_id || ''
        const suivante = trouverClasseSuivante(clsList, classeActuelleId)
        const depuisPassage = suivante ? imposer(suivante.id, 'passage_calcule') : null
        if (depuisPassage) imposees[e.id] = depuisPassage
      }
    }
    setClassesImposees(imposees)

    // ── Statut admission par enfant — RÈGLE (a) D'AVI (audit portail parent 06/08) ──
    // Un enfant dont l'admission n'est pas validée ('accepte') ne peut PAS être
    // inclus dans un contrat de scolarisation. Chargé SYSTÉMATIQUEMENT (avant :
    // uniquement quand aucun contrat n'existait → un contrat brouillon repris
    // n'appliquait plus le verrou d'admission).
    // Un enfant SANS fiche pédagogique de l'année est un enfant historique en
    // réinscription (chantier « fiche pédagogique = nouvel enfant uniquement ») :
    // il reste sélectionnable sans nouvelle admission.
    const enfAdmStatuts: Record<string, string> = {}
    if (enfantsList.length > 0) {
      const { data: fp } = await s.from('inscriptions_pedagogiques')
        .select('enfant_id, statut').in('enfant_id', enfantsList.map((e: any) => e.id))
        .eq('annee_scolaire', anneeInscription)
      ;(fp || []).forEach((f: any) => { enfAdmStatuts[f.enfant_id] = f.statut })
      setAdmissions(enfAdmStatuts)
    }
    // Enfant bloqué par la règle (a) : fiche de l'année existante mais non validée
    const admissionBloquee = (enfantId: string) => {
      const adm = enfAdmStatuts[enfantId]
      return !!adm && adm !== 'accepte' && adm !== 'valide'
    }

    // Pré-sélectionner enfants
    if (enf?.length && !cont) {
      // Pre-cocher seulement les enfants dont l'admission est validee
      const enfAdmis = enfantsList.filter((e: any) => !admissionBloquee(e.id))
      setEnfantsContrat(enfAdmis.map((e: any) => {
        // Classe imposée si elle existe, sinon classe actuelle (comportement historique)
        const impos = imposees[e.id]
        const classeId: string = impos?.classe_id || e.classe_id || ''
        const cls2 = impos ? clsList.find((c: any) => c.id === impos.classe_id) : e.classes
        const postesObl = classeId
          ? postesPourSecteur(tar ?? [], trancheFamilleLoad, cls2?.secteur_id || '')
          : []
        return {
          enfant_id: e.id,
          classe_id: classeId,
          classe_nom: impos?.classe_nom || cls2?.nom || '',
          postes: postesObl,
          sous_total: sommePostes(postesObl),
        }
      }))
    } else if (cont?.contrat_enfants) {
      // Contrat repris (non soumis) : la classe imposée prime aussi ici, et les
      // postes sont recalés sur son secteur (les options déjà cochées sont
      // conservées si elles restent applicables).
      // RÈGLE (a) audit 06/08 : un enfant dont l'admission n'est plus/pas validée
      // est retiré de la sélection reprise (il réapparaîtra grisé dans la liste).
      setEnfantsContrat((cont.contrat_enfants as any[]).filter((ce: any) => !admissionBloquee(ce.enfant_id)).map((ce: any) => {
        const impos = imposees[ce.enfant_id]
        if (!impos) return ce
        const optionIds = (ce.postes || []).map((p: any) => p.tarif_id).filter(Boolean)
        const postes = postesPourSecteur(tar ?? [], trancheFamilleLoad, impos.secteur_id, optionIds)
        return { ...ce, classe_id: impos.classe_id, classe_nom: impos.classe_nom, postes, sous_total: sommePostes(postes) }
      }))
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
    ks()
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
      // Si la classe N+1 est imposée, on la (re)pose directement avec ses postes
      // obligatoires : le parent n'a pas de sélecteur pour le faire.
      const impos = classesImposees[enfantId]
      if (!impos) return [...prev, { enfant_id: enfantId, classe_id: '', classe_nom: '', postes: [], sous_total: 0 }]
      const postes = postesPourSecteur(tarifs, trancheEffective, impos.secteur_id)
      return [...prev, { enfant_id: enfantId, classe_id: impos.classe_id, classe_nom: impos.classe_nom, postes, sous_total: sommePostes(postes) }]
    })
  }

  function togglePoste(enfantId: string, tarif: any) {
    ks()
    // Garde capacite : impossible de cocher une option complete (decocher reste possible)
    const dejaCoche = enfantsContrat.find(e => e.enfant_id === enfantId)?.postes?.some((p: any) => p.tarif_id === tarif.id)
    if (!dejaCoche && placesMap.get(tarif.id)?.complet) return
    setEnfantsContrat(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      const exists = e.postes.find((p: any) => p.tarif_id === tarif.id)
      let newPostes: any[]
      if (exists) {
        // Decoche le poste
        newPostes = e.postes.filter((p: any) => p.tarif_id !== tarif.id)
      } else {
        // Coche un nouveau poste : retirer d'abord les autres tarifs du meme groupe_exclusif (ex: si on coche Navette, on retire Car de ramassage)
        const groupe = tarif.groupe_exclusif
        const idsAEvincer = groupe
          ? tarifs.filter((t: any) => t.groupe_exclusif === groupe && t.id !== tarif.id).map((t: any) => t.id)
          : []
        const postesNettoyes = idsAEvincer.length ? e.postes.filter((p: any) => !idsAEvincer.includes(p.tarif_id)) : e.postes
        newPostes = [...postesNettoyes, { tarif_id: tarif.id, nom: tarif.nom_poste, montant: parseFloat(tarif.montant) || 0 }]
      }
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
  // L'assurance est facturée par enfant inscrit (avec classe choisie).
  // Si aucun enfant n'a encore de classe → 0 € (pas d'assurance fantôme).
  const totalAssurance = (ecoleInfo?.assurance_proposee !== false && assuranceEcole) ? montantAssuranceAnnuel * nbEnfantsAvecClasse : 0

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
    if (isDrawing.current) ks()
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
    if (enfantsContrat.filter(e => e.classe_id).length === 0) { await appAlert(t('portail.contrat.err.select_class')); return }
    if (!modeReglement) { await appAlert(t('portail.contrat.err.select_mode')); return }
    // (caution chèques retirée — plus exigée)
    if (modeReglement === 'sepa' && (!sepaIban || !sepaBic || !sepaTitulaire)) { await appAlert(t('portail.contrat.err.sepa_missing')); return }
    // FIX audit 28/07 : validation IBAN (format + clé MOD 97) et BIC avant soumission
    if (modeReglement === 'sepa' && !validerIban(sepaIban)) {
      await appAlert(t('portail.contrat.err.iban_invalide', "L'IBAN saisi est invalide. Vérifiez votre saisie (ex. FR76 3000 6000 0112 3456 7890 189)."))
      return
    }
    if (modeReglement === 'sepa' && !validerBic(sepaBic)) {
      await appAlert(t('portail.contrat.err.bic_invalide', 'Le BIC saisi est invalide : 8 ou 11 caractères attendus (ex. BNPAFRPP).'))
      return
    }
    if (!signatureData) { await appAlert(t('portail.contrat.err.sign')); return }
    if (nouvelEnfantEnAttente) {
      await appAlert(t('portail.contrat.err.child_pending'))
      return
    }

    setSaving(true)
    const s = createClient()

    // Re-verification des places juste avant la soumission (une option a pu se
    // remplir entre le chargement de la page et la signature).
    try {
      const { data: placesFraiches } = await s.rpc('places_options', { p_ecole_id: ecoleId, p_annee: anneeInscription })
      const fraiche = new Map<string, any>()
      ;(placesFraiches || []).forEach((r: any) => fraiche.set(r.tarif_id, r))
      const optionsCompletes: string[] = []
      enfantsContrat.forEach(e => {
        ;(e.postes || []).forEach((p: any) => {
          const pl = fraiche.get(p.tarif_id)
          if (pl?.complet) optionsCompletes.push(p.nom || t('portail.contrat.option_fallback'))
        })
      })
      if (optionsCompletes.length > 0) {
        await appAlert(t('portail.contrat.err.option_full', { options: Array.from(new Set(optionsCompletes)).join(' », « ') }))
        setEnfantsContrat(prev => prev.map(e => {
          const postesOk = (e.postes || []).filter((p: any) => !fraiche.get(p.tarif_id)?.complet)
          return { ...e, postes: postesOk, sous_total: postesOk.reduce((sum: number, p: any) => sum + (parseFloat(p.montant) || 0), 0) }
        }))
        setPlacesMap(() => {
          const pm = new Map<string, any>()
          fraiche.forEach((r: any, id: string) => pm.set(id, { complet: !!r.complet, nb_inscrits: Number(r.nb_inscrits) || 0, places_max: r.places_max == null ? null : Number(r.places_max) }))
          return pm
        })
        setSaving(false)
        return
      }
    } catch { /* RPC indisponible : on laisse passer */ }

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

    // ── Soumission transactionnelle côté serveur (FIX sécu audit 28/07) ──
    // Les montants ne partent plus du navigateur : la RPC SECURITY DEFINER
    // soumettre_contrat_famille (db/migrations/2026-07-28-rpc-soumettre-contrat.sql)
    // recalcule tout (tarifs, tranche, groupes exclusifs, réduction famille
    // nombreuse, tarif accordé DDR, assurance) puis écrit atomiquement
    // contrat + contrat_enfants + échéancier (jour clampé au dernier jour du
    // mois) + mandat SEPA. On n'envoie QUE des identifiants et des choix.
    // La classe envoyée est celle déterminée par l'appli quand elle est imposée
    // (passage de classe) — le serveur la revérifie de toute façon.
    const enfantsPayload = enfantsContrat
      // RÈGLE (a) D'AVI (audit portail parent 06/08) — garde-fou final : aucun
      // enfant dont l'admission n'est pas validée ne part dans le contrat, même
      // si un état intermédiaire l'avait laissé dans la sélection.
      .filter(e => {
        const adm = admissions[e.enfant_id]
        return !adm || adm === 'accepte' || adm === 'valide'
      })
      .map(e => ({
        enfant_id: e.enfant_id,
        classe_id: classesImposees[e.enfant_id]?.classe_id || e.classe_id,
        tarif_ids: (e.postes || []).map((p: any) => p.tarif_id).filter(Boolean),
      }))
      .filter(e => e.classe_id)

    const { data: rpcData, error: rpcErr } = await s.rpc('soumettre_contrat_famille', {
      p_contrat_id: contrat?.id || null,
      p_famille_id: familleId,
      p_annee: anneeInscription,
      p_enfants: enfantsPayload,
      p_mode_paiement: modeReglement,
      p_options: {
        assurance_ecole: assuranceEcole,
        autorisation_image: autorisationImage,
        caution_acceptee: cautionAcceptee,
        observations: observations || null,
        signature_url: sigUrl,
        nb_echeances: nbEcheances,
        jour_echeance: dateEncaissement,
        sepa: modeReglement === 'sepa' ? {
          iban: nettoyerIban(sepaIban),
          bic: sepaBic.trim().toUpperCase(),
          titulaire: sepaTitulaire.trim(),
          rib_url: sepaRibUploaded?.url || null,
        } : null,
      },
    })

    if (rpcErr || !rpcData) {
      setSaving(false)
      await appAlert(t('portail.contrat.err.submit', { msg: rpcErr?.message || t('portail.common.err.unknown') }))
      return
    }

    // Le serveur fait foi : si son total recalculé diffère de l'affichage local
    // (tarif modifié entre-temps, manipulation...), on affiche le total serveur.
    const totalServeur = Number((rpcData as any)?.montant_total)
    if (Number.isFinite(totalServeur) && Math.abs(totalServeur - totalAnnuel) > 0.01) {
      await appAlert(t('portail.contrat.total_recalcule', { total: totalServeur.toLocaleString('fr-FR') },
        "Le montant total a été recalculé par l'établissement : {total} €. C'est ce montant qui figure sur votre contrat."))
    }

    // Notification email aux admins (best-effort)
    try {
      // FIX secu 27/07 : notify-admin exige désormais un Bearer token
      const { data: { session } } = await s.auth.getSession()
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ ecole_id: ecoleId, famille_id: familleId, type: 'contrat_soumis' }),
      })
    } catch {}

    dirtyRef.current = false // soumis : plus d'avertissement à la fermeture
    setSaving(false)
    router.push('/portail/inscriptions')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading_dots')}</div>

  if (!parent.estPrincipal) return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>{t('portail.peda.restricted.title')}</h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>{t('portail.peda.restricted.body', { annee: anneeInscription })}</p>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ marginTop: 18, background: '#2563EB', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('portail.peda.back')}</button>
      </div>
    </div>
  )

  if (contrat?.statut === 'soumis' || contrat?.statut === 'valide') {
    // ── FIX P2-5 (audit portail parent 06/08) ──
    // Avant : un titre-statut « Contrat soumis » DOUBLÉ d'un badge de statut
    // (« envoyé » / « Validé »), et aucun détail. Désormais : un titre neutre,
    // UN SEUL badge (formatStatut → « Validé » pour un contrat validé), la date
    // de signature si disponible, et le détail par enfant (postes + montants,
    // repris de contrat_enfants.postes tels qu'enregistrés par le serveur).
    // NB : pas de page d'impression du contrat côté parent à ce jour (la seule
    // impression existante est le contrat papier semi-vierge côté admin).
    const st = formatStatut(contrat.statut)
    const lignesEnfants: any[] = (contrat.contrat_enfants as any[]) || []
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>{t('portail.peda.back')}</button>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>{t('portail.contrat.valide.title', { annee: anneeInscription })}</h2>
        <span style={{ fontSize: 14, fontWeight: 700, color: st.color, background: st.bg, padding: '8px 20px', borderRadius: 20, display: 'inline-block', marginTop: 12 }}>{st.label}</span>
        {contrat.signature_date && (
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>
            {t('portail.contrat.valide.signe_le', { date: fmtDate(contrat.signature_date, lang) })}
          </div>
        )}

        {/* Détail par enfant : classe, postes et montants */}
        {lignesEnfants.length > 0 && (
          <div style={{ marginTop: 24, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', textAlign: 'left' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
              {t('portail.contrat.valide.enfants_heading')}
            </div>
            {lignesEnfants.map((ce: any) => {
              const enfant = enfants.find((en: any) => en.id === ce.enfant_id)
              const postes: any[] = Array.isArray(ce.postes) ? ce.postes : []
              return (
                <div key={ce.enfant_id || ce.id} style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
                      {enfant ? `${enfant.prenom} ${enfant.nom}` : '—'}
                      {ce.classe_prevue && <span style={{ fontWeight: 500, color: '#64748B' }}> — {ce.classe_prevue}</span>}
                    </div>
                    {ce.sous_total != null && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{Number(ce.sous_total).toLocaleString('fr-FR')} €</div>
                    )}
                  </div>
                  {postes.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {postes.map((p: any, i: number) => (
                        <div key={p.tarif_id || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
                          <span>{p.nom}</span>
                          <span style={{ fontWeight: 600 }}>{(parseFloat(p.montant) || 0).toLocaleString('fr-FR')} €</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 16, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: '#64748B' }}>{t('portail.contrat.total_annuel')}</span>
            <span style={{ fontWeight: 700 }}>{contrat.montant_total?.toLocaleString('fr-FR')} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#64748B' }}>{t('portail.contrat.submitted.reglement')}</span>
            <span style={{ fontWeight: 600 }}>{labelModePaiement(contrat.mode_reglement)} — {t('portail.contrat.echeances_count', { n: contrat.nb_echeances })}</span>
          </div>
        </div>
      </div>
    )
  }

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }
  const nouvelEnfantEnAttente = enfants.some((e: any) => e.statut_inscription === 'en_attente')

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px 100px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>{t('portail.peda.back')}</button>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.contrat.title', { annee: anneeInscription })}</h1>
      </div>

      {/* ── VERROU NOUVEL ENFANT EN ATTENTE ── */}
      {nouvelEnfantEnAttente && (
        <div style={{ background: '#FFFBEB', border: '2px solid #FDE68A', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⏳</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>{t('portail.contrat.pending_child.title')}</div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>
              {t('portail.contrat.pending_child.body')}
            </div>
          </div>
        </div>
      )}

      {/* ── ALERTE DDR ── */}
      {ddrStatut && ddrStatut !== 'accepte' && (
        <div style={{ background: '#FEF2F2', border: '2px solid #FECACA', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#DC2626', marginBottom: 4 }}>{t('portail.contrat.ddr_alert.title')}</div>
            <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.contrat.ddr_alert.body', { statut: formatStatut(ddrStatut).label }) }} />
          </div>
        </div>
      )}

      {/* ── INFOS FAMILLE ── */}
      <Section title={t('portail.contrat.section.infos')}>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{t('portail.common.verify_correct')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.contrat.field.prenom1')}</label><input style={inp} value={famForm.parent1_prenom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_prenom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.contrat.field.nom1')}</label><input style={inp} value={famForm.parent1_nom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_nom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.contrat.field.adresse')}</label><input style={inp} value={famForm.parent1_adresse || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_adresse: e.target.value })); setFamModified(true) }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <div><label style={lbl}>{t('portail.contrat.field.cp')}</label><input style={inp} value={famForm.parent1_code_postal || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_code_postal: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>{t('portail.contrat.field.ville')}</label><input style={inp} value={famForm.parent1_ville || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_ville: e.target.value })); setFamModified(true) }} /></div>
          </div>
          <div><label style={lbl}>{t('portail.contrat.field.portable')}</label><input style={inp} value={famForm.parent1_telephone || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_telephone: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.contrat.field.email')}</label><input style={inp} type="email" value={famForm.parent1_email || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_email: e.target.value })); setFamModified(true) }} /></div>
          {(famForm.parent2_prenom || famForm.parent2_nom) && <>
            <div><label style={lbl}>{t('portail.contrat.field.prenom2')}</label><input style={inp} value={famForm.parent2_prenom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_prenom: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>{t('portail.contrat.field.nom2')}</label><input style={inp} value={famForm.parent2_nom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_nom: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>{t('portail.contrat.field.portable2')}</label><input style={inp} value={famForm.parent2_telephone || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_telephone: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>{t('portail.contrat.field.email2')}</label><input style={inp} type="email" value={famForm.parent2_email || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_email: e.target.value })); setFamModified(true) }} /></div>
          </>}
        </div>
      </Section>

      {/* ── ENFANTS ── */}
      <Section title={t('portail.contrat.section.enfants')}>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
          {t('portail.contrat.enfants.intro', { annee: anneeInscription })}
        </div>
        {enfants.map((enfant: any) => {
          const enf = enfantsContrat.find(e => e.enfant_id === enfant.id) || { classe_id: '', postes: [], sous_total: 0 }
          const isSelected = enfantsContrat.some(e => e.enfant_id === enfant.id)
          const classeImposee = classesImposees[enfant.id] || null
          const cls = classes.find((c: any) => c.id === enf.classe_id)
          const tarifsDispos = getTarifsForSecteur(cls?.secteur_id || '')
          const adm = admissions[enfant.id]
          // RÈGLE (a) D'AVI (audit portail parent 06/08) : toute fiche pédagogique
          // de l'année NON validée bloque l'enfant (soumis, en_etude, brouillon…).
          // Pas de fiche = enfant historique en réinscription → sélectionnable.
          const refuseAdm = adm === 'refuse'
          const enAttenteAdm = !!adm && !refuseAdm && adm !== 'accepte' && adm !== 'valide'
          const peutReinscrire = !enAttenteAdm && !refuseAdm
          return (
            <div key={enfant.id} style={{ border: `2px solid ${isSelected ? '#2563EB' : enAttenteAdm ? '#FDE68A' : '#E2E8F0'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s', opacity: peutReinscrire ? 1 : 0.85 }}>
              <div style={{ padding: '12px 16px', background: isSelected ? '#EFF6FF' : enAttenteAdm ? '#FFFBEB' : '#F8FAFC', display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="checkbox" checked={isSelected} disabled={!peutReinscrire} onChange={() => peutReinscrire && toggleEnfantContrat(enfant.id)} style={{ width: 18, height: 18, cursor: peutReinscrire ? 'pointer' : 'not-allowed', accentColor: '#2563EB', flexShrink: 0 }} />
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{enfant.prenom?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                    {enAttenteAdm && (
                      <span style={{ background: '#FFFBEB', color: '#9A3412', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{t('portail.contrat.badge.adm_pending')}</span>
                    )}
                    {refuseAdm && (
                      <span style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{t('portail.contrat.badge.adm_refused')}</span>
                    )}
                  </div>
                  {enAttenteAdm && (
                    // RÈGLE (a) audit 06/08 : message explicite avec le prénom de l'enfant
                    <div style={{ fontSize: 11, color: '#9A3412', marginTop: 3 }}>{t('portail.contrat.adm_pending_hint', { prenom: enfant.prenom })}</div>
                  )}
                  {!enAttenteAdm && !refuseAdm && enfant.classes?.nom && <div style={{ fontSize: 11, color: '#94A3B8' }}>{t('portail.common.current_class', { classe: enfant.classes.nom })}</div>}
                </div>
                {enf.sous_total > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{enf.sous_total.toLocaleString('fr-FR')} €</div>}
              </div>
              {isSelected && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {classeImposee ? (
                    // Classe N+1 attribuée par l'établissement : lecture seule.
                    <div>
                      <label style={lbl}>{t('portail.contrat.field.classe_attribuee', { annee: anneeInscription }, 'Classe pour {annee}')}</label>
                      <div style={{ ...inp, background: '#F1F5F9', borderColor: '#CBD5E1', color: '#1E293B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flexShrink: 0 }}>🔒</span>
                        <span>{classeImposee.classe_nom}{classeImposee.secteur_nom ? ` — ${classeImposee.secteur_nom}` : ''}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 6, lineHeight: 1.5 }}>
                        {t('portail.contrat.classe_attribuee_note', { annee: anneeInscription },
                          "Classe attribuée par l'école pour {annee}. Pour toute demande de changement, contactez le secrétariat.")}
                        {classeImposee.source === 'passage_calcule' && (
                          <> {t('portail.contrat.classe_attribuee_a_confirmer',
                            "Elle découle du passage de classe et sera confirmée par l'école.")}</>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label style={lbl}>{t('portail.contrat.field.classe_souhaitee', { annee: anneeInscription })}</label>
                      <select style={inp} value={enf.classe_id || ''} onChange={e => setEnfantClasse(enfant.id, e.target.value)}>
                        <option value="">{t('portail.contrat.choose_class')}</option>
                        {classes.map((c: any) => <option key={c.id} value={c.id}>{c.nom}{c.secteurs?.nom ? ` — ${c.secteurs.nom}` : ''}</option>)}
                      </select>
                    </div>
                  )}
                  {enf.classe_id && tarifsDispos.length > 0 && (
                    <div>
                      <label style={lbl}>{t('portail.contrat.prestations')}</label>
                      {(() => {
                        const groupesAvecHint = new Set(
                          tarifsDispos
                            .filter((tf: any) => tf.groupe_exclusif)
                            .map((tf: any) => tf.groupe_exclusif)
                            .filter((g: string, _i: number, arr: string[]) => arr.filter(x => x === g).length > 1)
                        )
                        const groupesAffiches = new Set<string>()
                        return tarifsDispos.map((tf: any) => {
                          const sel = enf.postes?.find((p: any) => p.tarif_id === tf.id)
                          const hintAAfficher = tf.groupe_exclusif && groupesAvecHint.has(tf.groupe_exclusif) && !groupesAffiches.has(tf.groupe_exclusif)
                          if (hintAAfficher) groupesAffiches.add(tf.groupe_exclusif)
                          const pl = placesMap.get(tf.id)
                          const estComplet = !!pl?.complet && !sel
                          const placesRestantes = pl && pl.places_max != null && !pl.complet ? pl.places_max - pl.nb_inscrits : null
                          return (
                            <div key={tf.id}>
                              {hintAAfficher && (
                                <div style={{ fontSize: 11, color: '#7C3AED', background: '#EDE9FE', borderRadius: 6, padding: '4px 10px', marginBottom: 4, display: 'inline-block' }}>
                                  {t('portail.contrat.exclusive_hint', { groupe: tf.groupe_exclusif })}
                                </div>
                              )}
                              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: tf.obligatoire || estComplet ? 'default' : 'pointer', background: estComplet ? '#F8FAFC' : sel ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${sel ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 6, opacity: estComplet ? 0.6 : 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input type="checkbox" checked={!!sel || tf.obligatoire} disabled={tf.obligatoire || estComplet} onChange={() => !tf.obligatoire && togglePoste(enfant.id, tf)} />
                                  <span style={{ fontSize: 13 }}>
                                    {tf.nom_poste}
                                    {tf.obligatoire && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6 }}>{t('portail.contrat.included')}</span>}
                                    {estComplet && <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: 5, padding: '2px 6px', marginLeft: 6 }}>{t('portail.contrat.full')}</span>}
                                    {placesRestantes != null && placesRestantes <= 5 && <span style={{ fontSize: 10, fontWeight: 600, color: '#9A3412', marginLeft: 6 }}>{placesRestantes > 1 ? t('portail.contrat.places_left_many', { n: placesRestantes }) : t('portail.contrat.places_left_one', { n: placesRestantes })}</span>}
                                  </span>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0 }}>{(parseFloat(tf.montant) || 0).toLocaleString('fr-FR')} €</span>
                              </label>
                            </div>
                          )
                        })
                      })()}
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
        <Section title={t('portail.contrat.section.assurance')}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
            <input type="radio" checked={assuranceEcole} onChange={() => { ks(); setAssuranceEcole(true) }} />
            <div>{t('portail.contrat.assurance.ecole')}
              <span style={{ fontWeight: 700, color: '#059669', marginLeft: 8 }}>{montantAssuranceAnnuel} € × {nbEnfantsAvecClasse} = {totalAssurance} €</span>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: !assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${!assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
            <input type="radio" checked={!assuranceEcole} onChange={() => { ks(); setAssuranceEcole(false) }} />
            {t('portail.contrat.assurance.perso', { annee: anneeInscription })}
          </label>
        </Section>
      )}

      {/* ── TOTAL ── */}
      <div style={{ background: '#1E293B', borderRadius: 14, padding: 24, color: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 16, letterSpacing: '0.06em' }}>{t('portail.contrat.recap')}</div>
        {enfantsContrat.filter(e => e.sous_total > 0).map(e => {
          const enfant = enfants.find((en: any) => en.id === e.enfant_id)
          return <div key={e.enfant_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
            <span>{enfant?.prenom} — {e.classe_nom}</span><span>{e.sous_total.toLocaleString('fr-FR')} €</span>
          </div>
        })}
        {reductionFN > 0 && !reductionAccordee && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#34D399' }}><span>{t('portail.contrat.recap.reduction_fn')}</span><span>- {reductionFN.toLocaleString('fr-FR')} €</span></div>}
        {reductionAccordee && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#34D399' }}><span>{t('portail.contrat.recap.tarif_accorde')}</span><span>{parseFloat(reductionAccordee.tarif_accorde).toLocaleString('fr-FR')} €</span></div>}
        {reductionAccordee && totalOptionsHorsReduction > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#94A3B8' }}><span>{t('portail.contrat.recap.options')}</span><span>+ {totalOptionsHorsReduction.toLocaleString('fr-FR')} €</span></div>}
        {assuranceEcole && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}><span>{t('portail.contrat.recap.assurance')}</span><span>{totalAssurance} €</span></div>}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
          <span>{t('portail.contrat.total_annuel')}</span><span style={{ color: '#60A5FA' }}>{totalAnnuel.toLocaleString('fr-FR')} €</span>
        </div>
      </div>

      {/* ── RÈGLEMENT ── */}
      <Section title={t('portail.contrat.section.reglement')}>
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
                      <div><strong>{t('portail.contrat.cheque_order')}</strong> {m.config.ordre_cheque}</div>
                    )}
                    {m.config.iban && (
                      <div>
                        <strong>{t('portail.contrat.iban_benef')}</strong> <span style={{ fontFamily: 'monospace' }}>{m.config.iban}</span>
                        {m.config.bic && <> · <strong>{t('portail.contrat.bic_label')}</strong> {m.config.bic}</>}
                        {m.config.titulaire && <> · <strong>{t('portail.contrat.titulaire_label')}</strong> {m.config.titulaire}</>}
                      </div>
                    )}
                    {m.config.conditions && (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.config.conditions}</div>
                    )}
                  </div>
                )}

                {/* Nb échéances */}
                <div>
                  <label style={lbl}>{t('portail.contrat.nb_echeances')}</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Array.from({ length: maxEch - minEch + 1 }, (_, i) => minEch + i).map(n => (
                      <button key={n} onClick={() => { ks(); setNbEcheances(n) }}
                        style={{ width: 44, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: nbEcheances === n ? 700 : 400, background: nbEcheances === n ? '#2563EB' : '#F1F5F9', color: nbEcheances === n ? '#fff' : '#475569' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {nbEcheances > 1 && <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }} dangerouslySetInnerHTML={{ __html: t('portail.contrat.echeance_detail', { montant: montantEcheance.toLocaleString('fr-FR'), n: nbEcheances, type: m.type === 'cheque' ? t('portail.contrat.type.cheques') : t('portail.contrat.type.prelevements') }) }} />}
                </div>

                {/* Date encaissement */}
                {datesEncaissement.length > 0 && (
                  <div>
                    <label style={lbl}>{t('portail.contrat.date_encaissement')}</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {datesEncaissement.map((d: any) => (
                        <button key={d.id} onClick={() => { ks(); setDateEncaissement(d.jour_du_mois) }}
                          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: dateEncaissement === d.jour_du_mois ? 600 : 400, background: dateEncaissement === d.jour_du_mois ? '#2563EB' : '#F1F5F9', color: dateEncaissement === d.jour_du_mois ? '#fff' : '#475569' }}>
                          {d.label || t('portail.contrat.day_of_month', { jour: d.jour_du_mois })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mandat SEPA */}
                {m.type === 'sepa' && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
                      {mandatExistant ? t('portail.contrat.sepa.existing') : t('portail.contrat.sepa.new')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={lbl}>{t('portail.contrat.sepa.iban')}</label>
                        <input
                          style={{ ...inp, fontFamily: 'monospace', borderColor: sepaIban && !validerIban(sepaIban) ? '#FCA5A5' : '#E2E8F0' }}
                          value={sepaIban}
                          onChange={e => { ks(); setSepaIban(formaterIban(e.target.value)) }}
                          inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={42}
                          placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
                        {sepaIban && !validerIban(sepaIban) && (
                          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>
                            {t('portail.contrat.err.iban_invalide_hint', 'IBAN invalide — vérifiez les caractères saisis (2 lettres pays + 2 chiffres de clé + numéro de compte).')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={lbl}>{t('portail.contrat.sepa.bic')}</label>
                          <input
                            style={{ ...inp, borderColor: sepaBic && !validerBic(sepaBic) ? '#FCA5A5' : '#E2E8F0' }}
                            value={sepaBic}
                            onChange={e => { ks(); setSepaBic(e.target.value.toUpperCase()) }}
                            inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={11}
                            placeholder="BNPAFRPP" />
                          {sepaBic && !validerBic(sepaBic) && (
                            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>
                              {t('portail.contrat.err.bic_invalide_hint', 'BIC invalide (8 ou 11 caractères).')}
                            </div>
                          )}
                        </div>
                        <div><label style={lbl}>{t('portail.contrat.sepa.titulaire')}</label><input style={inp} value={sepaTitulaire} onChange={e => { ks(); setSepaTitulaire(e.target.value) }} /></div>
                      </div>
                      <div>
                        <label style={lbl}>{t('portail.contrat.sepa.rib')}</label>
                        <input ref={ribRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadRib(f) }} />
                        {sepaRibUploaded ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>✓ {sepaRibUploaded.nom_fichier}</span>
                            <button onClick={() => ribRef.current?.click()} style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>{t('portail.contrat.sepa.replace')}</button>
                          </div>
                        ) : (
                          <button onClick={() => ribRef.current?.click()} disabled={uploadingRib}
                            style={{ fontSize: 12, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
                            {uploadingRib ? t('portail.common.uploading') : t('portail.contrat.sepa.attach')}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                        <strong>{t('portail.contrat.sepa.creancier')}</strong> {ecoleInfo?.nom_creancier || ecoleInfo?.nom || t('portail.contrat.sepa.etablissement_fallback')}{ecoleInfo?.ics_sepa ? t('portail.contrat.sepa.ics', { ics: ecoleInfo.ics_sepa }) : ''}<br />
                        {t('portail.contrat.sepa.authorize', { nom: ecoleInfo?.nom_creancier || ecoleInfo?.nom || t('portail.contrat.sepa.etablissement_fallback') })}
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
      <Section title={t('portail.contrat.section.autorisations')}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
          <input type="checkbox" checked={autorisationImage} onChange={e => { ks(); setAutorisationImage(e.target.checked) }} style={{ marginTop: 2, flexShrink: 0, accentColor: '#2563EB' }} />
          {t('portail.contrat.image_auth', { nom: ecoleInfo?.nom || t('portail.contrat.institution_fallback') })}
        </label>
        <div>
          <label style={lbl}>{t('portail.contrat.observations')}</label>
          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={observations} onChange={e => { ks(); setObservations(e.target.value) }} placeholder={t('portail.contrat.observations_ph')} />
        </div>
      </Section>

      {/* ── ENGAGEMENT + SIGNATURE ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>{t('portail.contrat.engagement.title')}</div>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', padding: '14px 18px', fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 16 }}>
          <span dangerouslySetInnerHTML={{ __html: t('portail.contrat.engagement.intro', { parent: `${famForm.parent1_prenom} ${famForm.parent1_nom}`, annee: anneeInscription }) }} />{' '}{totalAnnuel > 0 ? <span dangerouslySetInnerHTML={{ __html: t('portail.contrat.engagement.somme', { total: totalAnnuel.toLocaleString('fr-FR') }) }} /> : <span style={{ color: '#92400E' }}>{t('portail.contrat.engagement.no_total')}</span>}
        </div>

        <label style={lbl}>{t('portail.contrat.signature')}</label>
        <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 8px' }}>{t('portail.contrat.signature_hint')}</p>
        <div style={{ border: `2px solid ${signatureData ? '#10B981' : '#E2E8F0'}`, borderRadius: 10, overflow: 'hidden', background: '#fff', touchAction: 'none' }}>
          <canvas ref={canvasRef} width={600} height={150}
            style={{ display: 'block', width: '100%', cursor: 'crosshair' }}
            onMouseDown={startSign} onMouseMove={drawSign} onMouseUp={stopSign} onMouseLeave={stopSign}
            onTouchStart={startSign} onTouchMove={drawSign} onTouchEnd={stopSign} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button onClick={clearSign} style={{ fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>{t('portail.common.signature.clear')}</button>
          {signatureData && <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>{t('portail.common.signature.saved')}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>{t('portail.common.cancel')}</button>
        <button onClick={soumettre} disabled={saving || nouvelEnfantEnAttente} style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (saving || nouvelEnfantEnAttente) ? 'not-allowed' : 'pointer', opacity: (saving || nouvelEnfantEnAttente) ? 0.7 : 1 }}>
          {saving ? t('portail.common.sending') : t('portail.contrat.submit')}
        </button>
      </div>
    </div>
  )
}
