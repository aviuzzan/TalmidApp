'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatStatut } from '@/lib/inscriptions'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { useI18n } from '@/lib/i18n'

// IMPORTANT : Section est défini AU NIVEAU MODULE (hors du composant page).
// Si on le définit dans le composant, à chaque render React voit une nouvelle
// fonction et démonte/remonte tout le formulaire → focus perdu → scroll vers le haut.
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
    {children}
  </div>
)

// Rendu d'une question custom (configurable par l'admin dans Paramètres > Demande de réduction).
// Défini au niveau module pour la même raison que Section (éviter le remount).
const CUSTOM_INP: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const CUSTOM_LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
function CustomQuestionField({ q, value, onChange }: { q: any; value: any; onChange: (v: any) => void }) {
  const { t } = useI18n()
  const labelWithReq = q.label + (q.obligatoire ? ' *' : '')
  const opts: string[] = Array.isArray(q.options) ? q.options : []
  if (q.type === 'select') {
    return (
      <div>
        <label style={CUSTOM_LBL}>{labelWithReq}</label>
        <select style={CUSTOM_INP} value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">{t('portail.reduction.choose')}</option>
          {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
        {q.aide && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{q.aide}</div>}
      </div>
    )
  }
  if (q.type === 'checkbox') {
    // Si options : groupe de cases à cocher (multi). Sinon : case unique oui/non.
    if (opts.length > 0) {
      const selected: string[] = Array.isArray(value) ? value : []
      const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])
      return (
        <div>
          <label style={CUSTOM_LBL}>{labelWithReq}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opts.map((o: string) => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} style={{ width: 15, height: 15, accentColor: '#2563EB' }} />
                {o}
              </label>
            ))}
          </div>
          {q.aide && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{q.aide}</div>}
        </div>
      )
    }
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
        {labelWithReq}
      </label>
    )
  }
  if (q.type === 'textarea') {
    return (
      <div>
        <label style={CUSTOM_LBL}>{labelWithReq}</label>
        <textarea style={{ ...CUSTOM_INP, resize: 'vertical', minHeight: 70 }} rows={3} value={value ?? ''} onChange={e => onChange(e.target.value)} />
        {q.aide && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{q.aide}</div>}
      </div>
    )
  }
  // number / text / date
  return (
    <div>
      <label style={CUSTOM_LBL}>{labelWithReq}</label>
      <input style={CUSTOM_INP} type={q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'} value={value ?? ''} onChange={e => onChange(e.target.value)} />
      {q.aide && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{q.aide}</div>}
    </div>
  )
}

export default function DemandeReductionPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const parent = useParentCtx()
  const { t } = useI18n()

  const [session, setSession] = useState<any>(null)
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Autosave brouillon ──
  // dirtyCounter s'incrémente à chaque modification (via ks()) ; savedCounter mémorise
  // le compteur au dernier enregistrement réussi. dirty > saved ⇒ modifications non sauvegardées.
  const [dirtyCounter, setDirtyCounter] = useState(0)
  const dirtyCounterRef = useRef(0)
  const savedCounterRef = useRef(0)
  const [lastSavedAt, setLastSavedAt] = useState('')
  const savingRef = useRef(false) // vrai pendant soumettre() : suspend l'autosave
  const famModifiedRef = useRef(false)
  const demandeIdRef = useRef('')
  const creatingDemandeRef = useRef<Promise<string | null> | null>(null)

  // ks() ("keystroke") : historiquement un no-op gardé pour compat avec les onChange existants
  // (le hack scroll précédent cassait la saisie). Depuis l'autosave (28/07), il marque le
  // formulaire comme modifié : déclenche le brouillon débounce (2s) + le garde beforeunload.
  const ks = () => { dirtyCounterRef.current += 1; setDirtyCounter(dirtyCounterRef.current) }

  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [eligible, setEligible] = useState<boolean | null>(null) // null = pas encore evalue
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [demande, setDemande] = useState<any>(null)
  const [docsConfig, setDocsConfig] = useState<any[]>([])
  const [docsUploaded, setDocsUploaded] = useState<Record<string, any>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // ── Infos famille ──
  const [famForm, setFamForm] = useState<any>({})
  const [famModified, setFamModified] = useState(false)
  const [situation, setSituation] = useState('marie')

  // ── Enfants dossier ──
  const [enfantsDossier, setEnfantsDossier] = useState<any[]>([])

  // ── Logement ──
  const [logType, setLogType] = useState('locataire')
  const [logPieces, setLogPieces] = useState('')
  const [logLoyer, setLogLoyer] = useState('')
  const [logCharges, setLogCharges] = useState('')
  const [logDateOccupation, setLogDateOccupation] = useState('')
  const [logHandicape, setLogHandicape] = useState(false)

  // ── Revenus ──
  const [revenus, setRevenus] = useState<any[]>([{ nom_prenom: '', lien_parente: '', employeur: '', qualification: '', salaire_mensuel_net: '', nb_mois: 12 }])
  const [artisanProfession, setArtisanProfession] = useState('')
  const [artisanRegime, setArtisanRegime] = useState('')
  const [artisanMontantAnnuel, setArtisanMontantAnnuel] = useState('')
  const [quotientFamilial, setQuotientFamilial] = useState('')

  // ── Allocations ──
  const [allocFamiliales, setAllocFamiliales] = useState('')
  const [allocChomage, setAllocChomage] = useState('')
  const [apl, setApl] = useState('')
  const [autresRevenus, setAutresRevenus] = useState('')
  const [aidesMensuelles, setAidesMensuelles] = useState('')

  // ── Autres enfants / charges ──
  const [enfantsAutres, setEnfantsAutres] = useState<any[]>([{ prenom: '', age: '', classe: '', etablissement: '', tarif_mensuel: '', nb_mois: 10 }])
  const [personnesCharge, setPersonnesCharge] = useState<any[]>([{ nom: '', prenom: '', age: '', lien_parente: '', montant_annuel_frais: '' }])

  // ── Documents ──
  const [pasDeJustificatif, setPasDeJustificatif] = useState(false)
  const [pasDeJustificatifDetail, setPasDeJustificatifDetail] = useState('')

  // ── Proposition ──
  const [tarifPropose, setTarifPropose] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [questionsConfig, setQuestionsConfig] = useState<any[]>([])
  const [reponsesCustom, setReponsesCustom] = useState<Record<string, any>>({})
  const qcfg = (cle: string) => questionsConfig.find((q: any) => q.cle === cle)
  const qActif = (cle: string) => { const q = qcfg(cle); return q ? q.actif !== false : true }
  const qL = (cle: string, fallback: string) => { const q = qcfg(cle); const t = q?.label || fallback; return t + (q?.obligatoire ? ' *' : '') }

  // Clés "système" gérées par les blocs prédéfinis (logement/revenus/allocations) — on ne les
  // re-render PAS dans la section custom pour éviter les doublons.
  const CLES_SYSTEME = new Set<string>([
    'logement_type', 'logement_nb_pieces', 'logement_loyer_mensuel', 'logement_charges_mensuelles',
    'logement_date_occupation', 'logement_personne_handicapee',
    'quotient_familial', 'salaire_mensuel_net', 'revenus_artisans_profession',
    'revenus_artisans_regime', 'revenus_artisans_montant_annuel',
    'alloc_familiales_mensuelles', 'alloc_chomage_mensuelle', 'apl_mensuelle',
    'autres_revenus_mensuels', 'aides_mensuelles',
  ])
  const questionsCustomActives = (section: string) =>
    questionsConfig.filter((q: any) => q.section === section && q.actif !== false && !CLES_SYSTEME.has(q.cle))

  // ── Attestation ──
  const [attestationLieu, setAttestationLieu] = useState('')
  const [signatureData, setSignatureData] = useState('')

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

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
      { data: fam }, { data: enf }, { data: cls }, { data: sec },
      { data: dem }, { data: docs }, { data: questions },
    ] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*, classes(id, nom, secteur_id, secteurs(nom))').eq('famille_id', profile.famille_id),
      s.from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('reduction_documents_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).eq('actif', true).order('ordre'),
      s.from('reduction_questions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).order('section').order('ordre'),
    ])

    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? []); setSecteurs(sec ?? [])
    setDocsConfig(docs ?? [])
    setQuestionsConfig(questions ?? [])
    if (fam) { setFamForm(fam); setSituation(fam.situation_maritale || 'marie') }

    // Check d'éligibilité DDR : toggle reductions_ouvertes + tranche famille dans liste éligible.
    // Si une demande existe déjà, on autorise pour qu'elle puisse être consultée/complétée.
    const { data: cfg } = await s
      .from('inscriptions_config')
      .select('reductions_ouvertes, tranches_eligibles_ddr, date_ouverture_reduction, date_cloture_reduction')
      .eq('ecole_id', profile.ecole_id)
      .eq('annee_scolaire', anneeInscription)
      .maybeSingle()
    const eligiblesT: string[] = (cfg as any)?.tranches_eligibles_ddr || []
    const trancheOK = fam?.tranche_id && eligiblesT.includes(fam.tranche_id)
    const today = new Date().toISOString().split('T')[0]
    const dateOK = cfg?.date_ouverture_reduction && cfg?.date_cloture_reduction
      ? (cfg.date_ouverture_reduction <= today && cfg.date_cloture_reduction >= today)
      : true
    const isEligible = !!cfg?.reductions_ouvertes && dateOK && !!trancheOK
    setEligible(isEligible || !!dem)

    if (dem) {
      setDemande(dem)
      demandeIdRef.current = dem.id
      setSituation(dem.situation_familiale || 'marie')
      setLogType(dem.logement_type || 'locataire')
      setLogPieces(dem.logement_nb_pieces?.toString() || '')
      setLogLoyer(dem.logement_loyer_mensuel?.toString() || '')
      setLogCharges(dem.logement_charges_mensuelles?.toString() || '')
      setLogDateOccupation(dem.logement_date_occupation || '')
      setLogHandicape(dem.logement_personne_handicapee || false)
      setQuotientFamilial(dem.quotient_familial?.toString() || '')
      setAllocFamiliales(dem.alloc_familiales_mensuelles?.toString() || '')
      setAllocChomage(dem.alloc_chomage_mensuelle?.toString() || '')
      setApl(dem.apl_mensuelle?.toString() || '')
      setAutresRevenus(dem.autres_revenus_mensuels?.toString() || '')
      setAidesMensuelles(dem.aides_mensuelles?.toString() || '')
      setArtisanProfession(dem.revenus_artisans_profession || '')
      setArtisanRegime(dem.revenus_artisans_regime || '')
      setArtisanMontantAnnuel(dem.revenus_artisans_montant_annuel?.toString() || '')
      setTarifPropose(dem.tarif_propose?.toString() || '')
      setCommentaire(dem.commentaire || '')
      setPasDeJustificatif(dem.pas_de_justificatif || false)
      setPasDeJustificatifDetail(dem.pas_de_justificatif_detail || '')
      setAttestationLieu(dem.attestation_lieu || '')
      if (dem.enfants_dossier?.length) setEnfantsDossier(dem.enfants_dossier)
      if (dem.enfants_autres_etablissements?.length) setEnfantsAutres(dem.enfants_autres_etablissements)
      if (dem.personnes_charge?.length) setPersonnesCharge(dem.personnes_charge)
      if (dem.reponses_custom && typeof dem.reponses_custom === 'object') setReponsesCustom(dem.reponses_custom)

      const { data: revs } = await s.from('demandes_reduction_revenus').select('*').eq('demande_id', dem.id)
      if (revs?.length) setRevenus(revs.map((r: any) => ({ ...r, salaire_mensuel_net: r.salaire_mensuel_net?.toString() || '' })))

      const { data: docsUp } = await s.from('reduction_documents_uploaded').select('*').eq('demande_id', dem.id)
      const m: Record<string, any> = {}
      docsUp?.forEach((d: any) => { m[d.config_id || d.label] = d })
      setDocsUploaded(m)
    }
    setLoading(false)
  }

  // ── Total revenus mensuel auto-calculé ──
  // FIX audit 28/07 : chaque salaire est pondéré par son nb_mois → (salaire × nb_mois) / 12.
  // Avant, un salaire perçu 6 mois/an comptait comme un salaire perçu 12 mois/an.
  // Les montants négatifs sont ramenés à 0 (la base a des CHECK >= 0). Arrondi à 2 décimales.
  const totalRevenusMensuel = () => {
    const salaires = revenus.reduce((sum, r) => {
      const salaire = Math.max(0, parseFloat(r.salaire_mensuel_net) || 0)
      const nbMois = Math.min(12, Math.max(1, Number(r.nb_mois) || 12))
      return sum + (salaire * nbMois) / 12
    }, 0)
    const artisan = artisanMontantAnnuel ? Math.max(0, parseFloat(artisanMontantAnnuel) || 0) / 12 : 0
    const total = salaires
      + Math.max(0, parseFloat(allocFamiliales) || 0)
      + Math.max(0, parseFloat(allocChomage) || 0)
      + Math.max(0, parseFloat(apl) || 0)
      + Math.max(0, parseFloat(autresRevenus) || 0)
      + Math.max(0, parseFloat(aidesMensuelles) || 0)
      + artisan
    return Math.round(total * 100) / 100
  }

  // ── Autosave brouillon ──
  // Champs "simples" de demandes_reduction — source unique partagée par l'autosave ET la soumission.
  // Choix documenté : les lignes de revenus (table demandes_reduction_revenus) ne sont écrites qu'à
  // la soumission — un delete+insert à chaque autosave serait risqué (perte de données si échec à
  // mi-chemin). Idem pour les infos famille (table familles), écrites uniquement à la soumission.
  function buildDraftFields() {
    // Montants financiers : négatifs ramenés à 0 (CHECK >= 0 en base).
    const num = (v: string): number | null => {
      if (!v) return null
      const n = parseFloat(v)
      return isNaN(n) ? null : Math.max(0, n)
    }
    // Montants stockés en texte dans les tableaux JSON : clamp à 0 en préservant le type string.
    const clampStr = (v: any) => { const n = parseFloat(v); return isNaN(n) ? v : String(Math.max(0, n)) }
    return {
      situation_familiale: situation,
      logement_type: logType,
      logement_nb_pieces: logPieces ? parseInt(logPieces) : null,
      logement_loyer_mensuel: num(logLoyer),
      logement_charges_mensuelles: num(logCharges),
      logement_date_occupation: logDateOccupation || null,
      logement_personne_handicapee: logHandicape,
      quotient_familial: num(quotientFamilial),
      alloc_familiales_mensuelles: num(allocFamiliales),
      alloc_chomage_mensuelle: num(allocChomage),
      apl_mensuelle: num(apl),
      autres_revenus_mensuels: num(autresRevenus),
      aides_mensuelles: num(aidesMensuelles),
      revenus_artisans_profession: artisanProfession || null,
      revenus_artisans_regime: artisanRegime || null,
      revenus_artisans_montant_annuel: num(artisanMontantAnnuel),
      revenus_total_mensuel: totalRevenusMensuel(),
      tarif_propose: num(tarifPropose),
      nb_enfants_concernes: enfantsDossier.length,
      enfants_dossier: enfantsDossier,
      enfants_autres_etablissements: enfantsAutres
        .filter((e: any) => e.prenom || e.etablissement)
        .map((e: any) => ({ ...e, tarif_mensuel: clampStr(e.tarif_mensuel) })),
      personnes_charge: personnesCharge
        .filter((p: any) => p.nom || p.prenom)
        .map((p: any) => ({ ...p, montant_annuel_frais: clampStr(p.montant_annuel_frais) })),
      pas_de_justificatif: pasDeJustificatif,
      pas_de_justificatif_detail: pasDeJustificatifDetail || null,
      commentaire: commentaire || null,
      attestation_lieu: attestationLieu || null,
      reponses_custom: reponsesCustom,
    }
  }

  // Crée (une seule fois, même en cas d'appels concurrents autosave/upload) la demande en 'brouillon'.
  async function ensureDemandeBrouillon(): Promise<string | null> {
    if (demandeIdRef.current) return demandeIdRef.current
    if (demande?.id) { demandeIdRef.current = demande.id; return demande.id }
    if (creatingDemandeRef.current) return creatingDemandeRef.current
    creatingDemandeRef.current = (async () => {
      const s = createClient()
      const { data: nd, error } = await s.from('demandes_reduction').insert({
        famille_id: familleId, ecole_id: ecoleId, annee_scolaire: anneeInscription, statut: 'brouillon',
      }).select().single()
      creatingDemandeRef.current = null
      if (error || !nd) return null
      demandeIdRef.current = nd.id
      setDemande(nd)
      return nd.id as string
    })()
    return creatingDemandeRef.current
  }

  async function autosaveDraft(snapshot: number) {
    if (savingRef.current) return // soumission en cours : ne pas interférer
    if (demande && demande.statut !== 'brouillon') return // ne JAMAIS toucher une demande non-brouillon
    if (!familleId || !ecoleId) return
    const id = await ensureDemandeBrouillon()
    if (!id || savingRef.current) return
    const s = createClient()
    // Garde-fou : .eq('statut', 'brouillon') — l'update ne matche que si la demande est encore en
    // brouillon côté base (compatible avec la policy RLS UPDATE parent : statut IN (brouillon, soumis)).
    const { error } = await s.from('demandes_reduction')
      .update(buildDraftFields())
      .eq('id', id)
      .eq('statut', 'brouillon')
    if (!error) {
      savedCounterRef.current = Math.max(savedCounterRef.current, snapshot)
      setLastSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    }
  }

  // Débounce ~2s : chaque modification (ks) réarme le timer ; à l'expiration on upsert le brouillon.
  useEffect(() => {
    if (dirtyCounter === 0 || dirtyCounter <= savedCounterRef.current) return
    if (loading || saving) return
    if (demande && demande.statut !== 'brouillon') return
    if (!familleId) return
    const snapshot = dirtyCounter
    const timer = setTimeout(() => { autosaveDraft(snapshot) }, 2000)
    return () => clearTimeout(timer)
  }, [dirtyCounter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Garde beforeunload : modifications pas encore autosauvegardées, ou infos famille (persistées
  // uniquement à la soumission).
  useEffect(() => { famModifiedRef.current = famModified }, [famModified])
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyCounterRef.current > savedCounterRef.current || famModifiedRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ── Enfants dossier ──
  const classesSorted = classes.map((c: any) => c.nom).sort()
  function getClasseSuivante(classeActuelle: string): string {
    const idx = classesSorted.indexOf(classeActuelle)
    return idx >= 0 && idx < classesSorted.length - 1 ? classesSorted[idx + 1] : classeActuelle
  }

  function toggleEnfant(enfantId: string, classeSuivante: string) {
    ks()
    setEnfantsDossier(prev => {
      const exists = prev.find((e: any) => e.enfant_id === enfantId)
      if (exists) return prev.filter((e: any) => e.enfant_id !== enfantId)
      return [...prev, { enfant_id: enfantId, classe_souhaitee: classeSuivante }]
    })
  }

  function setClasseEnfant(enfantId: string, classe: string) {
    ks(); setEnfantsDossier(prev => prev.map((e: any) => e.enfant_id === enfantId ? { ...e, classe_souhaitee: classe } : e))
  }

  const nbEnfantsTotal = enfantsDossier.length
  const nbParSecteur = () => {
    const map: Record<string, number> = {}
    enfantsDossier.forEach((ed: any) => {
      const cls = classes.find((c: any) => c.nom === ed.classe_souhaitee)
      const sec = secteurs.find((s: any) => s.id === cls?.secteur_id)
      if (sec) map[sec.nom] = (map[sec.nom] || 0) + 1
    })
    return map
  }

  // ── Signature canvas ──
  function initCanvas() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }
  useEffect(() => { initCanvas() }, [loading])

  function getCanvasPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: ((e as MouseEvent).clientX - rect.left) * scaleX, y: ((e as MouseEvent).clientY - rect.top) * scaleY }
  }

  function startSign(e: React.MouseEvent | React.TouchEvent) {
    isDrawing.current = true
    const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!
    const pos = getCanvasPos(e.nativeEvent as any, canvas)
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
  }

  function drawSign(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return; e.preventDefault()
    const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!
    const pos = getCanvasPos(e.nativeEvent as any, canvas)
    ctx.lineTo(pos.x, pos.y); ctx.stroke()
  }

  function stopSign() {
    isDrawing.current = false
    if (canvasRef.current) setSignatureData(canvasRef.current.toDataURL('image/png'))
  }

  function clearSign() {
    const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height); setSignatureData('')
  }

  // ── Upload documents ──
  async function uploadDoc(configId: string, label: string, file: File) {
    setUploading(p => ({ ...p, [configId]: true }))
    // Création du brouillon centralisée dans ensureDemandeBrouillon (partagée avec l'autosave,
    // protégée contre les créations concurrentes).
    const demandeIdActuel = await ensureDemandeBrouillon()
    const fd = new FormData()
    fd.append('file', file); fd.append('demandeId', demandeIdActuel || '')
    fd.append('familleId', familleId); fd.append('configId', configId); fd.append('label', label)
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: fd })
    const json = await res.json()
    if (json.success) setDocsUploaded(p => ({ ...p, [configId]: { url: json.url, nom_fichier: json.nom, taille_ko: json.taille_ko } }))
    setUploading(p => ({ ...p, [configId]: false }))
  }

  // ── Upload signature ──
  async function uploadSignature(dataUrl: string, demandeId: string): Promise<string> {
    if (!dataUrl) return ''
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], 'signature.png', { type: 'image/png' })
    const fd = new FormData()
    fd.append('file', file); fd.append('demandeId', demandeId)
    fd.append('familleId', familleId); fd.append('configId', 'signature'); fd.append('label', 'Signature')
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: fd })
    const json = await res.json()
    return json.url || ''
  }

  // ── Soumission ──
  async function soumettre() {
    if (enfantsDossier.length === 0) { alert(t('portail.reduction.err.select_child')); return }
    if (!tarifPropose) { alert(t('portail.reduction.err.tarif')); return }
    if (!attestationLieu) { alert(t('portail.reduction.err.lieu')); return }
    if (!signatureData) { alert(t('portail.reduction.err.sign')); return }

    // Validation des questions custom obligatoires
    const customManquantes = questionsConfig
      .filter((q: any) => q.actif !== false && q.obligatoire && !CLES_SYSTEME.has(q.cle))
      .filter((q: any) => {
        const v = reponsesCustom[q.cle]
        if (q.type === 'checkbox' && Array.isArray(q.options) && q.options.length > 0) return !Array.isArray(v) || v.length === 0
        if (q.type === 'checkbox') return v !== true
        return v === undefined || v === null || String(v).trim() === ''
      })
    if (customManquantes.length > 0) {
      alert(t('portail.reduction.err.custom_required') + '\n• ' + customManquantes.map((q: any) => q.label).join('\n• '))
      return
    }

    // Validation des documents obligatoires (sauf si la famille a coche "pas de justificatif")
    if (!pasDeJustificatif) {
      const docsManquants = (docsConfig || [])
        .filter((d: any) => d.actif !== false && d.obligatoire)
        .filter((d: any) => !docsUploaded[d.id])
      if (docsManquants.length > 0) {
        alert(t('portail.reduction.err.docs_required') + '\n• ' + docsManquants.map((d: any) => d.label).join('\n• ') + '\n\n' + t('portail.reduction.err.docs_required_hint'))
        return
      }
    } else if (!pasDeJustificatifDetail.trim()) {
      alert(t('portail.reduction.err.no_justif_detail'))
      return
    }

    savingRef.current = true // suspend l'autosave pendant la soumission
    setSaving(true)
    const s = createClient()

    if (famModified) {
      await s.from('familles').update({
        parent1_prenom: famForm.parent1_prenom, parent1_nom: famForm.parent1_nom,
        parent1_email: famForm.parent1_email, parent1_telephone: famForm.parent1_telephone,
        parent1_adresse: famForm.parent1_adresse, parent1_code_postal: famForm.parent1_code_postal,
        parent1_ville: famForm.parent1_ville, parent2_prenom: famForm.parent2_prenom,
        parent2_nom: famForm.parent2_nom, parent2_email: famForm.parent2_email,
        parent2_telephone: famForm.parent2_telephone, situation_maritale: situation,
      }).eq('id', familleId)
    }

    // Les champs du formulaire (dont revenus_total_mensuel recalculé avec pondération nb_mois et
    // les montants clampés >= 0) viennent de buildDraftFields — même source que l'autosave.
    const payload: any = {
      ...buildDraftFields(),
      famille_id: familleId, ecole_id: ecoleId, annee_scolaire: anneeInscription,
      statut: 'soumis', soumis_le: new Date().toISOString(),
      tarif_propose: Math.max(0, parseFloat(tarifPropose) || 0),
      attestation_honneur: true,
      attestation_lieu: attestationLieu,
      attestation_date: new Date().toISOString().split('T')[0],
      signature_date: new Date().toISOString(),
    }

    // demandeIdRef couvre le cas où le brouillon vient d'être créé par l'autosave/upload
    // et où l'état React `demande` n'est pas encore à jour.
    let demandeId = demande?.id || demandeIdRef.current || undefined
    if (demandeId) {
      const { data: upd, error: updErr } = await s.from('demandes_reduction').update(payload).eq('id', demandeId).select()
      if (updErr || !upd || upd.length === 0) {
        savingRef.current = false
        setSaving(false)
        alert(t('portail.reduction.err.submit', { msg: updErr?.message || t('portail.common.err.no_row') }))
        return
      }
      await s.from('demandes_reduction_revenus').delete().eq('demande_id', demandeId)
    } else {
      const { data: nd, error: insErr } = await s.from('demandes_reduction').insert(payload).select().single()
      if (insErr || !nd) {
        savingRef.current = false
        setSaving(false)
        alert(t('portail.reduction.err.create', { msg: insErr?.message || t('portail.common.err.unknown') }))
        return
      }
      demandeId = nd.id
      demandeIdRef.current = nd.id
    }

    if (demandeId) {
      const revsFiltres = revenus.filter((r: any) => r.nom_prenom?.trim())
      if (revsFiltres.length > 0) {
        await s.from('demandes_reduction_revenus').insert(
          revsFiltres.map((r: any) => ({
            ...r, demande_id: demandeId,
            salaire_mensuel_net: Math.max(0, parseFloat(r.salaire_mensuel_net) || 0),
            nb_mois: Math.min(12, Math.max(1, Number(r.nb_mois) || 12)),
          }))
        )
      }
      const sigUrl = await uploadSignature(signatureData, demandeId)
      if (sigUrl) await s.from('demandes_reduction').update({ signature_url: sigUrl }).eq('id', demandeId)
    }

    // Notification email aux admins (best-effort, n'empêche pas la soumission si erreur)
    try {
      // FIX secu 27/07 : notify-admin exige désormais un Bearer token
      const { data: { session } } = await s.auth.getSession()
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({ ecole_id: ecoleId, famille_id: familleId, type: 'ddr_soumis' }),
      })
    } catch {}

    // Tout est persisté : neutralise le garde beforeunload avant la navigation.
    savedCounterRef.current = dirtyCounterRef.current
    famModifiedRef.current = false
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

  // Famille non éligible (toggle off OU tranche pas dans la liste OU hors période) :
  // on redirige silencieusement vers le portail. Si une demande existe déjà, on autorise.
  if (eligible === false) {
    if (typeof window !== 'undefined') router.push('/portail/inscriptions')
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>{t('portail.reduction.redirecting')}</div>
  }

  // Cas spécifique : DDR refusée. Décision définitive pour l'année,
  // la famille ne peut PAS rééditer le formulaire ni resoumettre. Écran dédié.
  if (demande && demande.statut === 'refuse') {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>{t('portail.peda.back')}</button>
        <div style={{ fontSize: 48, marginBottom: 16, color: '#991B1B' }}>✕</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>{t('portail.reduction.refused.title')}</h2>
        <p style={{ color: '#64748B', fontSize: 14, margin: '8px 0 20px', lineHeight: 1.6 }}>
          {t('portail.reduction.refused.body', { annee: anneeInscription })}
        </p>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', padding: '8px 20px', borderRadius: 20 }}>{t('portail.reduction.refused.badge')}</span>
        <div style={{ marginTop: 28, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
          {t('portail.reduction.refused.contact')}
        </div>
        <button onClick={() => router.push('/portail/inscriptions/contrat')}
          style={{ marginTop: 20, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
          {t('portail.reduction.refused.goto_contract')}
        </button>
      </div>
    )
  }

  if (demande && ['soumis', 'en_etude', 'accepte'].includes(demande.statut)) {
    const st = formatStatut(demande.statut)
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>{t('portail.peda.back')}</button>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📨</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>{t('portail.reduction.submitted.title')}</h2>
        <p style={{ color: '#64748B', fontSize: 14, margin: '8px 0 20px' }}>{t('portail.reduction.submitted.body')}</p>
        <span style={{ fontSize: 14, fontWeight: 700, color: st.color, background: st.bg, padding: '8px 20px', borderRadius: 20 }}>{st.label}</span>
        {demande.tarif_accorde && (
          <div style={{ marginTop: 24, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>{t('portail.reduction.tarif_accorde')}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 4 }}>{parseFloat(demande.tarif_accorde).toLocaleString('fr-FR')} €</div>
          </div>
        )}
      </div>
    )
  }

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }

  const secteurCounts = nbParSecteur()
  const totalRev = totalRevenusMensuel()

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>{t('portail.peda.back')}</button>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.reduction.title', { annee: anneeInscription })}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>{t('portail.reduction.intro')}</p>
      </div>

      {/* ── 1. RESPONSABLE 1 ── */}
      <Section title={t('portail.reduction.section.resp1')}>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{t('portail.common.verify_correct')}</p>
        <div>
          <label style={lbl}>{t('portail.reduction.situation')}</label>
          <select style={inp} value={situation} onChange={e => { ks(); setSituation(e.target.value); setFamModified(true) }}>
            <option value="marie">{t('portail.reduction.situation.marie')}</option><option value="veuf">{t('portail.reduction.situation.veuf')}</option>
            <option value="divorce">{t('portail.reduction.situation.divorce')}</option><option value="autre">{t('portail.reduction.situation.autre')}</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.reduction.field.prenom')}</label><input style={inp} value={famForm.parent1_prenom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_prenom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.reduction.field.nom')}</label><input style={inp} value={famForm.parent1_nom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_nom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.reduction.field.adresse')}</label><input style={inp} value={famForm.parent1_adresse || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_adresse: e.target.value })); setFamModified(true) }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div><label style={lbl}>{t('portail.reduction.field.cp')}</label><input style={inp} value={famForm.parent1_code_postal || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_code_postal: e.target.value })); setFamModified(true) }} /></div>
            <div><label style={lbl}>{t('portail.reduction.field.ville')}</label><input style={inp} value={famForm.parent1_ville || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_ville: e.target.value })); setFamModified(true) }} /></div>
          </div>
          <div><label style={lbl}>{t('portail.reduction.field.tel')}</label><input style={inp} value={famForm.parent1_telephone || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_telephone: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.reduction.field.email')}</label><input style={inp} type="email" value={famForm.parent1_email || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent1_email: e.target.value })); setFamModified(true) }} /></div>
        </div>
      </Section>

      {/* ── 2. RESPONSABLE 2 ── */}
      <Section title={t('portail.reduction.section.resp2')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.reduction.field.prenom2')}</label><input style={inp} value={famForm.parent2_prenom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_prenom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.reduction.field.nom2')}</label><input style={inp} value={famForm.parent2_nom || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_nom: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.reduction.field.tel2')}</label><input style={inp} value={famForm.parent2_telephone || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_telephone: e.target.value })); setFamModified(true) }} /></div>
          <div><label style={lbl}>{t('portail.reduction.field.email2')}</label><input style={inp} type="email" value={famForm.parent2_email || ''} onChange={e => { ks(); setFamForm((p: any) => ({ ...p, parent2_email: e.target.value })); setFamModified(true) }} /></div>
        </div>
      </Section>

      {/* ── 3. ENFANTS ── */}
      <Section title={t('portail.reduction.section.enfants')}>
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t('portail.reduction.enfants.intro', { annee: anneeInscription })}</p>
        {enfants.map((enfant: any) => {
          const selected = enfantsDossier.find((e: any) => e.enfant_id === enfant.id)
          const classeSuivante = getClasseSuivante(enfant.classes?.nom || '')
          return (
            <div key={enfant.id} style={{ border: `2px solid ${selected ? '#2563EB' : '#E2E8F0'}`, borderRadius: 12, padding: 16, background: selected ? '#EFF6FF' : '#fff', transition: 'border-color 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="checkbox" checked={!!selected} onChange={() => toggleEnfant(enfant.id, classeSuivante)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2563EB', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                    {enfant.statut_inscription === 'en_attente' && (
                      <span style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>{t('portail.reduction.badge.pending')}</span>
                    )}
                  </div>
                  {enfant.classes?.nom && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t('portail.common.current_class', { classe: enfant.classes.nom })}</div>}
                </div>
              </div>
              {selected && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #BFDBFE' }}>
                  <label style={lbl}>{t('portail.reduction.field.classe_souhaitee')}</label>
                  <select style={inp} value={selected.classe_souhaitee || ''} onChange={e => setClasseEnfant(enfant.id, e.target.value)}>
                    <option value="">{t('portail.reduction.choose')}</option>
                    {classes.map((c: any) => <option key={c.id} value={c.nom}>{c.nom}{c.secteurs?.nom ? ` — ${c.secteurs.nom}` : ''}{c.nom === classeSuivante ? ' ★' : ''}</option>)}
                  </select>
                </div>
              )}
            </div>
          )
        })}
        {nbEnfantsTotal > 0 && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14, fontSize: 13 }}>
            <strong>{nbEnfantsTotal > 1 ? t('portail.reduction.count_many', { n: nbEnfantsTotal }) : t('portail.reduction.count_one', { n: nbEnfantsTotal })}</strong>
            {Object.entries(secteurCounts).map(([sec, nb]) => ' · ' + t('portail.reduction.par_secteur', { nb, secteur: sec }))}
          </div>
        )}
      </Section>

      {/* ── 4. LOGEMENT ── */}
      <Section title={t('portail.reduction.section.logement')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {qActif('logement_type') && <div><label style={lbl}>{qL('logement_type', t('portail.reduction.logement.type'))}</label>
            <select style={inp} value={logType} onChange={e => { ks(); setLogType(e.target.value) }}>
              <option value="locataire">{t('portail.reduction.logement.locataire')}</option><option value="proprietaire">{t('portail.reduction.logement.proprietaire')}</option><option value="autre">{t('portail.reduction.logement.autre')}</option>
            </select>
          </div>}
          {qActif('logement_nb_pieces') && <div><label style={lbl}>{qL('logement_nb_pieces', t('portail.reduction.logement.pieces'))}</label><input style={inp} type="number" value={logPieces} onChange={e => { ks(); setLogPieces(e.target.value) }} /></div>}
          {qActif('logement_loyer_mensuel') && <div><label style={lbl}>{qL('logement_loyer_mensuel', t('portail.reduction.logement.loyer'))}</label><input style={inp} type="number" min="0" value={logLoyer} onChange={e => { ks(); setLogLoyer(e.target.value) }} /></div>}
          {qActif('logement_charges_mensuelles') && <div><label style={lbl}>{qL('logement_charges_mensuelles', t('portail.reduction.logement.charges'))}</label><input style={inp} type="number" min="0" value={logCharges} onChange={e => { ks(); setLogCharges(e.target.value) }} /></div>}
          {qActif('logement_date_occupation') && <div><label style={lbl}>{qL('logement_date_occupation', t('portail.reduction.logement.depuis'))}</label><input style={inp} type="date" value={logDateOccupation} onChange={e => { ks(); setLogDateOccupation(e.target.value) }} /></div>}
        </div>
        {qActif('logement_personne_handicapee') && <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#475569' }}>
          <input type="checkbox" checked={logHandicape} onChange={e => { ks(); setLogHandicape(e.target.checked) }} style={{ width: 16, height: 16, accentColor: '#2563EB' }} />
          {qcfg('logement_personne_handicapee')?.label || t('portail.reduction.logement.handicap')}
        </label>}
        {questionsCustomActives('logement').length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 4 }}>
            {questionsCustomActives('logement').map((q: any) => (
              <CustomQuestionField key={q.id} q={q} value={reponsesCustom[q.cle]}
                onChange={v => { ks(); setReponsesCustom(p => ({ ...p, [q.cle]: v })) }} />
            ))}
          </div>
        )}
      </Section>

      {/* ── 5. REVENUS ── */}
      <Section title={t('portail.reduction.section.revenus')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {qActif('quotient_familial') && <div><label style={lbl}>{qL('quotient_familial', t('portail.reduction.quotient'))}</label><input style={inp} type="number" min="0" value={quotientFamilial} onChange={e => { ks(); setQuotientFamilial(e.target.value) }} /></div>}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{t('portail.reduction.revenus.detail')}</div>
          {revenus.map((r: any, i: number) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 7, marginBottom: 8, alignItems: 'end' }}>
              <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.nom')}</label><input style={inp} value={r.nom_prenom} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, nom_prenom: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.lien')}</label><input style={inp} value={r.lien_parente} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, lien_parente: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.employeur')}</label><input style={inp} value={r.employeur} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, employeur: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.qualif')}</label><input style={inp} value={r.qualification || ''} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, qualification: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.salaire')}</label><input style={inp} type="number" min="0" value={r.salaire_mensuel_net} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, salaire_mensuel_net: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.nb_mois')}</label><input style={inp} type="number" min="1" max="12" value={r.nb_mois} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, nb_mois: parseInt(e.target.value) || 12 } : x)) }} /></div>
              <div style={{ paddingBottom: 2 }}>{i > 0 && <button onClick={() => { ks(); setRevenus(p => p.filter((_, j) => j !== i)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 20, lineHeight: 1 }}>×</button>}</div>
            </div>
          ))}
          <button onClick={() => { ks(); setRevenus(p => [...p, { nom_prenom: '', lien_parente: '', employeur: '', qualification: '', salaire_mensuel_net: '', nb_mois: 12 }]) }}
            style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, marginTop: 4 }}>
            {t('portail.reduction.add_person')}
          </button>
        </div>

        {/* Artisans */}
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 12 }}>{t('portail.reduction.artisan.title')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            {qActif('revenus_artisans_profession') && <div><label style={lbl}>{qL('revenus_artisans_profession', t('portail.reduction.artisan.profession'))}</label><input style={inp} value={artisanProfession} onChange={e => { ks(); setArtisanProfession(e.target.value) }} placeholder={t('portail.reduction.artisan.profession_ph')} /></div>}
            {qActif('revenus_artisans_regime') && <div><label style={lbl}>{qL('revenus_artisans_regime', t('portail.reduction.artisan.regime'))}</label>
              <select style={inp} value={artisanRegime} onChange={e => { ks(); setArtisanRegime(e.target.value) }}>
                <option value="">{t('portail.reduction.artisan.choose')}</option><option value="reel">{t('portail.reduction.artisan.reel')}</option><option value="forfaitaire">{t('portail.reduction.artisan.forfaitaire')}</option>
              </select>
            </div>}
            {qActif('revenus_artisans_montant_annuel') && <div><label style={lbl}>{qL('revenus_artisans_montant_annuel', t('portail.reduction.artisan.montant'))}</label><input style={inp} type="number" min="0" value={artisanMontantAnnuel} onChange={e => { ks(); setArtisanMontantAnnuel(e.target.value) }} /></div>}
          </div>
        </div>
        {questionsCustomActives('revenus').length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {questionsCustomActives('revenus').map((q: any) => (
              <CustomQuestionField key={q.id} q={q} value={reponsesCustom[q.cle]}
                onChange={v => { ks(); setReponsesCustom(p => ({ ...p, [q.cle]: v })) }} />
            ))}
          </div>
        )}
      </Section>

      {/* ── 6. ALLOCATIONS ── */}
      <Section title={t('portail.reduction.section.alloc')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {qActif('alloc_familiales_mensuelles') && <div><label style={lbl}>{qL('alloc_familiales_mensuelles', t('portail.reduction.alloc.familiales'))}</label><input style={inp} type="number" min="0" value={allocFamiliales} onChange={e => { ks(); setAllocFamiliales(e.target.value) }} /></div>}
          {qActif('alloc_chomage_mensuelle') && <div><label style={lbl}>{qL('alloc_chomage_mensuelle', t('portail.reduction.alloc.chomage'))}</label><input style={inp} type="number" min="0" value={allocChomage} onChange={e => { ks(); setAllocChomage(e.target.value) }} /></div>}
          {qActif('apl_mensuelle') && <div><label style={lbl}>{qL('apl_mensuelle', t('portail.reduction.alloc.apl'))}</label><input style={inp} type="number" min="0" value={apl} onChange={e => { ks(); setApl(e.target.value) }} /></div>}
          {qActif('autres_revenus_mensuels') && <div><label style={lbl}>{qL('autres_revenus_mensuels', t('portail.reduction.alloc.autres'))}</label><input style={inp} type="number" min="0" value={autresRevenus} onChange={e => { ks(); setAutresRevenus(e.target.value) }} /></div>}
          {qActif('aides_mensuelles') && <div><label style={lbl}>{qL('aides_mensuelles', t('portail.reduction.alloc.aides'))}</label><input style={inp} type="number" min="0" value={aidesMensuelles} onChange={e => { ks(); setAidesMensuelles(e.target.value) }} /></div>}
        </div>

        {/* Total auto-calculé */}
        <div style={{ background: totalRev > 0 ? '#EFF6FF' : '#F8FAFC', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>{t('portail.reduction.total_revenus')}</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8' }}>{totalRev.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</span>
        </div>
        {questionsCustomActives('allocations').length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {questionsCustomActives('allocations').map((q: any) => (
              <CustomQuestionField key={q.id} q={q} value={reponsesCustom[q.cle]}
                onChange={v => { ks(); setReponsesCustom(p => ({ ...p, [q.cle]: v })) }} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Section custom 'autres' — uniquement si l'admin a configuré des questions dedans ── */}
      {questionsCustomActives('autres').length > 0 && (
        <Section title={t('portail.reduction.section.autres_infos')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {questionsCustomActives('autres').map((q: any) => (
              <CustomQuestionField key={q.id} q={q} value={reponsesCustom[q.cle]}
                onChange={v => { ks(); setReponsesCustom(p => ({ ...p, [q.cle]: v })) }} />
            ))}
          </div>
        </Section>
      )}

      {/* ── 7. AUTRES ENFANTS / CHARGES ── */}
      <Section title={t('portail.reduction.section.autres_enfants')}>
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t('portail.reduction.autres_enfants.intro')}</p>
        {enfantsAutres.map((e: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignItems: 'end', marginBottom: 8 }}>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.prenom2')}</label><input style={inp} value={e.prenom} onChange={ev => { ks(); setEnfantsAutres(p => p.map((x, j) => j === i ? { ...x, prenom: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.age')}</label><input style={inp} type="number" value={e.age} onChange={ev => { ks(); setEnfantsAutres(p => p.map((x, j) => j === i ? { ...x, age: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.classe')}</label><input style={inp} value={e.classe} onChange={ev => { ks(); setEnfantsAutres(p => p.map((x, j) => j === i ? { ...x, classe: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.etablissement')}</label><input style={inp} value={e.etablissement} onChange={ev => { ks(); setEnfantsAutres(p => p.map((x, j) => j === i ? { ...x, etablissement: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.tarif_mois')}</label><input style={inp} type="number" min="0" value={e.tarif_mensuel} onChange={ev => { ks(); setEnfantsAutres(p => p.map((x, j) => j === i ? { ...x, tarif_mensuel: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.mois')}</label><input style={inp} type="number" min="1" max="12" value={e.nb_mois} onChange={ev => { ks(); setEnfantsAutres(p => p.map((x, j) => j === i ? { ...x, nb_mois: ev.target.value } : x)) }} /></div>
            <div style={{ paddingBottom: 2 }}>{i > 0 && <button onClick={() => { ks(); setEnfantsAutres(p => p.filter((_, j) => j !== i)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 20 }}>×</button>}</div>
          </div>
        ))}
        <button onClick={() => { ks(); setEnfantsAutres(p => [...p, { prenom: '', age: '', classe: '', etablissement: '', tarif_mensuel: '', nb_mois: 10 }]) }}
          style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>{t('portail.reduction.add_child')}</button>
      </Section>

      <Section title={t('portail.reduction.section.charges')}>
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t('portail.reduction.charges.intro')}</p>
        {personnesCharge.map((p: any, i: number) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'end', marginBottom: 8 }}>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.nom2')}</label><input style={inp} value={p.nom} onChange={ev => { ks(); setPersonnesCharge(prev => prev.map((x, j) => j === i ? { ...x, nom: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.prenom2')}</label><input style={inp} value={p.prenom} onChange={ev => { ks(); setPersonnesCharge(prev => prev.map((x, j) => j === i ? { ...x, prenom: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.age')}</label><input style={inp} type="number" value={p.age} onChange={ev => { ks(); setPersonnesCharge(prev => prev.map((x, j) => j === i ? { ...x, age: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.revenus.lien')}</label><input style={inp} value={p.lien_parente} onChange={ev => { ks(); setPersonnesCharge(prev => prev.map((x, j) => j === i ? { ...x, lien_parente: ev.target.value } : x)) }} /></div>
            <div><label style={{ ...lbl, marginBottom: 3 }}>{t('portail.reduction.field.frais_annuels')}</label><input style={inp} type="number" min="0" value={p.montant_annuel_frais} onChange={ev => { ks(); setPersonnesCharge(prev => prev.map((x, j) => j === i ? { ...x, montant_annuel_frais: ev.target.value } : x)) }} /></div>
            <div style={{ paddingBottom: 2 }}>{i > 0 && <button onClick={() => { ks(); setPersonnesCharge(prev => prev.filter((_, j) => j !== i)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 20 }}>×</button>}</div>
          </div>
        ))}
        <button onClick={() => { ks(); setPersonnesCharge(p => [...p, { nom: '', prenom: '', age: '', lien_parente: '', montant_annuel_frais: '' }]) }}
          style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>{t('portail.reduction.add_person')}</button>
      </Section>

      {/* ── 9. PROPOSITION ── */}
      <Section title={t('portail.reduction.section.proposition')}>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#1D4ED8', marginBottom: 10, fontWeight: 600 }}>
            {t('portail.reduction.dossier_pour')} <strong>{nbEnfantsTotal > 1 ? t('portail.reduction.count_many', { n: nbEnfantsTotal }) : t('portail.reduction.count_one', { n: nbEnfantsTotal })}</strong>
            {Object.entries(secteurCounts).map(([sec, nb]) => ' — ' + t('portail.reduction.par_secteur', { nb, secteur: sec }))}
          </div>
          <label style={lbl}>{t('portail.reduction.tarif_propose')}</label>
          <input style={{ ...inp, fontSize: 18, fontWeight: 700, color: '#1D4ED8', textAlign: 'center', padding: '12px' }}
            type="number" min="0" value={tarifPropose} placeholder={t('portail.reduction.tarif_ph')}
            onChange={e => { ks(); setTarifPropose(e.target.value) }} />
        </div>
        <div>
          <label style={lbl}>{t('portail.reduction.commentaire')}</label>
          <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={commentaire}
            onChange={e => { ks(); setCommentaire(e.target.value) }}
            placeholder={t('portail.reduction.commentaire_ph')} />
        </div>
      </Section>

      {/* ── 10. PIÈCES JUSTIFICATIVES ── */}
      {docsConfig.length > 0 && (
        <Section title={t('portail.reduction.section.docs')}>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t('portail.reduction.docs.intro')}</p>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: pasDeJustificatif ? '#FEF9EC' : '#F8FAFC', border: `1px solid ${pasDeJustificatif ? '#F59E0B' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#475569' }}>
            <input type="checkbox" checked={pasDeJustificatif} onChange={e => { ks(); setPasDeJustificatif(e.target.checked) }} style={{ marginTop: 2, flexShrink: 0, accentColor: '#F59E0B' }} />
            <span>{t('portail.reduction.no_justif')}</span>
          </label>

          {pasDeJustificatif && (
            <div>
              <label style={lbl}>{t('portail.reduction.no_justif_detail')}</label>
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={pasDeJustificatifDetail}
                onChange={e => { ks(); setPasDeJustificatifDetail(e.target.value) }} />
            </div>
          )}

          {docsConfig.map((doc: any) => {
            const uploaded = docsUploaded[doc.id]
            const isUploading = uploading[doc.id]
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: uploaded ? 'rgba(16,185,129,0.06)' : '#F8FAFC', border: `1px solid ${uploaded ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{doc.label}{doc.obligatoire && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}</div>
                  {uploaded && <div style={{ fontSize: 11, color: '#10B981', marginTop: 3 }}>✓ {uploaded.nom_fichier} ({uploaded.taille_ko} Ko)</div>}
                </div>
                <input ref={(el: HTMLInputElement | null) => { fileRefs.current[doc.id] = el }} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(doc.id, doc.label, f) }} />
                <button onClick={() => fileRefs.current[doc.id]?.click()} disabled={isUploading}
                  style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: isUploading ? 'not-allowed' : 'pointer', background: uploaded ? 'rgba(16,185,129,0.1)' : '#2563EB', color: uploaded ? '#10B981' : '#fff', border: uploaded ? '1px solid rgba(16,185,129,0.3)' : 'none', opacity: isUploading ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {isUploading ? t('portail.common.uploading') : uploaded ? t('portail.reduction.replace') : t('portail.reduction.attach')}
                </button>
              </div>
            )
          })}
        </Section>
      )}

      {/* ── 11. ATTESTATION + SIGNATURE ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>{t('portail.reduction.attestation.title')}</div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, margin: '0 0 16px' }}
          dangerouslySetInnerHTML={{ __html: t('portail.reduction.attestation.body', { parent: `${famForm.parent1_prenom} ${famForm.parent1_nom}` }) }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div><label style={lbl}>{t('portail.reduction.fait_a')}</label><input style={inp} value={attestationLieu} onChange={e => { ks(); setAttestationLieu(e.target.value) }} placeholder={t('portail.reduction.ville_ph')} /></div>
          <div><label style={lbl}>{t('portail.reduction.le')}</label><input style={inp} type="date" defaultValue={new Date().toISOString().split('T')[0]} readOnly /></div>
        </div>

        <div>
          <label style={lbl}>{t('portail.reduction.signature')}</label>
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 8px' }}>{t('portail.reduction.signature_hint')}</p>
          <div style={{ border: `2px solid ${signatureData ? '#10B981' : '#E2E8F0'}`, borderRadius: 10, overflow: 'hidden', background: '#fff', touchAction: 'none' }}>
            <canvas ref={canvasRef} width={600} height={150}
              style={{ display: 'block', width: '100%', cursor: 'crosshair' }}
              onMouseDown={startSign} onMouseMove={drawSign} onMouseUp={stopSign} onMouseLeave={stopSign}
              onTouchStart={startSign} onTouchMove={drawSign} onTouchEnd={stopSign} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <button onClick={clearSign} style={{ fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('portail.common.signature.clear')}</button>
            {signatureData && <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>{t('portail.common.signature.saved')}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 8, flexWrap: 'wrap' }}>
        {/* Indicateur discret d'autosave du brouillon */}
        <span style={{ fontSize: 11, color: '#94A3B8' }}>
          {lastSavedAt ? t('portail.reduction.draft_saved_at', { time: lastSavedAt }, 'Brouillon enregistré à {time}') : ''}
        </span>
        <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
        <button onClick={() => router.push('/portail/inscriptions')}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
          {t('portail.common.cancel')}
        </button>
        <button onClick={soumettre} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? t('portail.common.sending') : t('portail.reduction.submit')}
        </button>
        </div>
      </div>
    </div>
  )
}
