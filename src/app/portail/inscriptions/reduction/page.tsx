'use client'
import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

const PIECES_DEFAULT = [
  '3 derniers bulletins de salaire ou justificatifs France Travail',
  'Bulletin de salaire de décembre ou justificatif des revenus annuels',
  "Avis d'imposition 2025 sur revenus 2024 (document complet avec QR code)",
  'Attestation de paiement des allocations familiales (moins de 3 mois)',
  'Attestation de quotient familial de la CAF',
  "Dernière quittance de loyer ou tableau d'amortissement",
  "Justificatif de règlement des scolarités dans les autres écoles juives",
]

export default function DemandeReductionPage() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [demande, setDemande] = useState<any>(null)
  const [docsConfig, setDocsConfig] = useState<any[]>([])
  const [docsUploaded, setDocsUploaded] = useState<Record<string, any>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  // State formulaire — tout contrôlé, scroll fix via useLayoutEffect
  const scrollY = useRef(0)
  useLayoutEffect(() => { window.scrollTo(0, scrollY.current) })
  const ks = () => { scrollY.current = window.scrollY } // keepScroll

  const [famForm, setFamForm] = useState<any>({})
  const [famModified, setFamModified] = useState(false)
  const [enfantsDossier, setEnfantsDossier] = useState<any[]>([])
  const [inscPed, setInscPed] = useState<any[]>([])
  const [revenus, setRevenus] = useState<any[]>([
    { nom_prenom: '', lien_parente: '', employeur: '', salaire_mensuel_net: '', nb_mois: 12 }
  ])
  const [situation, setSituation] = useState('marie')
  const [logementType, setLogementType] = useState('locataire')
  const [logementPieces, setLogementPieces] = useState('')
  const [logementLoyer, setLogementLoyer] = useState('')
  const [logementCharges, setLogementCharges] = useState('')
  const [quotientFamilial, setQuotientFamilial] = useState('')
  const [allocFamiliales, setAllocFamiliales] = useState('')
  const [allocChomage, setAllocChomage] = useState('')
  const [apl, setApl] = useState('')
  const [autresRevenus, setAutresRevenus] = useState('')
  const [tarifPropose, setTarifPropose] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [attestationLieu, setAttestationLieu] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session: sess } } = await s.auth.getSession()
    if (!sess) { router.push('/login'); return }
    setSession(sess)

    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', sess.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [{ data: fam }, { data: enf }, { data: cls }, { data: sec },
      { data: dem }, { data: docs }, { data: inscped }] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*, classes(id, nom, secteur_id, secteurs(nom))').eq('famille_id', profile.famille_id),
      s.from('classes').select('id, nom, secteur_id, secteurs(nom)').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('reduction_documents_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).eq('actif', true).order('ordre'),
      s.from('inscriptions_pedagogiques').select('*, enfants(id, prenom, nom)').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).in('statut', ['soumis', 'accepte']),
    ])

    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? []); setSecteurs(sec ?? [])
    setDocsConfig(docs?.length ? docs : PIECES_DEFAULT.map((label, i) => ({ id: `default_${i}`, label, obligatoire: i < 6 })))
    setInscPed(inscped ?? [])

    if (fam) {
      setFamForm(fam)
      setSituation(fam.situation_maritale || 'marie')
    }

    if (dem) {
      setDemande(dem)
      setSituation(dem.situation_familiale || 'marie')
      setLogementType(dem.logement_type || 'locataire')
      setLogementPieces(dem.logement_nb_pieces?.toString() || '')
      setLogementLoyer(dem.logement_loyer_mensuel?.toString() || '')
      setLogementCharges(dem.logement_charges_mensuelles?.toString() || '')
      setQuotientFamilial(dem.quotient_familial?.toString() || '')
      setAllocFamiliales(dem.alloc_familiales_mensuelles?.toString() || '')
      setAllocChomage(dem.alloc_chomage_mensuelle?.toString() || '')
      setApl(dem.apl_mensuelle?.toString() || '')
      setAutresRevenus(dem.autres_revenus_mensuels?.toString() || '')
      setTarifPropose(dem.tarif_propose?.toString() || '')
      setCommentaire(dem.commentaire || '')
      if (dem.enfants_dossier) setEnfantsDossier(dem.enfants_dossier)

      const { data: revs } = await s.from('demandes_reduction_revenus').select('*').eq('demande_id', dem.id)
      if (revs?.length) setRevenus(revs.map(r => ({ ...r, salaire_mensuel_net: r.salaire_mensuel_net?.toString() || '' })))

      const { data: docsUp } = await s.from('reduction_documents_uploaded').select('*').eq('demande_id', dem.id)
      const m: Record<string, any> = {}
      docsUp?.forEach(d => { m[d.config_id || d.label] = d })
      setDocsUploaded(m)
    }
    setLoading(false)
  }

  function setFam(key: string, val: any) {
    setFamForm((p: any) => ({ ...p, [key]: val }))
    setFamModified(true)
  }

  function toggleEnfant(enfantId: string, classeSuivante: string) {
    ks()
    setEnfantsDossier(prev => {
      const exists = prev.find(e => e.enfant_id === enfantId)
      if (exists) return prev.filter(e => e.enfant_id !== enfantId)
      return [...prev, { enfant_id: enfantId, classe_souhaitee: classeSuivante }]
    })
  }

  function setClasseEnfant(enfantId: string, classe: string) {
    ks()
    setEnfantsDossier(prev => prev.map(e => e.enfant_id === enfantId ? { ...e, classe_souhaitee: classe } : e))
  }

  const classesSorted = classes.map(c => c.nom).sort()
  function getClasseSuivante(classeActuelle: string): string {
    const idx = classesSorted.indexOf(classeActuelle)
    return idx >= 0 && idx < classesSorted.length - 1 ? classesSorted[idx + 1] : classeActuelle
  }

  const nbEnfantsTotal = enfantsDossier.length
  const nbParSecteur = () => {
    const map: Record<string, number> = {}
    enfantsDossier.forEach(ed => {
      const cls = classes.find(c => c.nom === ed.classe_souhaitee)
      const sec = secteurs.find(s => s.id === cls?.secteur_id)
      if (sec) map[sec.nom] = (map[sec.nom] || 0) + 1
    })
    return map
  }

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function uploadDoc(configId: string, label: string, file: File) {
    setUploading(p => ({ ...p, [configId]: true }))
    let demandeIdActuel = demande?.id
    if (!demandeIdActuel) {
      const s = createClient()
      const { data: nd } = await s.from('demandes_reduction').insert({
        famille_id: familleId, ecole_id: ecoleId, annee_scolaire: ANNEE_COURANTE, statut: 'brouillon',
      }).select().single()
      demandeIdActuel = nd?.id
      if (nd) setDemande(nd)
    }
    const fd = new FormData()
    fd.append('file', file); fd.append('demandeId', demandeIdActuel || '')
    fd.append('familleId', familleId); fd.append('configId', configId); fd.append('label', label)
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` }, body: fd })
    const json = await res.json()
    if (json.success) setDocsUploaded(p => ({ ...p, [configId]: { url: json.url, nom_fichier: json.nom, taille_ko: json.taille_ko } }))
    setUploading(p => ({ ...p, [configId]: false }))
  }

  async function soumettre() {
    if (enfantsDossier.length === 0) { alert('Sélectionnez au moins un enfant'); return }
    if (!tarifPropose) { alert('Saisissez votre tarif annuel proposé'); return }
    if (!attestationLieu) { alert('Renseignez le lieu de l\'attestation'); return }

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

    const payload: any = {
      famille_id: familleId, ecole_id: ecoleId, annee_scolaire: ANNEE_COURANTE,
      statut: 'soumis', soumis_le: new Date().toISOString(),
      situation_familiale: situation,
      logement_type: logementType,
      logement_nb_pieces: logementPieces ? parseInt(logementPieces) : null,
      logement_loyer_mensuel: logementLoyer ? parseFloat(logementLoyer) : null,
      logement_charges_mensuelles: logementCharges ? parseFloat(logementCharges) : null,
      quotient_familial: quotientFamilial ? parseFloat(quotientFamilial) : null,
      alloc_familiales_mensuelles: allocFamiliales ? parseFloat(allocFamiliales) : null,
      alloc_chomage_mensuelle: allocChomage ? parseFloat(allocChomage) : null,
      apl_mensuelle: apl ? parseFloat(apl) : null,
      autres_revenus_mensuels: autresRevenus ? parseFloat(autresRevenus) : null,
      tarif_propose: parseFloat(tarifPropose),
      nb_enfants_concernes: nbEnfantsTotal,
      enfants_dossier: enfantsDossier,
      commentaire: commentaire || null,
      attestation_honneur: true,
      attestation_lieu: attestationLieu,
      attestation_date: new Date().toISOString().split('T')[0],
    }

    let demandeId = demande?.id
    if (demandeId) {
      await s.from('demandes_reduction').update(payload).eq('id', demandeId)
      await s.from('demandes_reduction_revenus').delete().eq('demande_id', demandeId)
    } else {
      const { data: nd } = await s.from('demandes_reduction').insert(payload).select().single()
      demandeId = nd?.id
    }

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
            <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 4 }}>{parseFloat(demande.tarif_accorde).toLocaleString('fr-FR')} €</div>
          </div>
        )}
      </div>
    )
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
      {children}
    </div>
  )

  const secteurCounts = nbParSecteur()
  const tousEnfants = [
    ...enfants.map(e => ({ ...e, source: 'base', classeActuelle: e.classes?.nom || '' })),
    ...inscPed.filter(ip => !enfants.find(e => e.id === ip.enfant_id)).map((ip: any) => ({
      id: ip.enfant_id, prenom: ip.enfants?.prenom, nom: ip.enfants?.nom, source: 'inscription_ped', classeActuelle: '',
    })),
  ]

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>
        ← Retour
      </button>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>Demande de réduction {ANNEE_COURANTE}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>Toutes les informations sont confidentielles. Les champs * sont obligatoires.</p>
      </div>

      {/* ── 1. RESPONSABLE 1 ── */}
      <Section title="1. Vos informations — Responsable 1">
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Vérifiez et corrigez si nécessaire — vos informations seront mises à jour.</p>
        <div>
          <label style={lbl}>Situation familiale *</label>
          <select style={inp} value={situation} onChange={e => { ks(); setSituation(e.target.value); setFamModified(true) }}>
            <option value="marie">Marié(e)</option><option value="veuf">Veuf/Veuve</option>
            <option value="divorce">Divorcé(e)</option><option value="autre">Autre</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Prénom *</label>
            <input style={inp} value={famForm.parent1_prenom || ''} onChange={e => { ks(); setFam('parent1_prenom', e.target.value) }} /></div>
          <div><label style={lbl}>Nom *</label>
            <input style={inp} value={famForm.parent1_nom || ''} onChange={e => { ks(); setFam('parent1_nom', e.target.value) }} /></div>
          <div><label style={lbl}>Adresse *</label>
            <input style={inp} value={famForm.parent1_adresse || ''} onChange={e => { ks(); setFam('parent1_adresse', e.target.value) }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>CP *</label>
              <input style={inp} value={famForm.parent1_code_postal || ''} onChange={e => { ks(); setFam('parent1_code_postal', e.target.value) }} /></div>
            <div><label style={lbl}>Ville *</label>
              <input style={inp} value={famForm.parent1_ville || ''} onChange={e => { ks(); setFam('parent1_ville', e.target.value) }} /></div>
          </div>
          <div><label style={lbl}>Téléphone *</label>
            <input style={inp} value={famForm.parent1_telephone || ''} onChange={e => { ks(); setFam('parent1_telephone', e.target.value) }} /></div>
          <div><label style={lbl}>Email *</label>
            <input style={inp} type="email" value={famForm.parent1_email || ''} onChange={e => { ks(); setFam('parent1_email', e.target.value) }} /></div>
        </div>
      </Section>

      {/* ── 2. RESPONSABLE 2 ── */}
      <Section title="2. Responsable 2 (si applicable)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Prénom</label>
            <input style={inp} value={famForm.parent2_prenom || ''} onChange={e => { ks(); setFam('parent2_prenom', e.target.value) }} /></div>
          <div><label style={lbl}>Nom</label>
            <input style={inp} value={famForm.parent2_nom || ''} onChange={e => { ks(); setFam('parent2_nom', e.target.value) }} /></div>
          <div><label style={lbl}>Téléphone</label>
            <input style={inp} value={famForm.parent2_telephone || ''} onChange={e => { ks(); setFam('parent2_telephone', e.target.value) }} /></div>
          <div><label style={lbl}>Email</label>
            <input style={inp} type="email" value={famForm.parent2_email || ''} onChange={e => { ks(); setFam('parent2_email', e.target.value) }} /></div>
        </div>
      </Section>

      {/* ── 3. ENFANTS ── */}
      <Section title="3. Enfants concernés par la demande *">
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Sélectionnez les enfants et indiquez la classe souhaitée.</p>
        {tousEnfants.map(enfant => {
          const selected = enfantsDossier.find(e => e.enfant_id === enfant.id)
          const classeSuivante = getClasseSuivante(enfant.classeActuelle)
          return (
            <div key={enfant.id} style={{ border: `2px solid ${selected ? '#2563EB' : '#E2E8F0'}`, borderRadius: 12, padding: 16, background: selected ? '#EFF6FF' : '#fff', transition: 'border-color 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="checkbox" checked={!!selected}
                  onChange={() => toggleEnfant(enfant.id, classeSuivante)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2563EB', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                    {enfant.classeActuelle ? `Classe actuelle : ${enfant.classeActuelle}` : 'Nouvel élève'}
                    {enfant.source === 'inscription_ped' && <span style={{ background: '#FEF3C7', color: '#D97706', borderRadius: 4, padding: '2px 6px', marginLeft: 8, fontSize: 10, fontWeight: 600 }}>Inscription en cours</span>}
                  </div>
                </div>
              </div>
              {selected && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #BFDBFE' }}>
                  <label style={lbl}>Classe souhaitée 2026/2027 *</label>
                  <select style={inp} value={selected.classe_souhaitee || ''} onChange={e => setClasseEnfant(enfant.id, e.target.value)}>
                    <option value="">— Choisir une classe —</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.nom}>{c.nom}{c.secteurs?.nom ? ` — ${c.secteurs.nom}` : ''}{c.nom === classeSuivante ? ' ★' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}
        {nbEnfantsTotal > 0 && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 4 }}>Récapitulatif</div>
            <div style={{ fontSize: 13, color: '#1E293B' }}>
              Total : <strong>{nbEnfantsTotal} enfant{nbEnfantsTotal > 1 ? 's' : ''}</strong>
              {Object.entries(secteurCounts).map(([sec, nb]) => ` · ${nb} en ${sec}`)}
            </div>
          </div>
        )}
      </Section>

      {/* ── 4. LOGEMENT ── */}
      <Section title="4. Logement">
        <div>
          <label style={lbl}>Type de logement *</label>
          <select style={inp} value={logementType} onChange={e => { ks(); setLogementType(e.target.value) }}>
            <option value="proprietaire">Propriétaire</option>
            <option value="locataire">Locataire</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Nb de pièces</label>
            <input style={inp} type="number" value={logementPieces} onChange={e => { ks(); setLogementPieces(e.target.value) }} /></div>
          <div><label style={lbl}>Loyer/remb. mensuel (€)</label>
            <input style={inp} type="number" value={logementLoyer} onChange={e => { ks(); setLogementLoyer(e.target.value) }} /></div>
          <div><label style={lbl}>Charges mensuelles (€)</label>
            <input style={inp} type="number" value={logementCharges} onChange={e => { ks(); setLogementCharges(e.target.value) }} /></div>
        </div>
      </Section>

      {/* ── 5. REVENUS ── */}
      <Section title="5. Revenus du foyer *">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Quotient familial CAF (€) *</label>
            <input style={inp} type="number" value={quotientFamilial} onChange={e => { ks(); setQuotientFamilial(e.target.value) }} /></div>
        </div>
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Détail des revenus par personne *</div>
          {revenus.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Nom/Prénom</label>
                <input style={inp} value={r.nom_prenom} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, nom_prenom: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Lien</label>
                <input style={inp} value={r.lien_parente} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, lien_parente: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Employeur</label>
                <input style={inp} value={r.employeur} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, employeur: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Salaire net</label>
                <input style={inp} type="number" value={r.salaire_mensuel_net} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, salaire_mensuel_net: e.target.value } : x)) }} /></div>
              <div><label style={{ ...lbl, marginBottom: 3 }}>Nb mois</label>
                <input style={inp} type="number" min="1" max="12" value={r.nb_mois} onChange={e => { ks(); setRevenus(p => p.map((x, j) => j === i ? { ...x, nb_mois: parseInt(e.target.value) || 12 } : x)) }} /></div>
              <div style={{ paddingBottom: 2 }}>
                {i > 0 && <button onClick={() => { ks(); setRevenus(p => p.filter((_, j) => j !== i)) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 20, lineHeight: 1 }}>×</button>}
              </div>
            </div>
          ))}
          <button onClick={() => { ks(); setRevenus(p => [...p, { nom_prenom: '', lien_parente: '', employeur: '', salaire_mensuel_net: '', nb_mois: 12 }]) }}
            style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, marginTop: 4 }}>
            + Ajouter une personne
          </button>
        </div>
      </Section>

      {/* ── 6. ALLOCATIONS ── */}
      <Section title="6. Allocations et autres revenus">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lbl}>Allocations familiales (€/mois)</label>
            <input style={inp} type="number" value={allocFamiliales} onChange={e => { ks(); setAllocFamiliales(e.target.value) }} /></div>
          <div><label style={lbl}>Allocation chômage (€/mois)</label>
            <input style={inp} type="number" value={allocChomage} onChange={e => { ks(); setAllocChomage(e.target.value) }} /></div>
          <div><label style={lbl}>APL / Aide logement (€/mois)</label>
            <input style={inp} type="number" value={apl} onChange={e => { ks(); setApl(e.target.value) }} /></div>
          <div><label style={lbl}>Autres revenus divers (€/mois)</label>
            <input style={inp} type="number" value={autresRevenus} onChange={e => { ks(); setAutresRevenus(e.target.value) }} /></div>
        </div>
      </Section>

      {/* ── 7. PROPOSITION ── */}
      <Section title="7. Votre proposition tarifaire">
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#1D4ED8', marginBottom: 10, fontWeight: 600 }}>
            Dossier pour <strong>{nbEnfantsTotal} enfant{nbEnfantsTotal > 1 ? 's' : ''}</strong>
            {Object.entries(secteurCounts).map(([sec, nb]) => ` — ${nb} en ${sec}`)}
          </div>
          <label style={lbl}>Tarif annuel proposé pour l'ensemble du dossier (€) *</label>
          <input style={{ ...inp, fontSize: 18, fontWeight: 700, color: '#1D4ED8', textAlign: 'center', padding: '12px' }}
            type="number" value={tarifPropose} placeholder="Ex: 3 000"
            onChange={e => { ks(); setTarifPropose(e.target.value) }} />
        </div>
      </Section>

      {/* ── 8. COMMENTAIRE ── */}
      <Section title="8. Commentaire (optionnel)">
        <textarea style={{ ...inp, minHeight: 100, resize: 'vertical' }} value={commentaire}
          onChange={e => { ks(); setCommentaire(e.target.value) }}
          placeholder="Précisions sur votre situation..." />
      </Section>

      {/* ── 9. PIÈCES JUSTIFICATIVES ── */}
      {docsConfig.length > 0 && (
        <Section title="9. Pièces justificatives">
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>PDF, JPG ou PNG — max 10 Mo. Les documents * sont obligatoires.</p>
          {docsConfig.map(doc => {
            const uploaded = docsUploaded[doc.id]
            const isUploading = uploading[doc.id]
            return (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: uploaded ? 'rgba(16,185,129,0.06)' : '#F8FAFC', border: `1px solid ${uploaded ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1E293B' }}>{doc.label}{doc.obligatoire && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}</div>
                  {uploaded && <div style={{ fontSize: 11, color: '#10B981', marginTop: 3 }}>✓ {uploaded.nom_fichier} ({uploaded.taille_ko} Ko)</div>}
                </div>
                <input ref={el => { fileRefs.current[doc.id] = el }} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(doc.id, doc.label, f) }} />
                <button onClick={() => fileRefs.current[doc.id]?.click()} disabled={isUploading}
                  style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: isUploading ? 'not-allowed' : 'pointer', background: uploaded ? 'rgba(16,185,129,0.1)' : '#2563EB', color: uploaded ? '#10B981' : '#fff', border: uploaded ? '1px solid rgba(16,185,129,0.3)' : 'none', opacity: isUploading ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {isUploading ? 'Upload...' : uploaded ? '↺ Remplacer' : '📎 Joindre'}
                </button>
              </div>
            )
          })}
        </Section>
      )}

      {/* ── ATTESTATION ── */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Attestation sur l'honneur</div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, margin: '0 0 14px' }}>
          En soumettant ce dossier, je soussigné(e) <strong>{famForm.parent1_prenom} {famForm.parent1_nom}</strong>, atteste sur l'honneur que tous les renseignements portés sont conformes, sincères et véritables.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Fait à *</label>
            <input style={inp} value={attestationLieu} onChange={e => { ks(); setAttestationLieu(e.target.value) }} placeholder="Ville" /></div>
          <div><label style={lbl}>Le</label>
            <input style={inp} type="date" defaultValue={new Date().toISOString().split('T')[0]} /></div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
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
