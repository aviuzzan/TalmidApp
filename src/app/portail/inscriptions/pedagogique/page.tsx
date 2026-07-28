'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { useI18n } from '@/lib/i18n'

/**
 * Fiche pédagogique = formulaire pour AJOUTER UN NOUVEL ENFANT à la famille.
 * Pour les enfants existants (réinscriptions), utiliser /portail/inscriptions/contrat.
 */

type EnfantExistant = {
  id: string
  prenom: string
  nom: string
  date_naissance: string
  statut_inscription: string | null
}

export default function PedagogiqueNouvelEnfantPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const parent = useParentCtx()
  const { t } = useI18n()
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  // Enfant deja present en base sans fiche pour l'annee → chemin de reprise proposé au parent
  const [reuseEnfant, setReuseEnfant] = useState<EnfantExistant | null>(null)
  const [docsConfig, setDocsConfig] = useState<any[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Garde anti-perte : formulaire modifié / demande soumise
  const dirtyRef = useRef(false)
  const submittedRef = useRef(false)

  // Form
  const [prenom, setPrenom] = useState('')
  const [deuxiemePrenom, setDeuxiemePrenom] = useState('')
  const [nom, setNom] = useState('')
  const [genre, setGenre] = useState<'M' | 'F' | ''>('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [lieuNaissance, setLieuNaissance] = useState('')

  const [secteurSouhaite, setSecteurSouhaite] = useState('')
  const [classeSouhaitee, setClasseSouhaitee] = useState('')
  const [dateEntreeSouhaitee, setDateEntreeSouhaitee] = useState('')

  const [dejaScolarise, setDejaScolarise] = useState(false)
  const [etablissementPrecedent, setEtablissementPrecedent] = useState('')

  const [transport, setTransport] = useState(false)
  const [instructionReligieuse, setInstructionReligieuse] = useState(true)
  const [etudeGarderie, setEtudeGarderie] = useState(false)
  const [optionsConfig, setOptionsConfig] = useState<any[]>([])
  const [optionsChoisies, setOptionsChoisies] = useState<Record<string, boolean>>({})

  const [signesParticuliers, setSignesParticuliers] = useState('')
  const [medecinNom, setMedecinNom] = useState('')
  const [medecinTelephone, setMedecinTelephone] = useState('')

  const [urgence1Nom, setUrgence1Nom] = useState('')
  const [urgence1Tel, setUrgence1Tel] = useState('')
  const [urgence1Lien, setUrgence1Lien] = useState('')
  const [urgence2Nom, setUrgence2Nom] = useState('')
  const [urgence2Tel, setUrgence2Tel] = useState('')
  const [urgence2Lien, setUrgence2Lien] = useState('')

  useEffect(() => { load() }, [])

  // Garde beforeunload : ~50 champs, on previent la fermeture / le rechargement
  // si le formulaire a ete modifie et pas encore soumis avec succes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !submittedRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [{ data: sec }, { data: cls }, { data: docs }, { data: opts }] = await Promise.all([
      s.from('secteurs').select('id, nom').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('classes').select('id, nom, secteur_id').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('inscription_documents_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).eq('actif', true).order('ordre'),
      s.from('options_enfant_config').select('id, code, label, ordre').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
    ])
    setSecteurs(sec ?? []); setClasses(cls ?? []); setDocsConfig(docs ?? [])
    setOptionsConfig(opts ?? [])
    // Initialiser les valeurs par défaut (par compat avec les anciens codes)
    const defaults: Record<string, boolean> = {}
    ;(opts ?? []).forEach((o: any) => { defaults[o.code] = o.code === 'instruction_religieuse' })
    setOptionsChoisies(defaults)
    setLoading(false)
  }

  // Normalisation pour la detection de doublons : accents (é == e), casse, espaces.
  // NFD decompose les caracteres accentues, puis on retire les marques diacritiques
  // (plage combinante U+0300 → U+036F), sans regex pour rester compatible cible ES5.
  function normaliser(v: string): string {
    return Array.from(v.normalize('NFD'))
      .filter(c => { const cp = c.charCodeAt(0); return cp < 0x0300 || cp > 0x036f })
      .join('')
      .trim()
      .toLowerCase()
  }

  // Validation complete : retourne TOUS les champs / justificatifs manquants d'un coup
  // (au lieu d'une erreur a la fois, boucle frustrante pour le parent).
  function validerFormulaire(): string[] {
    const manquants: string[] = []
    const labelDe = (key: string) => t(key).replace(/\s*\*\s*$/, '')
    const requis = (manque: boolean, labelKey: string) => {
      if (manque) manquants.push(t('portail.peda.err.field_required', { label: labelDe(labelKey) }, 'Le champ « {label} » est obligatoire.'))
    }
    requis(!prenom.trim(), 'portail.peda.field.prenom')
    requis(!nom.trim(), 'portail.peda.field.nom')
    requis(!genre, 'portail.peda.field.genre')
    requis(!dateNaissance, 'portail.peda.field.date_naissance')
    if (!classeSouhaitee) manquants.push(t('portail.peda.err.class_required'))
    docsConfig.filter(d => d.obligatoire && !selectedFiles[d.id]).forEach(d => {
      manquants.push(t('portail.peda.err.doc_required', { label: d.label }))
    })
    return manquants
  }

  async function soumettre() {
    setErrors([]); setSuccess(''); setReuseEnfant(null)

    const manquants = validerFormulaire()
    if (manquants.length > 0) { setErrors(manquants); return }

    setSaving(true)
    const s = createClient()

    // 0. Anti-doublon insensible aux accents : on charge la fratrie (RLS limite deja
    //    a la famille) puis on compare prenom/nom normalises + date de naissance,
    //    plutot qu'un ilike qui ne matche pas "Rachel"/"Rachèl".
    const { data: fratrie } = await s.from('enfants')
      .select('id, prenom, nom, date_naissance, statut_inscription')
      .eq('famille_id', familleId)
    const doublon = (fratrie ?? []).find((e: any) =>
      normaliser(String(e.prenom || '')) === normaliser(prenom) &&
      normaliser(String(e.nom || '')) === normaliser(nom) &&
      e.date_naissance === dateNaissance)

    if (doublon) {
      // Enfant deja scolarise → la reinscription passe par le contrat, pas par cette fiche.
      if (doublon.statut_inscription === 'inscrit') {
        setErrors([t('portail.peda.err.duplicate', { prenom: doublon.prenom, nom: doublon.nom, date: doublon.date_naissance, statut: doublon.statut_inscription || 'en_attente' })])
        setSaving(false)
        return
      }
      // L'enfant existe deja : a-t-il deja une fiche pedagogique pour cette annee ?
      const { data: fiches } = await s.from('inscriptions_pedagogiques')
        .select('id')
        .eq('enfant_id', doublon.id)
        .eq('annee_scolaire', anneeInscription)
        .limit(1)
      if (fiches && fiches.length > 0) {
        setErrors([t('portail.peda.err.deja_deposee', { prenom: doublon.prenom, nom: doublon.nom, annee: anneeInscription }, "Une demande d'admission a déjà été déposée pour {prenom} {nom} pour l'année {annee}. Inutile d'en déposer une nouvelle — contactez l'école si besoin.")])
        setSaving(false)
        return
      }
      // Enfant existant SANS fiche pour cette annee (ex : creation restee orpheline apres
      // un echec precedent, ou demande d'une annee passee) → chemin de reprise : on propose
      // de deposer la fiche pour CET enfant au lieu de bloquer le parent dans une impasse.
      setReuseEnfant(doublon as EnfantExistant)
      setSaving(false)
      return
    }

    await finaliser(null)
  }

  /** Cree l'enfant (ou reutilise un enfant existant) puis depose la fiche pedagogique. */
  async function finaliser(enfantExistant: EnfantExistant | null) {
    setErrors([]); setSuccess('')
    const manquants = validerFormulaire()
    if (manquants.length > 0) { setErrors(manquants); setSaving(false); return }

    setSaving(true)
    const s = createClient()

    let enfantId = ''
    let enfantFraichementCree = false

    if (enfantExistant) {
      // Chemin de reprise : on reutilise l'enfant existant au lieu d'en creer un doublon.
      enfantId = enfantExistant.id
      // Best-effort : remettre l'enfant dans le circuit de la nouvelle annee
      // (policy UPDATE parent existante sur enfants).
      await s.from('enfants')
        .update({ annee_scolaire: anneeInscription, statut_inscription: 'en_attente' })
        .eq('id', enfantId)
    } else {
      // 1. Créer l'enfant
      const { data: nouvelEnfant, error: insErr } = await s
        .from('enfants')
        .insert({
          famille_id: familleId,
          prenom, deuxieme_prenom: deuxiemePrenom || null, nom,
          genre, date_naissance: dateNaissance, lieu_naissance: lieuNaissance || null,
          annee_scolaire: anneeInscription,
          statut_inscription: 'en_attente',
        })
        .select()
        .single()

      if (insErr || !nouvelEnfant) {
        setErrors([t('portail.peda.err.create_child', { msg: insErr?.message || t('portail.peda.err.unknown') })])
        setSaving(false)
        return
      }
      enfantId = nouvelEnfant.id
      enfantFraichementCree = true
    }

    // 2. Créer la fiche pédagogique
    const classeChoisie = classes.find(c => c.id === classeSouhaitee)
    const { error: pedErr } = await s.from('inscriptions_pedagogiques').insert({
      ecole_id: ecoleId,
      famille_id: familleId,
      enfant_id: enfantId,
      annee_scolaire: anneeInscription,
      secteur_souhaite_id: secteurSouhaite || classeChoisie?.secteur_id || null,
      classe_souhaitee: classeChoisie?.nom || null,
      date_entree_souhaitee: dateEntreeSouhaitee || null,
      deja_scolarise: dejaScolarise,
      etablissement_precedent: etablissementPrecedent || null,
      transport, instruction_religieuse: instructionReligieuse, etude_garderie: etudeGarderie,
      options_choisies: optionsChoisies,
      signes_particuliers: signesParticuliers || null,
      medecin_nom: medecinNom || null,
      medecin_telephone: medecinTelephone || null,
      urgence_1_nom: urgence1Nom || null,
      urgence_1_tel: urgence1Tel || null,
      urgence_1_lien: urgence1Lien || null,
      urgence_2_nom: urgence2Nom || null,
      urgence_2_tel: urgence2Tel || null,
      urgence_2_lien: urgence2Lien || null,
      statut: 'soumis',
      soumis_le: new Date().toISOString(),
    })

    if (pedErr) {
      // Compensation : ne pas laisser un enfant orphelin (sans fiche) qui bloquerait
      // ensuite tout retry via l'anti-doublon → impasse definitive pour le parent.
      // NB RLS : il n'existe PAS de policy DELETE parent sur `enfants` a ce jour,
      // le delete est donc best-effort ; on verifie son effet reel via .select()
      // et, s'il est bloque, on bascule sur le chemin de reprise (reutilisation).
      let orphelin: EnfantExistant | null = enfantExistant
      if (enfantFraichementCree) {
        orphelin = { id: enfantId, prenom: prenom.trim(), nom: nom.trim(), date_naissance: dateNaissance, statut_inscription: 'en_attente' }
        try {
          const { data: supprimes } = await s.from('enfants').delete().eq('id', enfantId).select('id')
          if (supprimes && supprimes.length > 0) orphelin = null // suppression effective → retry propre
        } catch { /* best-effort */ }
      }
      setReuseEnfant(orphelin)
      setErrors([t('portail.peda.err.fiche_retry', { msg: pedErr.message }, "La fiche pédagogique n'a pas pu être enregistrée ({msg}). Votre demande n'a pas encore été déposée : vérifiez votre connexion puis réessayez.")])
      setSaving(false)
      return
    }

    // 3. Upload des pièces justificatives (best-effort)
    const filesToUpload = Object.entries(selectedFiles)
    if (filesToUpload.length > 0) {
      const { data: { session: sess } } = await s.auth.getSession()
      for (const [configId, file] of filesToUpload) {
        const cfg = docsConfig.find(d => d.id === configId)
        const fd = new FormData()
        fd.append('file', file)
        fd.append('familleId', familleId)
        fd.append('enfantId', enfantId)
        fd.append('configId', configId)
        fd.append('label', cfg?.label || file.name)
        fd.append('target', 'inscription')
        try {
          await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${sess?.access_token}` }, body: fd })
        } catch { /* best-effort */ }
      }
    }

    // Notif admin (best-effort)
    try {
      // FIX secu 27/07 : notify-admin exige désormais un Bearer token
      const { data: { session } } = await s.auth.getSession()
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
        body: JSON.stringify({
          ecole_id: ecoleId,
          famille_id: familleId,
          type: 'fiche_pedagogique',
          info: { enfant_prenom: prenom, enfant_nom: nom },
        }),
      })
    } catch {}

    submittedRef.current = true
    setReuseEnfant(null)
    setSaving(false)
    setSuccess(t('portail.peda.success', { prenom, nom, annee: anneeInscription }))
    setTimeout(() => router.push('/portail/inscriptions'), 3500)
  }

  // Sortie de page avec confirmation si le formulaire a ete modifie sans etre soumis.
  function quitter() {
    if (dirtyRef.current && !submittedRef.current) {
      const ok = window.confirm(t('portail.peda.confirm_leave', 'Des modifications non enregistrées seront perdues. Quitter cette page ?'))
      if (!ok) return
    }
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

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }

  // Filtrer les classes selon le secteur si choisi
  const classesAffichees = secteurSouhaite ? classes.filter(c => c.secteur_id === secteurSouhaite) : classes

  return (
    <div onChangeCapture={() => { dirtyRef.current = true }}
      style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, sans-serif' }}>
      <button onClick={quitter}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>
        {t('portail.peda.back')}
      </button>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.peda.title')}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }} dangerouslySetInnerHTML={{ __html: t('portail.peda.intro') }} />
      </div>

      {success && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '14px 16px', color: '#059669', fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* État civil */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.civil')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.prenom')}</label><input style={inp} value={prenom} onChange={e => setPrenom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.nom')}</label><input style={inp} value={nom} onChange={e => setNom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.deuxieme_prenom')}</label><input style={inp} value={deuxiemePrenom} onChange={e => setDeuxiemePrenom(e.target.value)} /></div>
          <div>
            <label style={lbl}>{t('portail.peda.field.genre')}</label>
            <select style={inp} value={genre} onChange={e => setGenre(e.target.value as 'M' | 'F')}>
              <option value="">{t('portail.peda.choose')}</option>
              <option value="M">{t('portail.peda.genre.m')}</option>
              <option value="F">{t('portail.peda.genre.f')}</option>
            </select>
          </div>
          <div><label style={lbl}>{t('portail.peda.field.date_naissance')}</label><input style={inp} type="date" value={dateNaissance} onChange={e => setDateNaissance(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.lieu_naissance')}</label><input style={inp} value={lieuNaissance} onChange={e => setLieuNaissance(e.target.value)} /></div>
        </div>
      </div>

      {/* Scolarité demandée */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.scolarite')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>{t('portail.peda.field.secteur')}</label>
            <select style={inp} value={secteurSouhaite} onChange={e => { setSecteurSouhaite(e.target.value); setClasseSouhaitee('') }}>
              <option value="">{t('portail.peda.choose')}</option>
              {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>{t('portail.peda.field.classe')}</label>
            <select style={inp} value={classeSouhaitee} onChange={e => setClasseSouhaitee(e.target.value)}>
              <option value="">{t('portail.peda.choose')}</option>
              {classesAffichees.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div><label style={lbl}>{t('portail.peda.field.date_entree')}</label><input style={inp} type="date" value={dateEntreeSouhaitee} onChange={e => setDateEntreeSouhaitee(e.target.value)} /></div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={dejaScolarise} onChange={e => setDejaScolarise(e.target.checked)} style={{ accentColor: '#2563EB' }} />
          {t('portail.peda.deja_scolarise')}
        </label>
        {dejaScolarise && (
          <div><label style={lbl}>{t('portail.peda.field.etablissement_precedent')}</label><input style={inp} value={etablissementPrecedent} onChange={e => setEtablissementPrecedent(e.target.value)} /></div>
        )}
      </div>

      {/* Options */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10, marginBottom: 8 }}>{t('portail.peda.section.options')}</div>
        {optionsConfig.length === 0 && (
          <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>{t('portail.peda.options.none')}</div>
        )}
        {optionsConfig.map(o => {
          const checked = !!optionsChoisies[o.code]
          return (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={e => {
                const v = e.target.checked
                setOptionsChoisies(p => ({ ...p, [o.code]: v }))
                // Compat colonnes legacy
                if (o.code === 'transport') setTransport(v)
                if (o.code === 'instruction_religieuse') setInstructionReligieuse(v)
                if (o.code === 'etude_garderie') setEtudeGarderie(v)
              }} style={{ accentColor: '#2563EB' }} /> {o.label}
            </label>
          )
        })}
      </div>

      {/* Santé */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.sante')}</div>
        <div>
          <label style={lbl}>{t('portail.peda.field.signes')}</label>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={signesParticuliers} onChange={e => setSignesParticuliers(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.medecin')}</label><input style={inp} value={medecinNom} onChange={e => setMedecinNom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.medecin_tel')}</label><input style={inp} value={medecinTelephone} onChange={e => setMedecinTelephone(e.target.value)} /></div>
        </div>
      </div>

      {/* Urgences */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.urgences')}</div>
        <div style={{ fontSize: 12, color: '#64748B' }}>{t('portail.peda.contact1')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.nom_prenom')}</label><input style={inp} value={urgence1Nom} onChange={e => setUrgence1Nom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.telephone')}</label><input style={inp} value={urgence1Tel} onChange={e => setUrgence1Tel(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.lien')}</label><input style={inp} value={urgence1Lien} onChange={e => setUrgence1Lien(e.target.value)} placeholder={t('portail.peda.placeholder.lien')} /></div>
        </div>
        <div style={{ fontSize: 12, color: '#64748B' }}>{t('portail.peda.contact2')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div><label style={lbl}>{t('portail.peda.field.nom_prenom')}</label><input style={inp} value={urgence2Nom} onChange={e => setUrgence2Nom(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.telephone')}</label><input style={inp} value={urgence2Tel} onChange={e => setUrgence2Tel(e.target.value)} /></div>
          <div><label style={lbl}>{t('portail.peda.field.lien')}</label><input style={inp} value={urgence2Lien} onChange={e => setUrgence2Lien(e.target.value)} /></div>
        </div>
      </div>

      {/* Pièces justificatives */}
      {docsConfig.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{t('portail.peda.section.docs')}</div>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t('portail.peda.docs.help')}</p>
          {docsConfig.map((doc: any) => {
            const picked = selectedFiles[doc.id]
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: picked ? 'rgba(16,185,129,0.06)' : '#F8FAFC', border: `1px solid ${picked ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{doc.label}{doc.obligatoire && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}</div>
                  {doc.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{doc.description}</div>}
                  {picked && <div style={{ fontSize: 11, color: '#10B981', marginTop: 3 }}>✓ {picked.name} ({Math.round(picked.size / 1024)} {t('portail.documents.size.kb')})</div>}
                </div>
                <input ref={(el: HTMLInputElement | null) => { fileRefs.current[doc.id] = el }} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFiles(p => ({ ...p, [doc.id]: f })) }} />
                <button type="button" onClick={() => fileRefs.current[doc.id]?.click()}
                  style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: picked ? 'rgba(16,185,129,0.1)' : '#2563EB', color: picked ? '#10B981' : '#fff', border: picked ? '1px solid rgba(16,185,129,0.3)' : 'none', whiteSpace: 'nowrap' }}>
                  {picked ? t('portail.peda.docs.replace') : t('portail.peda.docs.attach')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', color: '#DC2626', fontSize: 13 }}>
          {errors.length === 1 ? (
            <>⚠️ {errors[0]}</>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠️ {t('portail.peda.err.multi_title', 'Veuillez corriger les points suivants :')}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {errors.map((er, i) => <li key={i}>{er}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {reuseEnfant && !success && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#92400E', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            {t('portail.peda.reuse.body', { prenom: reuseEnfant.prenom, nom: reuseEnfant.nom, date: reuseEnfant.date_naissance, annee: anneeInscription },
              "{prenom} {nom} (né(e) le {date}) figure déjà dans votre famille mais n'a pas encore de demande d'admission pour {annee}. Vous pouvez déposer la fiche pédagogique pour cet enfant, sans créer de doublon.")}
          </div>
          <button type="button" onClick={() => finaliser(reuseEnfant)} disabled={saving}
            style={{ alignSelf: 'flex-start', background: '#D97706', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {t('portail.peda.reuse.cta', { prenom: reuseEnfant.prenom }, 'Déposer la fiche pédagogique pour {prenom}')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={quitter}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
          {t('portail.common.cancel')}
        </button>
        <button onClick={soumettre} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? t('portail.peda.saving') : t('portail.peda.submit')}
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>
        {t('portail.peda.fees_note')}
      </div>
    </div>
  )
}
