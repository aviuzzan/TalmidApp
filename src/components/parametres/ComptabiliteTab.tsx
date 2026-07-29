'use client'
/**
 * ComptabiliteTab — paramétrage comptable de l'école (chantier ssss2-C).
 *
 * Trois sections :
 *   a) Plan de comptes        → table `comptes_comptables`
 *   b) Axes analytiques       → table `sections_analytiques` (2 dimensions)
 *   c) Imputations par défaut → table `imputations_defaut`
 *
 * C'est ce paramétrage que lit `src/lib/comptabilite.ts` au moment de
 * construire une facture : chaque ligne y recopie son compte et son axe
 * analytique. Sans compte, l'export FEC ne sait pas où imputer.
 *
 * Deux précautions structurantes dans ce fichier :
 *   - Les lignes livrées par TalmidApp (`systeme = true`) sont renommables et
 *     désactivables mais JAMAIS supprimables : le bouton est masqué et la
 *     raison est écrite, plutôt que de laisser remonter une erreur SQL.
 *   - Sur ce projet, un UPDATE/DELETE refusé par la RLS ne lève pas
 *     d'exception : il touche simplement zéro ligne. On demande donc le
 *     retour des lignes affectées (`.select('id')`) et on vérifie qu'il n'est
 *     pas vide avant d'annoncer « enregistré ».
 */
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// ── Types ──

type Compte = {
  id: string
  code: string
  libelle: string
  type: string
  compte_parent_id: string | null
  actif: boolean
  systeme: boolean
  ordre: number | null
  note: string | null
}

type Section = {
  id: string
  dimension: string
  code: string
  libelle: string
  actif: boolean
  systeme: boolean
  ordre: number | null
  note: string | null
}

type ImputationDefaut = {
  /** `null` = clé attendue mais ABSENTE de la base : elle sera créée par upsert. */
  id: string | null
  cle: string
  compte_id: string | null
  activite_id: string | null
  libelle: string | null
  description: string | null
}

type CompteForm = {
  code: string
  libelle: string
  type: string
  compte_parent_id: string
  note: string
}

const TYPES_COMPTE: { value: string; label: string }[] = [
  { value: 'produit', label: 'Produit' },
  { value: 'charge', label: 'Charge' },
  { value: 'tiers', label: 'Tiers' },
  { value: 'tresorerie', label: 'Trésorerie' },
  { value: 'capitaux', label: 'Capitaux' },
  { value: 'immobilisation', label: 'Immobilisation' },
  { value: 'stock', label: 'Stock' },
]

const COULEUR_TYPE: Record<string, { bg: string; fg: string }> = {
  produit: { bg: '#ECFDF5', fg: '#065F46' },
  charge: { bg: '#FEF2F2', fg: '#991B1B' },
  tiers: { bg: '#EFF6FF', fg: '#1E40AF' },
  tresorerie: { bg: '#EEF2FF', fg: '#4338CA' },
  capitaux: { bg: '#FFF7ED', fg: '#9A3412' },
  immobilisation: { bg: '#F5F3FF', fg: '#6D28D9' },
  stock: { bg: '#FEFCE8', fg: '#854D0E' },
}

function labelType(t: string): string {
  return TYPES_COMPTE.find(x => x.value === t)?.label || t || '—'
}

/** Ordre d'affichage des imputations : de la plus structurante à la plus rare. */
const ORDRE_CLES = [
  'poste_defaut',
  'client',
  'banque',
  'caisse',
  'frais_inscription',
  'frais_reinscription',
  'assurance',
  'reduction',
  'avoir',
  'creance_douteuse',
  'perte_creance',
]

/** Libellés de repli si la base ne fournit pas de `libelle`. */
const LIBELLE_CLE: Record<string, string> = {
  poste_defaut: 'Poste sans compte (repli)',
  client: 'Compte client (familles)',
  banque: 'Banque',
  caisse: 'Caisse',
  frais_inscription: 'Frais d’inscription',
  frais_reinscription: 'Frais de réinscription',
  assurance: 'Assurance scolaire',
  reduction: 'Réductions accordées',
  avoir: 'Avoirs',
  creance_douteuse: 'Créances douteuses',
  perte_creance: 'Pertes sur créances',
}

const VIDE_COMPTE: CompteForm = { code: '', libelle: '', type: 'produit', compte_parent_id: '', note: '' }

export default function ComptabiliteTab({ ecoleId }: { ecoleId: string }) {
  const toast = useToast()
  const confirmDialog = useConfirm()

  const [comptes, setComptes] = useState<Compte[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [imputations, setImputations] = useState<ImputationDefaut[]>([])
  const [chargement, setChargement] = useState(true)
  const [busy, setBusy] = useState(false)

  // Plan de comptes
  const [filtreType, setFiltreType] = useState('')
  const [masquerInactifs, setMasquerInactifs] = useState(true)
  const [newCompte, setNewCompte] = useState<CompteForm>(VIDE_COMPTE)
  const [editCompte, setEditCompte] = useState<Compte | null>(null)
  const [editCompteForm, setEditCompteForm] = useState<CompteForm>(VIDE_COMPTE)

  // Axes analytiques
  const [newSection, setNewSection] = useState<Record<string, { code: string; libelle: string }>>({
    activite: { code: '', libelle: '' },
    centre_cout: { code: '', libelle: '' },
  })

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const titreSection: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }
  const aide: React.CSSProperties = { fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', lineHeight: 1.5 }
  const btnPrimaire: React.CSSProperties = { background: '#2563EB', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
  const btnSecondaire: React.CSSProperties = { fontSize: 11, color: '#475569', background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }
  const btnDanger: React.CSSProperties = { fontSize: 11, color: '#EF4444', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }
  const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }

  useEffect(() => { load() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecoleId])

  async function load() {
    if (!ecoleId) return
    setChargement(true)
    const s = createClient()
    // Limites explicites : Supabase plafonne silencieusement à 1000 lignes.
    const [resC, resS, resI] = await Promise.all([
      s.from('comptes_comptables').select('id, code, libelle, type, compte_parent_id, actif, systeme, ordre, note').eq('ecole_id', ecoleId).order('code').limit(2000),
      s.from('sections_analytiques').select('id, dimension, code, libelle, actif, systeme, ordre, note').eq('ecole_id', ecoleId).order('ordre').limit(500),
      s.from('imputations_defaut').select('id, cle, compte_id, activite_id, libelle, description').eq('ecole_id', ecoleId).limit(200),
    ])
    if (resC.error) toast.error('Lecture du plan de comptes impossible : ' + resC.error.message)
    if (resS.error) toast.error('Lecture des axes analytiques impossible : ' + resS.error.message)
    if (resI.error) toast.error('Lecture des imputations impossible : ' + resI.error.message)
    setComptes((resC.data ?? []) as Compte[])
    setSections((resS.data ?? []) as Section[])
    setImputations((resI.data ?? []) as ImputationDefaut[])
    setChargement(false)
  }

  // ── Dérivés ──

  const comptesParId = useMemo(() => {
    const m = new Map<string, Compte>()
    comptes.forEach(c => m.set(c.id, c))
    return m
  }, [comptes])

  const longueurMin = useMemo(() => {
    let min = 99
    comptes.forEach(c => { const l = String(c.code || '').length; if (l > 0 && l < min) min = l })
    return min === 99 ? 3 : min
  }, [comptes])

  /** Profondeur d'un compte : chaîne des parents si renseignée, sinon longueur du code. */
  function niveauDe(c: Compte): number {
    let n = 0
    let parentId: string | null = c.compte_parent_id
    let garde = 0
    while (parentId && garde++ < 12) {
      const p = comptesParId.get(parentId)
      if (!p) break
      n++
      parentId = p.compte_parent_id
    }
    if (n > 0) return n
    return Math.max(0, String(c.code || '').length - longueurMin)
  }

  const comptesAffiches = useMemo(() => {
    return comptes.filter(c => {
      if (filtreType && c.type !== filtreType) return false
      if (masquerInactifs && !c.actif) return false
      return true
    })
  }, [comptes, filtreType, masquerInactifs])

  const nbInactifs = useMemo(() => comptes.filter(c => !c.actif).length, [comptes])
  const activites = useMemo(() => sections.filter(s => s.dimension === 'activite'), [sections])
  const comptesActifs = useMemo(() => comptes.filter(c => c.actif), [comptes])

  /**
   * FIX ssss2 pt5 : la liste affichée est la RÉUNION des clés attendues et des
   * lignes réellement présentes en base.
   *
   * Auparavant l'écran ne montrait que les lignes existantes et ne savait faire
   * qu'un UPDATE. Une école dont `imputations_defaut` était vide (cas d'une
   * école créée sans passer par `proposer_imputations`) voyait donc un écran
   * vide, sans aucun moyen de créer quoi que ce soit — et tout export FEC était
   * refusé. Les clés absentes apparaissent maintenant avec `id = null` et sont
   * créées à la volée par upsert sur (ecole_id, cle) dès qu'on leur affecte un
   * compte (l'index unique `imputations_defaut_uniq` existe en base).
   */
  const imputationsTriees = useMemo<ImputationDefaut[]>(() => {
    const parCle = new Map<string, ImputationDefaut>()
    for (const imp of imputations) parCle.set(imp.cle, imp)
    for (const cle of ORDRE_CLES) {
      if (parCle.has(cle)) continue
      parCle.set(cle, { id: null, cle, compte_id: null, activite_id: null, libelle: null, description: null })
    }
    return Array.from(parCle.values()).sort((a, b) => {
      const ia = ORDRE_CLES.indexOf(a.cle)
      const ib = ORDRE_CLES.indexOf(b.cle)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.cle.localeCompare(b.cle)
    })
  }, [imputations])

  const nbImputationsAbsentes = useMemo(
    () => imputationsTriees.filter(i => !i.id).length,
    [imputationsTriees],
  )

  // ── Plan de comptes : écritures ──

  function validerCompte(f: CompteForm, idCourant?: string): string | null {
    const code = f.code.trim()
    if (!/^[0-9]{2,12}$/.test(code)) return 'Le code doit être un nombre de 2 à 12 chiffres.'
    if (!f.libelle.trim()) return 'Le libellé est obligatoire.'
    if (!f.type) return 'Le type est obligatoire.'
    if (comptes.some(c => c.code === code && c.id !== idCourant)) return `Le code ${code} existe déjà dans votre plan.`
    return null
  }

  async function ajouterCompte() {
    const err = validerCompte(newCompte)
    if (err) { toast.error(err); return }
    setBusy(true)
    const { data, error } = await createClient().from('comptes_comptables').insert({
      ecole_id: ecoleId,
      code: newCompte.code.trim(),
      libelle: newCompte.libelle.trim(),
      type: newCompte.type,
      compte_parent_id: newCompte.compte_parent_id || null,
      note: newCompte.note.trim() || null,
      actif: true,
      systeme: false,
      ordre: comptes.length,
    }).select('id')
    setBusy(false)
    if (error) { toast.error('Création refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Compte non créé : vous n’avez pas les droits d’écriture sur le plan comptable.'); return }
    setNewCompte(VIDE_COMPTE)
    toast.success('Compte créé')
    await load()
  }

  function ouvrirEditionCompte(c: Compte) {
    setEditCompteForm({
      code: c.code || '',
      libelle: c.libelle || '',
      type: c.type || 'produit',
      compte_parent_id: c.compte_parent_id || '',
      note: c.note || '',
    })
    setEditCompte(c)
  }

  async function enregistrerCompte() {
    if (!editCompte) return
    const err = validerCompte(editCompteForm, editCompte.id)
    if (err) { toast.error(err); return }
    if (editCompteForm.compte_parent_id === editCompte.id) { toast.error('Un compte ne peut pas être son propre parent.'); return }
    setBusy(true)
    const { data, error } = await createClient().from('comptes_comptables').update({
      code: editCompteForm.code.trim(),
      libelle: editCompteForm.libelle.trim(),
      type: editCompteForm.type,
      compte_parent_id: editCompteForm.compte_parent_id || null,
      note: editCompteForm.note.trim() || null,
    }).eq('id', editCompte.id).eq('ecole_id', ecoleId).select('id')
    setBusy(false)
    if (error) { toast.error('Modification refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été enregistré : vous n’avez pas les droits sur ce compte.'); return }
    setEditCompte(null)
    toast.success('Compte enregistré')
    await load()
  }

  async function basculerCompte(c: Compte) {
    const { data, error } = await createClient().from('comptes_comptables')
      .update({ actif: !c.actif }).eq('id', c.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Modification refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été enregistré : vous n’avez pas les droits sur ce compte.'); return }
    setComptes(p => p.map(x => x.id === c.id ? { ...x, actif: !c.actif } : x))
    toast.success(c.actif ? 'Compte désactivé' : 'Compte activé')
  }

  async function supprimerCompte(c: Compte) {
    if (c.systeme) { toast.error('Ce compte est livré par TalmidApp : il peut être désactivé ou renommé, pas supprimé.'); return }
    const ok = await confirmDialog({
      title: 'Supprimer ce compte ?',
      message: `« ${c.code} — ${c.libelle} » sera supprimé du plan. Les factures déjà émises conservent l’imputation recopiée au moment de leur création. Si des postes tarifaires pointent encore dessus, la suppression sera refusée par la base.`,
      danger: true,
    })
    if (!ok) return
    const { data, error } = await createClient().from('comptes_comptables')
      .delete().eq('id', c.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Suppression refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été supprimé : vous n’avez pas les droits sur ce compte.'); return }
    toast.success('Compte supprimé')
    await load()
  }

  /**
   * Restaure le paramétrage livré.
   *
   * FIX ssss2 pt5 : `seed_plan_comptable` sème `comptes_comptables` et
   * `sections_analytiques`, mais PAS `imputations_defaut` — ce sont
   * `proposer_imputations` qui les crée. Comme cet écran ne faisait que des
   * UPDATE sur `imputations_defaut`, une école créée sans passer par
   * `proposer_imputations` restait à zéro imputation, sans aucun moyen d'en
   * créer depuis l'interface, et TOUT export FEC était refusé avec « clé
   * d'imputation manquante ». Les deux fonctions sont donc enchaînées ici.
   * `proposer_imputations` est idempotente : elle ne complète que ce qui manque.
   */
  async function restaurerPlan() {
    const ok = await confirmDialog({
      title: 'Restaurer le plan de départ ?',
      message: 'Les comptes, axes et imputations par défaut du modèle TalmidApp absents de votre paramétrage seront recréés. Vos comptes personnels ne sont ni modifiés ni supprimés, et aucun libellé ni aucune imputation existante n’est écrasé.',
    })
    if (!ok) return
    setBusy(true)
    const s = createClient()
    const { error: errSeed } = await s.rpc('seed_plan_comptable', { p_ecole_id: ecoleId })
    if (errSeed) {
      setBusy(false)
      toast.error('Restauration impossible : ' + errSeed.message)
      return
    }
    // Second appel volontairement non bloquant pour le plan de comptes déjà
    // restauré : on signale l'échec sans annuler ce qui a réussi.
    const { error: errImp } = await s.rpc('proposer_imputations', { p_ecole_id: ecoleId })
    setBusy(false)
    if (errImp) {
      toast.error('Plan restauré, mais les imputations par défaut n’ont pas pu être créées : ' + errImp.message)
    } else {
      toast.success('Plan de départ et imputations par défaut restaurés')
    }
    await load()
  }

  // ── Axes analytiques : écritures ──

  /**
   * FIX ssss2 pt6 : la limite est de 20 caractères, pas 40.
   * Le CHECK en base est `^[A-Z0-9_-]{1,20}$` : au-delà de 20, l'insertion
   * était refusée par Postgres après coup, avec un message technique
   * incompréhensible, alors que le champ avait laissé saisir 40 caractères.
   */
  const LONGUEUR_MAX_CODE_SECTION = 20

  function normaliserCodeSection(v: string): string {
    return v.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9_-]/g, '_').slice(0, LONGUEUR_MAX_CODE_SECTION)
  }

  async function ajouterSection(dimension: string) {
    const f = newSection[dimension]
    const code = normaliserCodeSection(f.code)
    if (!code) { toast.error(`Le code est obligatoire (majuscules, chiffres, _ ou -, ${LONGUEUR_MAX_CODE_SECTION} caractères maximum).`); return }
    if (!f.libelle.trim()) { toast.error('Le libellé est obligatoire.'); return }
    if (sections.some(s => s.dimension === dimension && s.code === code)) { toast.error(`Le code ${code} existe déjà sur cet axe.`); return }
    setBusy(true)
    const { data, error } = await createClient().from('sections_analytiques').insert({
      ecole_id: ecoleId,
      dimension,
      code,
      libelle: f.libelle.trim(),
      actif: true,
      systeme: false,
      ordre: sections.filter(s => s.dimension === dimension).length,
    }).select('id')
    setBusy(false)
    if (error) { toast.error('Création refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Section non créée : vous n’avez pas les droits d’écriture.'); return }
    setNewSection(p => ({ ...p, [dimension]: { code: '', libelle: '' } }))
    toast.success('Section créée')
    await load()
  }

  async function renommerSection(sec: Section, libelle: string) {
    const v = libelle.trim()
    if (!v || v === sec.libelle) return
    const { data, error } = await createClient().from('sections_analytiques')
      .update({ libelle: v }).eq('id', sec.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Modification refusée : ' + error.message); await load(); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été enregistré : droits insuffisants.'); await load(); return }
    setSections(p => p.map(x => x.id === sec.id ? { ...x, libelle: v } : x))
    toast.success('Section enregistrée')
  }

  async function basculerSection(sec: Section) {
    const { data, error } = await createClient().from('sections_analytiques')
      .update({ actif: !sec.actif }).eq('id', sec.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Modification refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été enregistré : droits insuffisants.'); return }
    setSections(p => p.map(x => x.id === sec.id ? { ...x, actif: !sec.actif } : x))
    toast.success(sec.actif ? 'Section désactivée' : 'Section activée')
  }

  async function supprimerSection(sec: Section) {
    if (sec.systeme) { toast.error('Cette section est livrée par TalmidApp : elle peut être désactivée ou renommée, pas supprimée.'); return }
    const ok = await confirmDialog({
      title: 'Supprimer cette section ?',
      message: `« ${sec.code} — ${sec.libelle} » sera supprimée. Si des postes tarifaires l’utilisent encore, la suppression sera refusée par la base.`,
      danger: true,
    })
    if (!ok) return
    const { data, error } = await createClient().from('sections_analytiques')
      .delete().eq('id', sec.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Suppression refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été supprimé : droits insuffisants.'); return }
    toast.success('Section supprimée')
    await load()
  }

  // ── Imputations par défaut ──

  /**
   * Enregistre une imputation par défaut.
   *
   * Deux chemins, parce que la ligne peut ne pas exister (cf. `imputationsTriees`) :
   *   - ligne présente  -> UPDATE ciblé, filtré `ecole_id` ;
   *   - ligne absente   -> UPSERT sur (ecole_id, cle), conflit résolu par
   *     l'index unique `imputations_defaut_uniq`. On n'écrit que la clé et le
   *     champ modifié : un upsert « complet » écraserait l'autre champ si deux
   *     onglets travaillaient en parallèle.
   * Dans les deux cas on vérifie le nombre de lignes rendues : sur ce projet un
   * refus RLS ne lève pas d'exception, il touche zéro ligne en silence.
   */
  async function majImputation(imp: ImputationDefaut, champ: 'compte_id' | 'activite_id', valeur: string) {
    const v = valeur || null
    const s = createClient()

    if (!imp.id) {
      const { data, error } = await s.from('imputations_defaut')
        .upsert(
          { ecole_id: ecoleId, cle: imp.cle, [champ]: v, libelle: imp.libelle ?? LIBELLE_CLE[imp.cle] ?? imp.cle },
          { onConflict: 'ecole_id,cle' },
        )
        .select('id, cle, compte_id, activite_id, libelle, description')
      if (error) { toast.error('Création refusée : ' + error.message); return }
      if (!data || data.length === 0) { toast.error('Imputation non créée : vous n’avez pas les droits d’écriture sur les imputations.'); return }
      const creee = data[0] as ImputationDefaut
      setImputations(p => (p.some(x => x.cle === creee.cle) ? p.map(x => x.cle === creee.cle ? creee : x) : [...p, creee]))
      toast.success('Imputation créée')
      return
    }

    const { data, error } = await s.from('imputations_defaut')
      .update({ [champ]: v }).eq('id', imp.id).eq('ecole_id', ecoleId).select('id')
    if (error) { toast.error('Modification refusée : ' + error.message); return }
    if (!data || data.length === 0) { toast.error('Rien n’a été enregistré : vous n’avez pas les droits sur les imputations.'); return }
    setImputations(p => p.map(x => x.id === imp.id ? { ...x, [champ]: v } : x))
    toast.success('Imputation enregistrée')
  }

  /** Options de comptes : les actifs + celui déjà sélectionné même s'il ne l'est plus. */
  function optionsCompte(selectionne: string | null): Compte[] {
    const list = comptesActifs.slice()
    if (selectionne && !list.some(c => c.id === selectionne)) {
      const c = comptesParId.get(selectionne)
      if (c) list.push(c)
    }
    return list.sort((a, b) => a.code.localeCompare(b.code))
  }

  if (chargement) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Chargement du paramétrage comptable…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ─────────── a) PLAN DE COMPTES ─────────── */}
      <div>
        <div style={titreSection}>Plan de comptes</div>
        <div style={{ ...aide, marginBottom: 14 }}>
          Le plan de comptes est la liste des comptes sur lesquels vos factures et vos règlements sont imputés.
          Il est livré pré-rempli d&apos;après la nomenclature de l&apos;enseignement privé (subdivision du PCG).
          Les comptes livrés par TalmidApp peuvent être <strong>renommés et désactivés</strong>, mais pas supprimés :
          ils servent de repère commun et peuvent être référencés par des factures déjà émises.
        </div>

        {/* Ajout */}
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>AJOUTER UN COMPTE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.8fr 1fr 1.4fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CODE</div>
              <input style={inp} value={newCompte.code} onChange={e => setNewCompte(p => ({ ...p, code: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) }))} placeholder="706181" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>LIBELLÉ</div>
              <input style={inp} value={newCompte.libelle} onChange={e => setNewCompte(p => ({ ...p, libelle: e.target.value }))} placeholder="Familles : sorties scolaires" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>TYPE</div>
              <select style={inp} value={newCompte.type} onChange={e => setNewCompte(p => ({ ...p, type: e.target.value }))}>
                {TYPES_COMPTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>COMPTE PARENT (OPTIONNEL)</div>
              <select style={inp} value={newCompte.compte_parent_id} onChange={e => setNewCompte(p => ({ ...p, compte_parent_id: e.target.value }))}>
                <option value="">Aucun</option>
                {comptes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.libelle}</option>)}
              </select>
            </div>
            <button onClick={ajouterCompte} disabled={busy} style={{ ...btnPrimaire, opacity: busy ? 0.6 : 1 }}>+ Ajouter</button>
          </div>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700 }}>TYPE</span>
            <select style={{ ...inp, width: 'auto' }} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
              <option value="">Tous les types</option>
              {TYPES_COMPTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
            <input type="checkbox" checked={masquerInactifs} onChange={e => setMasquerInactifs(e.target.checked)} />
            Masquer les comptes inactifs{nbInactifs > 0 ? ` (${nbInactifs})` : ''}
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={restaurerPlan} disabled={busy} style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '7px 14px', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: busy ? 0.6 : 1 }}>
            Restaurer le plan de départ
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>
          {comptesAffiches.length} compte(s) affiché(s) sur {comptes.length}. Les comptes inactifs restent en base : ils sont livrés éteints pour ne pas surcharger les listes de choix, activez-les si vous en avez l&apos;usage.
        </div>

        {comptesAffiches.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucun compte à afficher. {comptes.length === 0 ? 'Utilisez « Restaurer le plan de départ » pour installer le plan livré.' : 'Modifiez les filtres ci-dessus.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Code', 'Libellé', 'Type', 'Actif', ''].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {comptesAffiches.map((c, i) => {
                const niv = niveauDe(c)
                const coul = COULEUR_TYPE[c.type] || { bg: '#F1F5F9', fg: '#64748B' }
                return (
                  <tr key={c.id} style={{ borderBottom: i < comptesAffiches.length - 1 ? '1px solid #F8FAFC' : 'none', opacity: c.actif ? 1 : 0.55 }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: niv === 0 ? 700 : 500, color: '#1E293B', paddingLeft: 14 + niv * 18 }}>{c.code}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {c.libelle}
                        {c.systeme && (
                          <span title="Compte livré par TalmidApp : renommable et désactivable, non supprimable" style={{ fontSize: 10, background: '#F1F5F9', color: '#64748B', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>Livré</span>
                        )}
                      </span>
                      {c.note && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{c.note}</div>}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 11, background: coul.bg, color: coul.fg, borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>{labelType(c.type)}</span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <button onClick={() => basculerCompte(c)} title={c.actif ? 'Désactiver ce compte' : 'Activer ce compte'}
                        style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: c.actif ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'all 0.2s' }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: c.actif ? 23 : 3, transition: 'all 0.2s' }} />
                      </button>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button onClick={() => ouvrirEditionCompte(c)} style={btnSecondaire}>Modifier</button>
                        {c.systeme ? (
                          <span title="Compte livré par TalmidApp : désactivez-le plutôt que de le supprimer" style={{ fontSize: 10, color: '#CBD5E1' }}>Non supprimable</span>
                        ) : (
                          <button onClick={() => supprimerCompte(c)} style={btnDanger}>Supprimer</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─────────── b) AXES ANALYTIQUES ─────────── */}
      <div>
        <div style={titreSection}>Axes analytiques</div>
        <div style={{ ...aide, marginBottom: 14 }}>
          L&apos;<strong>activité</strong> est le secteur économique de la recette ou de la dépense (enseignement, restauration, transport…) :
          c&apos;est elle qui donne le résultat analytique par secteur, et elle est reprise sur chaque ligne de facture.
          Le <strong>centre de coût</strong> est une dimension libre de gestion interne (site, bâtiment, projet, niveau…) :
          il est facultatif et ne sert qu&apos;à vos propres analyses.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {[
            { dim: 'activite', titre: 'Activités', exemple: 'RESTAURATION' },
            { dim: 'centre_cout', titre: 'Centres de coût', exemple: 'SITE_NORD' },
          ].map(bloc => {
            const liste = sections.filter(s => s.dimension === bloc.dim)
            const f = newSection[bloc.dim] || { code: '', libelle: '' }
            return (
              <div key={bloc.dim} style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                  {bloc.titre} <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400 }}>· {liste.length}</span>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {liste.length === 0 && (
                    <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>Aucune section sur cet axe.</div>
                  )}
                  {liste.map(sec => (
                    <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: sec.actif ? 1 : 0.55 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, background: '#EEF2FF', color: '#4338CA', borderRadius: 5, padding: '3px 8px', whiteSpace: 'nowrap' }}>{sec.code}</span>
                      {/* key sur le libellé : si l'enregistrement échoue, le rechargement
                          remonte un champ neuf et la saisie refusée disparaît de l'écran. */}
                      <input
                        key={sec.id + '|' + sec.libelle}
                        defaultValue={sec.libelle}
                        onBlur={e => renommerSection(sec, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        style={{ ...inp, flex: 1, width: 'auto' }}
                      />
                      {sec.systeme && <span title="Section livrée par TalmidApp : renommable et désactivable, non supprimable" style={{ fontSize: 10, background: '#F1F5F9', color: '#64748B', borderRadius: 5, padding: '2px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>Livrée</span>}
                      <button onClick={() => basculerSection(sec)} style={{ ...btnSecondaire, color: sec.actif ? '#64748B' : '#10B981' }}>{sec.actif ? 'Désactiver' : 'Activer'}</button>
                      {!sec.systeme && <button onClick={() => supprimerSection(sec)} title="Supprimer cette section" style={{ fontSize: 13, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>}
                    </div>
                  ))}
                  <div style={{ marginTop: 4, borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ ...inp, width: 130 }} value={f.code}
                        maxLength={LONGUEUR_MAX_CODE_SECTION}
                        title={`Majuscules, chiffres, _ ou - · ${LONGUEUR_MAX_CODE_SECTION} caractères maximum`}
                        onChange={e => setNewSection(p => ({ ...p, [bloc.dim]: { ...p[bloc.dim], code: normaliserCodeSection(e.target.value) } }))}
                        placeholder={bloc.exemple} />
                      <input style={{ ...inp, flex: 1, width: 'auto' }} value={f.libelle}
                        onChange={e => setNewSection(p => ({ ...p, [bloc.dim]: { ...p[bloc.dim], libelle: e.target.value } }))}
                        placeholder="Libellé"
                        onKeyDown={e => { if (e.key === 'Enter') ajouterSection(bloc.dim) }} />
                      <button onClick={() => ajouterSection(bloc.dim)} disabled={busy} style={{ ...btnPrimaire, opacity: busy ? 0.6 : 1 }}>+</button>
                    </div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 5 }}>
                      Code : majuscules, chiffres, tiret ou souligné — {LONGUEUR_MAX_CODE_SECTION} caractères maximum
                      {f.code ? ` (${f.code.length}/${LONGUEUR_MAX_CODE_SECTION})` : ''}.
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─────────── c) IMPUTATIONS PAR DÉFAUT ─────────── */}
      <div>
        <div style={titreSection}>Imputations par défaut</div>
        <div style={{ ...aide, marginBottom: 14 }}>
          Ces imputations alimentent l&apos;export FEC et toutes les lignes qui ne proviennent pas d&apos;un poste tarifaire :
          contrepartie client, encaissements, frais d&apos;inscription, réductions, avoirs…
          Une clé laissée vide produira des écritures sans compte : votre fichier comptable sera incomplet.
        </div>
        {nbImputationsAbsentes > 0 && (
          <div style={{ ...aide, marginBottom: 14, background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}>
            {nbImputationsAbsentes} clé(s) ne sont pas encore enregistrées pour cette école. Elles apparaissent
            ci-dessous : choisir un compte les crée automatiquement. Vous pouvez aussi utiliser
            « Restaurer le plan de départ » ci-dessus pour installer le paramétrage livré d&apos;un coup.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {imputationsTriees.map(imp => {
              const sansCompte = !imp.compte_id
              return (
                <div key={imp.cle} style={{ border: `1px solid ${sansCompte ? '#FDE68A' : '#E2E8F0'}`, background: sansCompte ? '#FFFBEB' : '#fff', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.2fr) 1.4fr 1fr', gap: 12, alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {imp.libelle || LIBELLE_CLE[imp.cle] || imp.cle}
                        {sansCompte && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#B45309', borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>Compte non défini</span>}
                        {!imp.id && <span title="Clé attendue par l’export FEC mais absente de la base : elle sera créée dès que vous lui affecterez un compte" style={{ fontSize: 10, background: '#F1F5F9', color: '#64748B', borderRadius: 5, padding: '2px 6px', fontWeight: 700 }}>Non enregistrée</span>}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#94A3B8', marginTop: 2 }}>{imp.cle}</div>
                      {imp.description && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 1.45 }}>{imp.description}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>COMPTE</div>
                      <select style={inp} value={imp.compte_id || ''} onChange={e => majImputation(imp, 'compte_id', e.target.value)}>
                        <option value="">— Aucun compte —</option>
                        {optionsCompte(imp.compte_id).map(c => (
                          <option key={c.id} value={c.id}>{c.code} — {c.libelle}{c.actif ? '' : ' (inactif)'}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>ACTIVITÉ</div>
                      <select style={inp} value={imp.activite_id || ''} onChange={e => majImputation(imp, 'activite_id', e.target.value)}>
                        <option value="">— Aucune —</option>
                        {activites.filter(a => a.actif || a.id === imp.activite_id).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.libelle}{a.actif ? '' : ' (inactive)'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* ─────────── Modale d'édition d'un compte ─────────── */}
      {editCompte && (
        <div onClick={() => !busy && setEditCompte(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>Modifier le compte</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 18 }}>
              {editCompte.systeme
                ? 'Ce compte est livré par TalmidApp : vous pouvez le renommer et le désactiver, mais pas le supprimer.'
                : 'Compte créé par votre école.'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>CODE</div>
                  <input style={inp} value={editCompteForm.code} onChange={e => setEditCompteForm(p => ({ ...p, code: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) }))} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>LIBELLÉ</div>
                  <input style={inp} value={editCompteForm.libelle} onChange={e => setEditCompteForm(p => ({ ...p, libelle: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>TYPE</div>
                  <select style={inp} value={editCompteForm.type} onChange={e => setEditCompteForm(p => ({ ...p, type: e.target.value }))}>
                    {TYPES_COMPTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>COMPTE PARENT</div>
                  <select style={inp} value={editCompteForm.compte_parent_id} onChange={e => setEditCompteForm(p => ({ ...p, compte_parent_id: e.target.value }))}>
                    <option value="">Aucun</option>
                    {comptes.filter(c => c.id !== editCompte.id).map(c => <option key={c.id} value={c.id}>{c.code} — {c.libelle}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>NOTE (OPTIONNELLE)</div>
                <textarea style={{ ...inp, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} value={editCompteForm.note} onChange={e => setEditCompteForm(p => ({ ...p, note: e.target.value }))} placeholder="Précision interne sur l’usage de ce compte" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setEditCompte(null)} disabled={busy} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>Annuler</button>
              <button onClick={enregistrerCompte} disabled={busy} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
