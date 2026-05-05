'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

export default function DemandeReductionPage() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Données
  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [demande, setDemande] = useState<any>(null)
  const [docsConfig, setDocsConfig] = useState<any[]>([])
  const [questionsConfig, setQuestionsConfig] = useState<any[]>([])
  const [docsUploaded, setDocsUploaded] = useState<Record<string, any>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // Formulaire famille (modifiable)
  const [famForm, setFamForm] = useState<any>({})
  const [famModified, setFamModified] = useState(false)

  // Enfants sélectionnés pour le dossier
  const [enfantsDossier, setEnfantsDossier] = useState<any[]>([]) // [{enfant_id, classe_souhaitee}]

  // Inscriptions pédagogiques en cours (enfants non encore en base)
  const [inscPed, setInscPed] = useState<any[]>([])

  // Réponses aux questions
  const [reponses, setReponses] = useState<Record<string, any>>({})

  // Revenus
  const [revenus, setRevenus] = useState<any[]>([{ nom_prenom: '', lien_parente: '', employeur: '', qualification: '', salaire_mensuel_net: '', nb_mois: 12 }])

  // Commentaire + attestation
  const [commentaire, setCommentaire] = useState('')

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
      { data: inscped },
    ] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*, classes(id, nom, secteur_id, secteurs(nom))').eq('famille_id', profile.famille_id),
      s.from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('reduction_documents_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).eq('actif', true).order('ordre'),
      s.from('reduction_questions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).eq('actif', true).order('ordre'),
      s.from('inscriptions_pedagogiques').select('*, enfants(prenom, nom)').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).in('statut', ['soumis', 'accepte']),
    ])

    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? []); setSecteurs(sec ?? [])
    setDocsConfig(docs ?? []); setQuestionsConfig(questions ?? [])
    setInscPed(inscped ?? [])

    // Pré-remplir formulaire famille
    if (fam) {
      setFamForm({
        parent1_prenom: fam.parent1_prenom || '',
        parent1_nom: fam.parent1_nom || '',
        parent1_email: fam.parent1_email || '',
        parent1_telephone: fam.parent1_telephone || '',
        parent1_adresse: fam.parent1_adresse || '',
        parent1_numero_rue: fam.parent1_numero_rue || '',
        parent1_code_postal: fam.parent1_code_postal || '',
        parent1_ville: fam.parent1_ville || '',
        parent2_prenom: fam.parent2_prenom || '',
        parent2_nom: fam.parent2_nom || '',
        parent2_email: fam.parent2_email || '',
        parent2_telephone: fam.parent2_telephone || '',
        situation_maritale: fam.situation_maritale || 'marie',
      })
    }

    if (dem) {
      setDemande(dem)
      // Recharger réponses depuis la demande
      const rep: Record<string, any> = {}
      questions?.forEach(q => { if (dem[q.cle] !== undefined) rep[q.cle] = dem[q.cle] })
      setReponses(rep)
      setCommentaire(dem.commentaire || '')
      // Recharger revenus
      const { data: revs } = await s.from('demandes_reduction_revenus').select('*').eq('demande_id', dem.id)
      if (revs?.length) setRevenus(revs)
      // Recharger docs uploadés
      const { data: docsUp } = await s.from('reduction_documents_uploaded').select('*').eq('demande_id', dem.id)
      const docsMap: Record<string, any> = {}
      docsUp?.forEach(d => { docsMap[d.config_id || d.label] = d })
      setDocsUploaded(docsMap)
      // Recharger enfants du dossier
      if (dem.enfants_dossier) setEnfantsDossier(dem.enfants_dossier)
    }

    setLoading(false)
  }

  function setFam(key: string, val: any) {
    setFamForm((p: any) => ({ ...p, [key]: val }))
    setFamModified(true)
  }

  function setRep(key: string, val: any) {
    setReponses(p => ({ ...p, [key]: val }))
  }

  function toggleEnfant(enfantId: string, classeActuelle: string) {
    setEnfantsDossier(prev => {
      const exists = prev.find(e => e.enfant_id === enfantId)
      if (exists) return prev.filter(e => e.enfant_id !== enfantId)
      return [...prev, { enfant_id: enfantId, classe_souhaitee: classeActuelle || '' }]
    })
  }

  function setClasseEnfant(enfantId: string, classe: string) {
    setEnfantsDossier(prev => prev.map(e => e.enfant_id === enfantId ? { ...e, classe_souhaitee: classe } : e))
  }

  // Calcul auto nb enfants par secteur
  const nbParSecteur = () => {
    const map: Record<string, number> = {}
    enfantsDossier.forEach(ed => {
      const enfant = [...enfants, ...inscPed.map((ip: any) => ip.enfants)].find((e: any) => e?.id === ed.enfant_id)
      const cls = classes.find(c => c.nom === ed.classe_souhaitee)
      const sec = secteurs.find(s => s.id === cls?.secteur_id)
      if (sec) map[sec.nom] = (map[sec.nom] || 0) + 1
    })
    return map
  }

  const nbEnfantsTotal = enfantsDossier.length

  // Upload fichier
  async function uploadDoc(configId: string, label: string, file: File) {
    setUploading(p => ({ ...p, [configId]: true }))

    // Créer ou récupérer la demande d'abord si elle n'existe pas
    let demandeIdActuel = demande?.id
    if (!demandeIdActuel) {
      const s = createClient()
      const { data: newDem } = await s.from('demandes_reduction').insert({
        famille_id: familleId, ecole_id: ecoleId,
        annee_scolaire: ANNEE_COURANTE, statut: 'brouillon',
      }).select().single()
      demandeIdActuel = newDem?.id
      if (newDem) setDemande(newDem)
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('demandeId', demandeIdActuel || '')
    fd.append('familleId', familleId)
    fd.append('configId', configId)
    fd.append('label', label)

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
      body: fd,
    })
    const json = await res.json()
    if (json.success) {
      setDocsUploaded(p => ({ ...p, [configId]: { url: json.url, nom_fichier: json.nom, taille_ko: json.taille_ko } }))
    } else {
      alert('Erreur upload : ' + json.error)
    }
    setUploading(p => ({ ...p, [configId]: false }))
  }

  // Validation + soumission
  async function soumettre() {
    // Vérifications
    if (enfantsDossier.length === 0) { alert('Sélectionnez au moins un enfant'); return }

    const docsObligatoires = docsConfig.filter(d => d.obligatoire)
    const docsMissing = docsObligatoires.filter(d => !docsUploaded[d.id])
    if (docsMissing.length > 0) {
      alert(`Pièces manquantes :\n${docsMissing.map(d => '- ' + d.label).join('\n')}`)
      return
    }

    const questionsObligatoires = questionsConfig.filter(q => q.obligatoire)
    const qMissing = questionsObligatoires.filter(q => !reponses[q.cle] && reponses[q.cle] !== 0)
    if (qMissing.length > 0) {
      alert(`Questions obligatoires manquantes :\n${qMissing.map(q => '- ' + q.label).join('\n')}`)
      return
    }

    setSaving(true)
    const s = createClient()

    // Mettre à jour les infos famille si modifiées
    if (famModified) {
      await s.from('familles').update({
        parent1_prenom: famForm.parent1_prenom,
        parent1_nom: famForm.parent1_nom,
        parent1_email: famForm.parent1_email,
        parent1_telephone: famForm.parent1_telephone,
        parent1_adresse: famForm.parent1_adresse,
        parent1_numero_rue: famForm.parent1_numero_rue,
        parent1_code_postal: famForm.parent1_code_postal,
        parent1_ville: famForm.parent1_ville,
        parent2_prenom: famForm.parent2_prenom,
        parent2_nom: famForm.parent2_nom,
        parent2_email: famForm.parent2_email,
        parent2_telephone: famForm.parent2_telephone,
        situation_maritale: famForm.situation_maritale,
      }).eq('id', familleId)
    }

    const parSecteur = nbParSecteur()

    const payload: any = {
      famille_id: familleId, ecole_id: ecoleId,
      annee_scolaire: ANNEE_COURANTE, statut: 'soumis',
      soumis_le: new Date().toISOString(),
      situation_familiale: famForm.situation_maritale,
      nb_enfants_concernes: nbEnfantsTotal,
      enfants_dossier: enfantsDossier,
      commentaire,
      tarif_propose: reponses['tarif_propose'] || null,
    }

    // Injecter toutes les réponses aux questions
    questionsConfig.forEach(q => { if (reponses[q.cle] !== undefined) payload[q.cle] = reponses[q.cle] })

    let demandeId = demande?.id
    if (demandeId) {
      await s.from('demandes_reduction').update(payload).eq('id', demandeId)
      await s.from('demandes_reduction_revenus').delete().eq('demande_id', demandeId)
    } else {
      const { data: nd } = await s.from('demandes_reduction').insert(payload).select().single()
      demandeId = nd?.id

      // Mettre à jour les URLs des docs avec le bon demandeId
      if (demandeId) {
        await s.from('reduction_documents_uploaded').update({ demande_id: demandeId })
          .eq('famille_id', familleId).is('demande_id', null)
      }
    }

    // Sauvegarder les revenus
    if (demandeId) {
      const revsFiltres = revenus.filter(r => r.nom_prenom?.trim())
      if (revsFiltres.length > 0) {
        await s.from('demandes_reduction_revenus').insert(
          revsFiltres.map(r => ({ ...r, demande_id: demandeId, salaire_mensuel_net: parseFloat(r.salaire_mensuel_net) || 0 }))
        )
      }
    }

    setSaving(false)
    router.push('/portail/inscriptions')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  if (demande && ['soumis', 'en_etude', 'accepte', 'refuse'].includes(demande.statut)) {
    const st = formatStatut(demande.statut)
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>← Retour</button>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📨</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>Demande soumise</h2>
        <p style={{ color: '#64748B', fontSize: 14, margin: '8px 0 20px' }}>Votre dossier est en cours d'examen.</p>
        <span style={{ fontSize: 14, fontWeight: 700, color: st.color, background: st.bg, padding: '8px 20px', borderRadius: 20 }}>{st.label}</span>
        {demande.tarif_accorde && (
          <div style={{ marginTop: 24, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>Tarif accordé</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 4 }}>{demande.tarif_accorde?.toLocaleString('fr-FR')} €</div>
          </div>
        )}
      </div>
    )
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
      {children}
    </div>
  )

  const secteurCounts = nbParSecteur()

  // Trouver la classe suivante d'un enfant
  const classesSorted = classes.map(c => c.nom).sort()
  function getClasseSuivante(classeActuelle: string): string {
    if (!classeActuelle) return ''
    const idx = classesSorted.indexOf(classeActuelle)
    return idx >= 0 && idx < classesSorted.length - 1 ? classesSorted[idx + 1] : classeActuelle
  }

  // Tous les enfants éligibles (en base + inscriptions pédagogiques en cours)
  const tousEnfants = [
    ...enfants.map(e => ({ ...e, source: 'base', classeActuelle: e.classes?.nom || '' })),
    ...inscPed.filter(ip => !enfants.find(e => e.id === ip.enfant_id)).map(ip => ({
      id: ip.enfant_id, prenom: ip.enfants?.prenom, nom: ip.enfants?.nom,
      source: 'inscription_ped', classeActuelle: '',
    })),
  ]

  const questionsParSection = (section: string) => questionsConfig.filter(q => q.section === section)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>
        ← Retour
      </button>

      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>Demande de réduction {ANNEE_COURANTE}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>Toutes les informations sont confidentielles. Les champs marqués * sont obligatoires.</p>
      </div>

      {/* ── SECTION 1 : INFOS FAMILLE ── */}
      <Section title="1. Vos informations — Responsable 1">
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Ces informations sont pré-remplies depuis votre dossier. Vous pouvez les corriger si nécessaire — elles seront mises à jour dans votre dossier.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Situation familiale *</label>
            <select style={inp} value={famForm.situation_maritale || ''} onChange={e => setFam('situation_maritale', e.target.value)}>
              <option value="marie">Marié(e)</option>
              <option value="veuf">Veuf/Veuve</option>
              <option value="divorce">Divorcé(e)</option>
              <option value="autre">Autre</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Prénom *</label><input style={inp} value={famForm.parent1_prenom || ''} onChange={e => setFam('parent1_prenom', e.target.value)} /></div>
          <div><label style={lbl}>Nom *</label><input style={inp} value={famForm.parent1_nom || ''} onChange={e => setFam('parent1_nom', e.target.value)} /></div>
          <div><label style={lbl}>Adresse *</label><input style={inp} value={famForm.parent1_adresse || ''} onChange={e => setFam('parent1_adresse', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Code postal *</label><input style={inp} value={famForm.parent1_code_postal || ''} onChange={e => setFam('parent1_code_postal', e.target.value)} /></div>
            <div><label style={lbl}>Ville *</label><input style={inp} value={famForm.parent1_ville || ''} onChange={e => setFam('parent1_ville', e.target.value)} /></div>
          </div>
          <div><label style={lbl}>Téléphone *</label><input style={inp} value={famForm.parent1_telephone || ''} onChange={e => setFam('parent1_telephone', e.target.value)} /></div>
          <div><label style={lbl}>Email *</label><input style={inp} type="email" value={famForm.parent1_email || ''} onChange={e => setFam('parent1_email', e.target.value)} /></div>
        </div>
      </Section>

      <Section title="2. Responsable 2 (si applicable)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Prénom</label><input style={inp} value={famForm.parent2_prenom || ''} onChange={e => setFam('parent2_prenom', e.target.value)} /></div>
          <div><label style={lbl}>Nom</label><input style={inp} value={famForm.parent2_nom || ''} onChange={e => setFam('parent2_nom', e.target.value)} /></div>
          <div><label style={lbl}>Téléphone</label><input style={inp} value={famForm.parent2_telephone || ''} onChange={e => setFam('parent2_telephone', e.target.value)} /></div>
          <div><label style={lbl}>Email</label><input style={inp} type="email" value={famForm.parent2_email || ''} onChange={e => setFam('parent2_email', e.target.value)} /></div>
        </div>
      </Section>

      {/* ── SECTION 3 : ENFANTS ── */}
      <Section title="3. Enfants concernés par la demande *">
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Sélectionnez les enfants pour lesquels vous faites la demande et indiquez la classe souhaitée.</p>
        {tousEnfants.map(enfant => {
          const selected = enfantsDossier.find(e => e.enfant_id === enfant.id)
          const classeSuivante = getClasseSuivante(enfant.classeActuelle)
          return (
            <div key={enfant.id} style={{ border: `1px solid ${selected ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: 14, background: selected ? '#EFF6FF' : '#F8FAFC' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selected} onChange={() => toggleEnfant(enfant.id, classeSuivante)} style={{ width: 16, height: 16 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</span>
                  {enfant.source === 'inscription_ped' && (
                    <span style={{ fontSize: 10, background: '#FEF3C7', color: '#D97706', borderRadius: 4, padding: '2px 6px', marginLeft: 8, fontWeight: 600 }}>Inscription en cours</span>
                  )}
                  {enfant.classeActuelle && <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>Classe actuelle : {enfant.classeActuelle}</span>}
                </div>
              </label>
              {selected && (
                <div style={{ marginTop: 10, marginLeft: 28 }}>
                  <label style={lbl}>Classe souhaitée 2026/2027 *</label>
                  <select style={{ ...inp }} value={selected.classe_souhaitee || ''} onChange={e => setClasseEnfant(enfant.id, e.target.value)}>
                    <option value="">Choisir une classe</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.nom}>
                        {c.nom}{c.secteurs?.nom ? ` (${c.secteurs.nom})` : ''}{c.nom === classeSuivante ? ' ← suggérée' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}

        {/* Résumé par secteur */}
        {nbEnfantsTotal > 0 && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>Récapitulatif de la demande</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>
                Total : <strong>{nbEnfantsTotal} enfant{nbEnfantsTotal > 1 ? 's' : ''}</strong>
              </div>
              {Object.entries(secteurCounts).map(([sec, nb]) => (
                <div key={sec} style={{ fontSize: 12, color: '#2563EB' }}>{sec} : {nb as number}</div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── SECTION 4 : LOGEMENT ── */}
      {questionsParSection('logement').length > 0 && (
        <Section title="4. Logement">
          {questionsParSection('logement').map(q => <QuestionField key={q.id} q={q} val={reponses[q.cle]} onChange={(v: any) => setRep(q.cle, v)} inp={inp} lbl={lbl} />)}
        </Section>
      )}

      {/* ── SECTION 5 : REVENUS ── */}
      <Section title="5. Revenus du foyer *">
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Listez toutes les personnes percevant des revenus au foyer.</p>
        {questionsParSection('revenus').map(q => <QuestionField key={q.id} q={q} val={reponses[q.cle]} onChange={(v: any) => setRep(q.cle, v)} inp={inp} lbl={lbl} />)}

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Détail des revenus par personne *</div>
          {revenus.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Nom / Prénom</label><input style={inp} placeholder="Jean Dupont" value={r.nom_prenom} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, nom_prenom: e.target.value } : x))} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Lien</label><input style={inp} placeholder="Père" value={r.lien_parente} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, lien_parente: e.target.value } : x))} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Employeur</label><input style={inp} value={r.employeur} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, employeur: e.target.value } : x))} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Salaire net/mois</label><input style={inp} type="number" value={r.salaire_mensuel_net} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, salaire_mensuel_net: e.target.value } : x))} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Nb mois</label><input style={inp} type="number" min="1" max="12" value={r.nb_mois} onChange={e => setRevenus(p => p.map((x, j) => j === i ? { ...x, nb_mois: parseInt(e.target.value) || 12 } : x))} /></div>
              <div style={{ paddingBottom: 2 }}>
                {i > 0 && <button onClick={() => setRevenus(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 20, lineHeight: 1 }}>×</button>}
              </div>
            </div>
          ))}
          <button onClick={() => setRevenus(p => [...p, { nom_prenom: '', lien_parente: '', employeur: '', qualification: '', salaire_mensuel_net: '', nb_mois: 12 }])}
            style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, marginTop: 4 }}>
            + Ajouter une personne
          </button>
        </div>
      </Section>

      {/* ── SECTION 6 : ALLOCATIONS ── */}
      {questionsParSection('allocations').length > 0 && (
        <Section title="6. Allocations et autres revenus">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {questionsParSection('allocations').map(q => <QuestionField key={q.id} q={q} val={reponses[q.cle]} onChange={(v: any) => setRep(q.cle, v)} inp={inp} lbl={lbl} />)}
          </div>
        </Section>
      )}

      {/* ── SECTION 7 : PROPOSITION ── */}
      <Section title="7. Votre proposition tarifaire">
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#1D4ED8', marginBottom: 12, fontWeight: 600 }}>
            Dossier pour <strong>{nbEnfantsTotal} enfant{nbEnfantsTotal > 1 ? 's' : ''}</strong>
            {Object.entries(secteurCounts).map(([sec, nb]) => ` — ${nb} en ${sec}`).join('')}
          </div>
          <div>
            <label style={lbl}>Tarif annuel proposé pour l'ensemble du dossier (€) *</label>
            <input style={{ ...inp, fontSize: 18, fontWeight: 700, color: '#1D4ED8', textAlign: 'center', padding: '12px' }}
              type="number" value={reponses['tarif_propose'] || ''} placeholder="Ex: 3 000"
              onChange={e => setRep('tarif_propose', parseFloat(e.target.value) || '')} />
          </div>
        </div>
      </Section>

      {/* ── SECTION 8 : COMMENTAIRE ── */}
      <Section title="8. Commentaire (optionnel)">
        <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={commentaire}
          onChange={e => setCommentaire(e.target.value)}
          placeholder="Précisions sur votre situation, éléments que vous souhaitez porter à la connaissance de la commission..." />
      </Section>

      {/* ── SECTION 9 : PIÈCES JUSTIFICATIVES ── */}
      {docsConfig.length > 0 && (
        <Section title="9. Pièces justificatives">
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
            PDF, JPG ou PNG — max 10 Mo par fichier.
            Les documents marqués * sont obligatoires.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {docsConfig.map(doc => {
              const uploaded = docsUploaded[doc.id]
              const isUploading = uploading[doc.id]
              return (
                <DocUploadRow key={doc.id} doc={doc} uploaded={uploaded} uploading={isUploading}
                  onUpload={(file) => uploadDoc(doc.id, doc.label, file)} />
              )
            })}
          </div>
        </Section>
      )}

      {/* ── ATTESTATION ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Attestation sur l'honneur</div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, margin: 0 }}>
          En soumettant ce dossier, je soussigné(e) <strong>{famForm.parent1_prenom} {famForm.parent1_nom}</strong>, atteste sur l'honneur que tous les renseignements portés sont conformes, sincères et véritables. J'accepte que l'établissement transmette les informations nécessaires à tout organisme susceptible d'accorder une aide. Je m'engage à informer le service comptabilité de toute modification de ma situation.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <div><label style={lbl}>Fait à *</label><input style={inp} value={reponses['attestation_lieu'] || ''} onChange={e => setRep('attestation_lieu', e.target.value)} placeholder="Ville" /></div>
          <div><label style={lbl}>Le</label><input style={inp} type="date" defaultValue={new Date().toISOString().split('T')[0]} onChange={e => setRep('attestation_date', e.target.value)} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={() => router.push('/portail/inscriptions')}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
          Annuler
        </button>
        <button onClick={soumettre} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Envoi...' : '📨 Soumettre le dossier'}
        </button>
      </div>
    </div>
  )
}

// Composant question dynamique
function QuestionField({ q, val, onChange, inp, lbl }: { q: any; val: any; onChange: (v: any) => void; inp: any; lbl: any }) {
  if (q.type === 'select') {
    const options = q.cle === 'logement_type'
      ? [['proprietaire', 'Propriétaire'], ['locataire', 'Locataire'], ['autre', 'Autre']]
      : (q.options || [])
    return (
      <div>
        <label style={lbl}>{q.label}{q.obligatoire ? ' *' : ''}</label>
        <select style={inp} value={val || ''} onChange={e => onChange(e.target.value)}>
          <option value="">Choisir...</option>
          {options.map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    )
  }
  if (q.type === 'textarea') return (
    <div>
      <label style={lbl}>{q.label}{q.obligatoire ? ' *' : ''}</label>
      <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={val || ''} onChange={e => onChange(e.target.value)} />
    </div>
  )
  return (
    <div>
      <label style={lbl}>{q.label}{q.obligatoire ? ' *' : ''}</label>
      <input style={inp} type={q.type === 'number' ? 'number' : 'text'} value={val || ''} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

// Composant upload document
function DocUploadRow({ doc, uploaded, uploading, onUpload }: { doc: any; uploaded: any; uploading: boolean; onUpload: (f: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: uploaded ? 'rgba(16,185,129,0.06)' : '#F8FAFC',
      border: `1px solid ${uploaded ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`,
      borderRadius: 10, padding: '12px 16px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>
          {doc.label}{doc.obligatoire && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
        </div>
        {uploaded && (
          <div style={{ fontSize: 11, color: '#10B981', marginTop: 3 }}>
            ✓ {uploaded.nom_fichier} ({uploaded.taille_ko} Ko)
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{
          fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
          background: uploaded ? 'rgba(16,185,129,0.1)' : '#2563EB',
          color: uploaded ? '#10B981' : '#fff',
          border: uploaded ? '1px solid rgba(16,185,129,0.3)' : 'none',
          opacity: uploading ? 0.7 : 1, whiteSpace: 'nowrap',
        }}>
        {uploading ? 'Upload...' : uploaded ? '↺ Remplacer' : '📎 Joindre'}
      </button>
    </div>
  )
}
