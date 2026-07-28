'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import { getScolaritesEnfant } from '@/lib/scolarite'
import { getSecteurScope, enfantDansSecteur } from '@/lib/secteur-scope'
import { logAction } from '@/lib/audit-log'
import { useToast } from '@/components/ui/Toast'
import OptionsContratSection from '@/components/OptionsContratSection'
import { getExerciceInscription } from '@/lib/annee-inscription'

export default function EnfantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const toast = useToast()
  // ANNÉE (fix classe/scolarites) : la classe éditée sur cette fiche s'applique à
  // l'exercice choisi dans le sélecteur d'année en haut de page — le même que
  // celui qui pilote la liste des élèves (src/app/[ecole]/enfants/page.tsx).
  const { exercice: exerciceCourant, exerciceSelectionne } = useExercice()
  const enfantId = params.id as string

  const [enfant, setEnfant] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [inscriptions, setInscriptions] = useState<any[]>([])
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [inscriptionDocs, setInscriptionDocs] = useState<any[]>([])
  const [personnesAutorisees, setPersonnesAutorisees] = useState<any[]>([])
  const [historique, setHistorique] = useState<any[]>([])
  const [scolarites, setScolarites] = useState<any[]>([])
  const [optionsConfig, setOptionsConfig] = useState<any[]>([])
  const [anneeCourante, setAnneeCourante] = useState<string>('')
  const [showSortieModal, setShowSortieModal] = useState(false)
  // ANNÉE (fix classe/scolarites) : classe de l'élève POUR l'exercice sélectionné.
  // Champ distinct de form.classe_id (qui, lui, n'est qu'un miroir "année courante"
  // dans la table enfants). C'est cette valeur qui est écrite dans scolarites.
  const [classeAnnee, setClasseAnnee] = useState<string>('')
  // Erreur de sauvegarde persistante (les toasts disparaissent après 4 s, et une RLS
  // qui bloque silencieusement est un piège récurrent : on garde le message affiché).
  const [erreurSave, setErreurSave] = useState<string>('')
  // SECTEUR (llll2) : true si la fiche est hors du secteur de l'agent → écran "Accès limité"
  const [horsSecteur, setHorsSecteur] = useState(false)
  const [sortieForm, setSortieForm] = useState({ date_sortie: new Date().toISOString().slice(0, 10), motif_sortie: '' })

  useEffect(() => { load() }, [enfantId])

  // ── ANNÉE (fix classe/scolarites) ────────────────────────────────────────────
  // Exercice de travail = celui du sélecteur d'année (identique à la liste élèves).
  const exerciceId: string | null = exerciceSelectionne?.id ?? null
  const exerciceCode: string = exerciceSelectionne?.code ?? ''
  const exerciceCloture: boolean = exerciceSelectionne?.statut === 'cloture'
  // `enfants.classe_id` n'est qu'une commodité d'affichage de l'année courante :
  // on ne le touche que si l'année éditée EST l'année courante de l'école
  // (si l'école n'a pas d'exercice courant défini, on conserve le comportement historique).
  const editeAnneeCourante: boolean = !exerciceCourant?.id || exerciceCourant.id === exerciceId
  // Scolarité déjà enregistrée pour cette année (source de vérité de la classe).
  const scolariteAnnee: any = exerciceId
    ? (scolarites.find((sc: any) => sc.exercice_id === exerciceId) ?? null)
    : null

  // Valeur initiale du champ classe pour l'année sélectionnée.
  // Si aucune scolarité n'existe encore pour l'année COURANTE, on pré-remplit avec
  // `enfants.classe_id` : enregistrer crée alors la scolarité manquante avec la
  // classe du dossier (au lieu d'effacer silencieusement l'affectation).
  const classeAnneeInitiale: string = scolariteAnnee
    ? (scolariteAnnee.classe_id ?? '')
    : (editeAnneeCourante ? (enfant?.classe_id ?? '') : '')

  // Hors édition, le champ classe reflète toujours l'année sélectionnée. Sans ce
  // resync, changer d'année dans le sélecteur laisserait afficher la classe d'une
  // autre année — et un enregistrement écrirait la mauvaise classe dans scolarites.
  useEffect(() => {
    if (editMode) return
    setClasseAnnee(classeAnneeInitiale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, exerciceId, scolarites, enfant])

  async function load() {
    const s = createClient()

    // SECTEUR (llll2) : si le compte est restreint à un secteur et que cet enfant
    // n'est pas scolarisé dans ce secteur (classe hors secteur ou sans classe)
    // → écran "Accès limité", pas de chargement.
    const { data: { session: sessionScope } } = await s.auth.getSession()
    if (sessionScope) {
      const scope = await getSecteurScope(s, sessionScope.user.id)
      if (scope.secteurId) {
        const ok = await enfantDansSecteur(s, enfantId, scope.secteurId)
        if (!ok) { setHorsSecteur(true); setLoading(false); return }
      }
    }
    setHorsSecteur(false)

    const [{ data: e }, { data: cls }] = await Promise.all([
      s.from('enfants')
        .select('*, familles(*), classes(id, nom)')
        .eq('id', enfantId)
        .single(),
      s.from('classes').select('id, nom').order('nom'),
    ])

    if (e) {
      setEnfant(e)
      setFamille(e.familles)
      setForm({ ...e })
      // Charger la config des options pour l'école de cet enfant
      const { data: opts } = await s
        .from('options_enfant_config')
        .select('id, code, label, ordre')
        .eq('ecole_id', e.ecole_id)
        .eq('actif', true)
        .order('ordre')
      setOptionsConfig(opts ?? [])
    }
    setClasses(cls ?? [])

    // Inscriptions N+1
    const [{ data: inscr }, { data: cont }] = await Promise.all([
      s.from('inscriptions_pedagogiques')
        .select('*, secteurs(nom)')
        .eq('enfant_id', enfantId)
        .order('annee_scolaire', { ascending: false }),
      s.from('contrat_enfants')
        .select('*, contrats_scolarisation(annee_scolaire, statut, montant_total, mode_reglement)')
        .eq('enfant_id', enfantId),
    ])
    setInscriptions(inscr ?? [])
    setContrats(cont ?? [])

    const { data: idocs } = await s.from('inscription_documents_uploaded')
      .select('*').eq('enfant_id', enfantId).order('uploaded_at', { ascending: false })
    setInscriptionDocs(idocs ?? [])

    const { data: persAuto } = await s.from('enfant_personnes_autorisees')
      .select('*').eq('enfant_id', enfantId).order('created_at')
    setPersonnesAutorisees(persAuto ?? [])

    const { data: hist } = await s.from('eleve_historique')
      .select('*')
      .eq('enfant_id', enfantId)
      .order('date_evenement', { ascending: false })
      .order('created_at', { ascending: false })
    setHistorique(hist ?? [])

    setScolarites(await getScolaritesEnfant(s, enfantId))

    // Charger l'annee d'inscription courante pour la section Options
    if (ecole?.id) {
      const { code } = await getExerciceInscription(s, ecole.id)
      setAnneeCourante(code)
    }

    setLoading(false)
  }

  // ── ANNÉE (fix classe/scolarites) ────────────────────────────────────────────
  // `scolarites` est la SOURCE DE VÉRITÉ de l'affectation de classe par année :
  // c'est elle que lisent la liste des élèves (filtrée sur exercice_id), les
  // passages de classe et le calcul des contrats. `enfants.classe_id` n'est qu'un
  // miroir d'affichage de l'année courante. On écrit donc les DEUX, et on ne sort
  // du mode édition que si tout a réussi (une RLS qui bloque ne doit pas faire
  // perdre la saisie).
  async function sauvegarder() {
    setErreurSave('')

    // Aucune année sélectionnée (contexte pas encore chargé / école sans exercice) :
    // on ne peut pas savoir à quelle année rattacher la classe → on ne sauvegarde pas
    // à moitié, on garde la saisie et on explique.
    if (!exerciceId) {
      const msg = "Aucune année scolaire sélectionnée : impossible d'enregistrer l'affectation de classe. Choisissez une année avec le sélecteur en haut de page."
      setErreurSave(msg)
      toast.error(msg)
      return
    }

    const s = createClient()
    const classeCible: string | null = classeAnnee || null

    // Scolarité existante pour (enfant × exercice) — lecture fraîche : l'état local
    // peut dater, et on veut distinguer "ligne absente" de "lecture interdite".
    // Pas de .maybeSingle() : il lèverait une erreur sur d'éventuels doublons
    // historiques (enfant_id, exercice_id) et bloquerait la sauvegarde.
    const { data: scoRows, error: errLecture } = await s
      .from('scolarites')
      .select('id, classe_id')
      .eq('enfant_id', enfantId)
      .eq('exercice_id', exerciceId)
    const scoExistante: any = (scoRows ?? [])[0] ?? null
    if (errLecture) {
      const msg = `Impossible de lire la scolarité de ${exerciceCode} : ${errLecture.message}`
      setErreurSave(msg)
      toast.error(msg)
      return
    }

    const classeChangee = (scoExistante?.classe_id ?? null) !== classeCible

    // Année clôturée = consultation seule (même règle que la liste des élèves et
    // que les passages de classe). On refuse AVANT toute écriture, pour ne pas
    // désynchroniser enfants.classe_id et scolarites.
    if (exerciceCloture && classeChangee) {
      const msg = `L'année ${exerciceCode} est clôturée : la classe ne peut plus y être modifiée.`
      setErreurSave(msg)
      toast.error(msg)
      return
    }

    setSaving(true)

    // 1. Table enfants (identité + options). classe_id n'y est mis à jour que si
    //    l'année éditée est l'année courante de l'école.
    const payloadEnfant: Record<string, any> = {
      prenom: form.prenom, nom: form.nom,
      date_naissance: form.date_naissance || null,
      transport: form.transport,
      instruction_religieuse: form.instruction_religieuse,
      etude_garderie: form.etude_garderie,
      options_choisies: form.options_choisies || {},
    }
    // Année clôturée : on ne réécrit rien de ce qui touche à l'affectation.
    if (editeAnneeCourante && !exerciceCloture) payloadEnfant.classe_id = classeCible

    const { error: errEnfant } = await s.from('enfants').update(payloadEnfant).eq('id', enfantId)
    if (errEnfant) {
      setSaving(false)
      const msg = `Enregistrement refusé : ${errEnfant.message}`
      setErreurSave(msg)
      toast.error(msg)
      return // on reste en mode édition : la saisie est conservée
    }

    // 2. Table scolarites — select-puis-update/insert explicite (voir commentaire
    //    en tête) : sur une ligne existante on ne touche QUE la classe, jamais le
    //    statut ni les dates de sortie.
    if (!exerciceCloture) {
      if (scoExistante?.id) {
        const { error: errUpd } = await s.from('scolarites')
          .update({ classe_id: classeCible, updated_at: new Date().toISOString() })
          .eq('id', scoExistante.id)
        if (errUpd) {
          setSaving(false)
          const msg = `La classe n'a pas pu être enregistrée pour ${exerciceCode} : ${errUpd.message}`
          setErreurSave(msg)
          toast.error(msg)
          return
        }
      } else {
        const { error: errIns } = await s.from('scolarites').insert({
          enfant_id: enfantId,
          exercice_id: exerciceId,
          ecole_id: enfant?.ecole_id ?? ecole?.id ?? null,
          classe_id: classeCible,
          statut_inscription: enfant?.statut_inscription || 'inscrit',
          annee_scolaire: exerciceCode || null,
        })
        if (errIns) {
          setSaving(false)
          const msg = `La scolarité ${exerciceCode} n'a pas pu être créée : ${errIns.message}`
          setErreurSave(msg)
          toast.error(msg)
          return
        }
      }
    }

    await load()
    setEditMode(false)
    setSaving(false)
    toast.success(exerciceCloture
      ? 'Fiche enregistrée.'
      : `Fiche enregistrée · classe appliquée à l'année ${exerciceCode}.`)
  }

  async function validerInscription() {
    setSaving(true)
    await createClient().from('enfants').update({ statut_inscription: 'inscrit' }).eq('id', enfantId)
    await load()
    setSaving(false)
  }

  async function confirmerSortie() {
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const dateEvt = sortieForm.date_sortie || new Date().toISOString().slice(0, 10)
    const { error } = await s.from('enfants').update({
      statut_inscription: 'sorti',
      date_sortie: dateEvt,
      motif_sortie: sortieForm.motif_sortie || null,
    }).eq('id', enfantId)
    if (!error) {
      await s.from('eleve_historique').insert({
        enfant_id: enfantId, ecole_id: enfant.ecole_id, type: 'sortie',
        exercice_id: enfant.exercice_id,
        classe_avant_id: enfant.classe_id, classe_avant_nom: enfant.classes?.nom ?? null,
        date_evenement: dateEvt,
        motif: sortieForm.motif_sortie || null,
        created_by: session?.user.id ?? null,
      })
    }
    await logAction(s, enfant.ecole_id, 'eleve_sortie', {
      enfant_id: enfantId,
      date_sortie: dateEvt,
      motif: sortieForm.motif_sortie || null,
    })
    setShowSortieModal(false)
    await load()
    setSaving(false)
  }

  async function reintegrer() {
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    const { error } = await s.from('enfants').update({
      statut_inscription: 'inscrit', date_sortie: null, motif_sortie: null,
    }).eq('id', enfantId)
    if (!error) {
      await s.from('eleve_historique').insert({
        enfant_id: enfantId, ecole_id: enfant.ecole_id, type: 'retour',
        exercice_id: enfant.exercice_id,
        classe_apres_id: enfant.classe_id, classe_apres_nom: enfant.classes?.nom ?? null,
        motif: 'Réintégration de l’élève',
        created_by: session?.user.id ?? null,
      })
      await logAction(s, enfant.ecole_id, 'eleve_reintegre', { enfant_id: enfantId })
    }
    await load()
    setSaving(false)
  }

  const HIST_META: Record<string, { label: string; icone: string; color: string }> = {
    entree: { label: 'Entrée', icone: '🚪', color: '#2563EB' },
    passage: { label: 'Passage de classe', icone: '🎒', color: '#7C3AED' },
    reinscription: { label: 'Réinscription', icone: '🔁', color: '#0891B2' },
    sortie: { label: 'Sortie', icone: '👋', color: '#DC2626' },
    retour: { label: 'Réintégration', icone: '↩️', color: '#059669' },
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  // SECTEUR (llll2) : fiche hors du secteur de l'agent → pas de crash, message clair
  if (horsSecteur) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', marginBottom: 6 }}>Accès limité à votre secteur</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Cet élève n&apos;est pas scolarisé dans votre secteur.</div>
      <button onClick={() => router.push(`/${ecole.slug}/enfants`)}
        style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
        ← Retour aux élèves
      </button>
    </div>
  )
  if (!enfant) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Élève introuvable</div>

  const STATUT_COLOR: Record<string, string> = {
    brouillon: '#94A3B8', soumis: '#F59E0B', accepte: '#10B981', refuse: '#EF4444', valide: '#10B981',
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => router.push(`/${ecole.slug}/enfants`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          ← Retour
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {enfant.prenom?.[0]?.toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>
              {enfant.prenom} {enfant.nom}
            </h1>
            <button
              onClick={() => router.push(`/${ecole.slug}/familles/${enfant.famille_id}`)}
              style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
              Famille {famille?.nom} →
            </button>
          </div>
        </div>
        <button
          onClick={() => router.push(`/${ecole.slug}/enfants/${enfantId}/sante`)}
          style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 9, padding: '9px 14px', fontSize: 13, color: '#991B1B', cursor: 'pointer', fontWeight: 600 }}>
          🏥 Fiche santé
        </button>
        <button
          onClick={() => { if (editMode) { sauvegarder() } else { setErreurSave(''); setEditMode(true) } }}
          disabled={saving}
          style={{ background: editMode ? '#2563EB' : '#F1F5F9', border: `1px solid ${editMode ? '#2563EB' : '#E2E8F0'}`, borderRadius: 9, padding: '9px 18px', fontSize: 13, color: editMode ? '#fff' : '#475569', cursor: 'pointer', fontWeight: editMode ? 600 : 400 }}>
          {saving ? 'Enregistrement...' : editMode ? '✓ Enregistrer' : '✏️ Modifier'}
        </button>
        {editMode && (
          <button onClick={() => { setEditMode(false); setForm({ ...enfant }); setClasseAnnee(classeAnneeInitiale); setErreurSave('') }}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 14px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
            Annuler
          </button>
        )}
      </div>

      {/* Erreur de sauvegarde — reste affichée (contrairement au toast) tant que la
          saisie n'a pas été réenregistrée : une RLS qui refuse l'écriture ne doit
          jamais passer inaperçue. */}
      {erreurSave && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#991B1B', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 15, lineHeight: '18px' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Modifications non enregistrées</div>
            <div style={{ lineHeight: 1.45 }}>{erreurSave}</div>
          </div>
        </div>
      )}

      {/* Statut d'inscription (banner avec actions selon le statut) */}
      {(() => {
        const st = enfant.statut_inscription
        const palette: Record<string, { bg: string; border: string; fg: string; icone: string; label: string }> = {
          inscrit: { bg: '#ECFDF5', border: '#A7F3D0', fg: '#059669', icone: '✓', label: 'Inscription validée' },
          en_attente: { bg: '#FFFBEB', border: '#FDE68A', fg: '#D97706', icone: '⏳', label: 'En attente d\'inscription' },
          sorti: { bg: '#FEF2F2', border: '#FECACA', fg: '#B91C1C', icone: '👋', label: 'Élève sorti de l\'établissement' },
          refuse: { bg: '#F8FAFC', border: '#E2E8F0', fg: '#64748B', icone: '✗', label: 'Inscription refusée' },
        }
        const p = palette[st] || palette.en_attente
        return (
          <div style={{
            background: p.bg, border: `1px solid ${p.border}`,
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 22 }}>{p.icone}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.fg }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Année {enfant.annee_scolaire} · {enfant.classes?.nom || 'Sans classe'}
                  {st === 'sorti' && enfant.date_sortie && <> · Sortie le {new Date(enfant.date_sortie).toLocaleDateString('fr-FR')}</>}
                  {st === 'sorti' && enfant.motif_sortie && <> · {enfant.motif_sortie}</>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {st === 'en_attente' && (
                <button onClick={validerInscription} disabled={saving}
                  style={{ background: '#10B981', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 40 }}>
                  {saving ? '…' : '✓ Valider l\'inscription'}
                </button>
              )}
              {st === 'inscrit' && (
                <button onClick={() => { setSortieForm({ date_sortie: new Date().toISOString().slice(0, 10), motif_sortie: '' }); setShowSortieModal(true) }} disabled={saving}
                  style={{ background: '#fff', border: '1px solid #FCA5A5', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#B91C1C', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 40 }}>
                  👋 Sortie de l&apos;élève
                </button>
              )}
              {st === 'sorti' && (
                <button onClick={reintegrer} disabled={saving}
                  style={{ background: '#10B981', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 40 }}>
                  {saving ? '…' : '↩️ Réintégrer l\'élève'}
                </button>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Infos élève */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>
            Informations élève
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Prénom</label>
              {editMode
                ? <input style={inp} value={form.prenom || ''} onChange={e => setForm((p: any) => ({ ...p, prenom: e.target.value }))} />
                : <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{enfant.prenom}</div>
              }
            </div>
            <div>
              <label style={lbl}>Nom</label>
              {editMode
                ? <input style={inp} value={form.nom || ''} onChange={e => setForm((p: any) => ({ ...p, nom: e.target.value }))} />
                : <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{enfant.nom}</div>
              }
            </div>
          </div>
          <div>
            <label style={lbl}>Date de naissance</label>
            {editMode
              ? <input style={inp} type="date" value={form.date_naissance || ''} onChange={e => setForm((p: any) => ({ ...p, date_naissance: e.target.value }))} />
              : <div style={{ fontSize: 13, color: '#1E293B' }}>{enfant.date_naissance ? new Date(enfant.date_naissance).toLocaleDateString('fr-FR') : '—'}</div>
            }
          </div>
          {/* ANNÉE (fix classe/scolarites) : la classe est toujours celle de l'exercice
              sélectionné en haut de page — le libellé le dit explicitement. */}
          <div>
            <label style={lbl}>
              Classe pour {exerciceCode || '…'}
            </label>
            {editMode
              ? <>
                  <select style={inp} value={classeAnnee} disabled={exerciceCloture}
                    onChange={e => setClasseAnnee(e.target.value)}>
                    <option value="">Non affecté</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: exerciceCloture ? '#B91C1C' : '#94A3B8', marginTop: 5, lineHeight: 1.4 }}>
                    {exerciceCloture
                      ? <>🔒 L&apos;année <strong>{exerciceCode}</strong> est clôturée : la classe n&apos;y est plus modifiable.</>
                      : <>S&apos;applique à l&apos;année <strong>{exerciceCode}</strong>. Changez d&apos;année avec le sélecteur en haut de page pour affecter une autre année.</>}
                  </div>
                </>
              : <div style={{ fontSize: 13, color: '#1E293B' }}>
                  {scolariteAnnee
                    ? (scolariteAnnee.classes?.nom
                        ? <span style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{scolariteAnnee.classes.nom}</span>
                        : <span style={{ color: '#94A3B8' }}>Sans classe</span>)
                    : <span style={{ fontSize: 12, color: '#94A3B8' }}>
                        Aucune scolarité enregistrée pour {exerciceCode || 'cette année'}
                        {enfant.classes?.nom ? ` (classe au dossier : ${enfant.classes.nom})` : ''}
                      </span>}
                </div>
            }
          </div>
          <div>
            <label style={lbl}>Options</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {optionsConfig.length === 0 && (
                <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>Aucune option configurée pour cette école.</div>
              )}
              {optionsConfig.map(opt => {
                // Récupère la valeur : priorité aux colonnes legacy (transport/instruction_religieuse/etude_garderie), sinon options_choisies[code]
                const legacyKeys = ['transport', 'instruction_religieuse', 'etude_garderie']
                const source = editMode ? form : enfant
                const checked = legacyKeys.includes(opt.code)
                  ? !!source?.[opt.code]
                  : !!source?.options_choisies?.[opt.code]
                return (
                  <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B', cursor: editMode ? 'pointer' : 'default' }}>
                    <input type="checkbox"
                      checked={checked}
                      disabled={!editMode}
                      onChange={e => {
                        if (!editMode) return
                        const v = e.target.checked
                        setForm((p: any) => {
                          const next = { ...p }
                          if (legacyKeys.includes(opt.code)) next[opt.code] = v
                          next.options_choisies = { ...(p.options_choisies || {}), [opt.code]: v }
                          return next
                        })
                      }}
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        {/* Famille */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Famille
            <button onClick={() => router.push(`/${ecole.slug}/familles/${enfant.famille_id}`)}
              style={{ fontSize: 11, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Voir la fiche →
            </button>
          </div>
          {[
            { label: 'Nom de famille', value: famille?.nom },
            { label: 'Email', value: famille?.parent1_email },
            { label: 'Téléphone', value: famille?.parent1_telephone },
            { label: 'Adresse', value: [famille?.parent1_adresse, famille?.parent1_code_postal, famille?.parent1_ville].filter(Boolean).join(' ') },
            { label: 'Situation', value: famille?.situation_maritale },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
              <div style={{ fontSize: 13, color: f.value ? '#1E293B' : '#CBD5E1' }}>{f.value || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inscriptions N+1 */}
      {inscriptions.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            Inscriptions N+1
          </div>
          {inscriptions.map((insc, i) => (
            <div key={insc.id} style={{ padding: '12px 20px', borderBottom: i < inscriptions.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{insc.annee_scolaire}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Secteur : {insc.secteurs?.nom || '—'} · Classe : {insc.classe_souhaitee || '—'}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                color: STATUT_COLOR[insc.statut] || '#94A3B8',
                background: `${STATUT_COLOR[insc.statut]}18` || 'rgba(148,163,184,0.1)',
              }}>
                {insc.statut.charAt(0).toUpperCase() + insc.statut.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Options du contrat (admin) */}
      {anneeCourante && ecole?.id && (
        <OptionsContratSection enfantId={enfantId} ecoleId={ecole.id} anneeScolaire={anneeCourante} mode="admin" enfantPrenom={enfant?.prenom} />
      )}

      {/* Contrats */}
      {contrats.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            Contrats de scolarisation
          </div>
          {contrats.map((c, i) => (
            <div key={c.id} style={{ padding: '12px 20px', borderBottom: i < contrats.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{c.contrats_scolarisation?.annee_scolaire}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {c.classe_prevue || '—'} · {c.contrats_scolarisation?.mode_reglement || '—'}
                  {c.sous_total ? ` · ${c.sous_total.toLocaleString('fr-FR')} €` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                color: STATUT_COLOR[c.contrats_scolarisation?.statut] || '#94A3B8',
                background: `${STATUT_COLOR[c.contrats_scolarisation?.statut]}18`,
              }}>
                {c.contrats_scolarisation?.statut || '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Documents d'inscription fournis par la famille */}
      {inscriptionDocs.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
            📎 Documents d&apos;inscription fournis
          </div>
          {inscriptionDocs.map((d, i) => (
            <div key={d.id} style={{ padding: '12px 20px', borderBottom: i < inscriptionDocs.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{d.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  {d.nom_fichier}{d.taille_ko ? ` · ${d.taille_ko} Ko` : ''} · {new Date(d.uploaded_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '5px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  Ouvrir ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Parcours scolaire (une ligne par annee) */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          🎓 Parcours scolaire (par année)
        </div>
        {scolarites.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 12, color: '#94A3B8' }}>Aucune scolarité enregistrée.</div>
        ) : scolarites.map((sc, i) => {
          const stMap: Record<string, { bg: string; fg: string; label: string }> = {
            inscrit: { bg: '#ECFDF5', fg: '#059669', label: 'Inscrit' },
            en_attente: { bg: '#FFFBEB', fg: '#D97706', label: 'En attente' },
            sorti: { bg: '#FEF2F2', fg: '#B91C1C', label: 'Sorti' },
            refuse: { bg: '#F1F5F9', fg: '#64748B', label: 'Refusé' },
          }
          const st = stMap[sc.statut_inscription] || stMap.en_attente
          return (
            <div key={sc.id} style={{ padding: '12px 20px', borderBottom: i < scolarites.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', minWidth: 90 }}>
                {sc.exercices?.code || '—'}
                {sc.exercices?.statut === 'cloture' && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#64748B', background: '#F1F5F9', borderRadius: 4, padding: '1px 5px' }}>CLÔTURÉ</span>}
              </div>
              <div style={{ flex: 1, minWidth: 120, fontSize: 13, color: '#475569' }}>
                {sc.classes?.nom
                  ? <span style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{sc.classes.nom}</span>
                  : <span style={{ color: '#CBD5E1' }}>Sans classe</span>}
                {sc.date_sortie && <span style={{ marginLeft: 8, fontSize: 11, color: '#94A3B8' }}>Sortie le {new Date(sc.date_sortie).toLocaleDateString('fr-FR')}{sc.motif_sortie ? ` · ${sc.motif_sortie}` : ''}</span>}
              </div>
              <span style={{ background: st.bg, color: st.fg, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{st.label}</span>
            </div>
          )
        })}
      </div>

      {/* Historique de scolarité */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          📜 Historique de scolarité
        </div>
        {historique.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 12, color: '#94A3B8' }}>Aucun événement enregistré pour le moment.</div>
        ) : historique.map((h, i) => {
          const meta = HIST_META[h.type] || { label: h.type, icone: '•', color: '#64748B' }
          return (
            <div key={h.id} style={{ padding: '12px 20px', borderBottom: i < historique.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 16, lineHeight: '20px' }}>{meta.icone}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>
                  {meta.label}
                  {(h.classe_avant_nom || h.classe_apres_nom) && (
                    <span style={{ fontWeight: 400, color: '#475569' }}>
                      {' — '}
                      {h.classe_avant_nom || '—'}{h.classe_apres_nom ? ` → ${h.classe_apres_nom}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                  {h.date_evenement ? new Date(h.date_evenement).toLocaleDateString('fr-FR') : ''}
                  {h.motif ? ` · ${h.motif}` : ''}
                  {h.notes ? ` · ${h.notes}` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Personnes autorisées à récupérer l'enfant */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 600, fontSize: 13, color: '#1E293B' }}>
          👤 Personnes autorisées à récupérer l&apos;enfant
        </div>
        {personnesAutorisees.length === 0 ? (
          <div style={{ padding: '16px 20px', fontSize: 12, color: '#94A3B8' }}>Aucune personne déclarée. Seuls les parents sont autorisés. La famille peut compléter cette liste depuis son espace.</div>
        ) : personnesAutorisees.map((pa, i) => (
          <div key={pa.id} style={{ padding: '12px 20px', borderBottom: i < personnesAutorisees.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{[pa.prenom, pa.nom].filter(Boolean).join(' ')}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {pa.lien || 'Lien non précisé'}{pa.telephone ? ` · ${pa.telephone}` : ''}
              </div>
            </div>
            {pa.autorise_sortie === false && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '2px 8px' }}>NON AUTORISÉ SORTIE</span>}
          </div>
        ))}
      </div>

      {/* Modal Sortie de l'élève */}
      {showSortieModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, padding: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1E293B' }}>👋 Sortie de l&apos;élève</h2>
              <button onClick={() => setShowSortieModal(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', marginBottom: 18 }}>
              {enfant.prenom} {enfant.nom} sera marqué comme <strong>sorti</strong>. L&apos;élève reste consultable dans l&apos;historique et la sortie est tracée. Vous pourrez le réintégrer à tout moment.
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Date de sortie</label>
              <input type="date" style={inp} value={sortieForm.date_sortie}
                onChange={e => setSortieForm(p => ({ ...p, date_sortie: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Motif de la sortie</label>
              <input style={inp} value={sortieForm.motif_sortie}
                placeholder="Déménagement, changement d'établissement, fin de scolarité…"
                onChange={e => setSortieForm(p => ({ ...p, motif_sortie: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSortieModal(false)} disabled={saving}
                style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 16px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={confirmerSortie} disabled={saving}
                style={{ background: '#DC2626', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, color: '#fff', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? '…' : 'Confirmer la sortie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
