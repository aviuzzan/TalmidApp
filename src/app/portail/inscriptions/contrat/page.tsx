'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

export default function ContratPage() {
  const router = useRouter()
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [famille, setFamille] = useState<any>(null)
  const [famForm, setFamForm] = useState<any>({})
  const [famModified, setFamModified] = useState(false)
  const [enfants, setEnfants] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [modes, setModes] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [paiementConfig, setPaiementConfig] = useState<any>(null)
  const [datesEncaissement, setDatesEncaissement] = useState<any[]>([])
  const [reductions, setReductions] = useState<any[]>([]) // famille nombreuse
  const [reductionAccordee, setReductionAccordee] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)

  // Sélections enfants
  const [enfantsContrat, setEnfantsContrat] = useState<any[]>([]) // [{enfant_id, classe_id, classe_nom, postes:[]}]

  // Règlement
  const [modeReglement, setModeReglement] = useState('')
  const [nbEcheances, setNbEcheances] = useState(10)
  const [dateEncaissement, setDateEncaissement] = useState<number | null>(null)
  const [assuranceEcole, setAssuranceEcole] = useState(true)
  const [autorisationImage, setAutorisationImage] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [
      { data: fam }, { data: enf }, { data: cls }, { data: sec },
      { data: tar }, { data: mod }, { data: cfg },
      { data: payCfg }, { data: datesEnc }, { data: redsf },
      { data: redAcc }, { data: cont },
    ] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*, classes(id, nom, secteur_id)').eq('famille_id', profile.famille_id),
      s.from('classes').select('id, nom, secteur_id, secteurs(id, nom)').eq('ecole_id', profile.ecole_id).order('nom'),
      s.from('secteurs').select('id, nom').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).order('ordre'),
      s.from('modes_reglement_ecole').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('inscriptions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('contrat_paiement_config').select('*').eq('ecole_id', profile.ecole_id).single(),
      s.from('dates_encaissement').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('reductions_famille_nombreuse').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).order('nb_enfants'),
      s.from('demandes_reduction').select('tarif_accorde, statut').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).eq('statut', 'accepte').single(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(*)').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
    ])

    setFamille(fam); setEnfants(enf ?? []); setClasses(cls ?? [])
    setSecteurs(sec ?? []); setTarifs(tar ?? []); setModes(mod ?? [])
    setConfig(cfg); setPaiementConfig(payCfg); setDatesEncaissement(datesEnc ?? [])
    setReductions(redsf ?? []); setReductionAccordee(redAcc); setContrat(cont)

    if (fam) {
      setFamForm({
        parent1_prenom: fam.parent1_prenom || '', parent1_nom: fam.parent1_nom || '',
        parent1_email: fam.parent1_email || '', parent1_telephone: fam.parent1_telephone || '',
        parent1_adresse: fam.parent1_adresse || '', parent1_code_postal: fam.parent1_code_postal || '',
        parent1_ville: fam.parent1_ville || '',
        parent2_prenom: fam.parent2_prenom || '', parent2_nom: fam.parent2_nom || '',
        parent2_email: fam.parent2_email || '', parent2_telephone: fam.parent2_telephone || '',
        situation_maritale: fam.situation_maritale || 'marie',
      })
    }

    // Par défaut : premier mode de règlement
    if (mod && mod.length > 0 && !modeReglement) setModeReglement(mod[0].type)

    // Première date d'encaissement disponible
    if (datesEnc && datesEnc.length > 0) setDateEncaissement(datesEnc[0].jour_du_mois)

    // Nb échéances par défaut = max
    const maxEch = payCfg?.nb_echeances_max || 12
    setNbEcheances(Math.min(maxEch, 10))

    // Pré-sélectionner tous les enfants
    if (enf && enf.length > 0 && !cont) {
      setEnfantsContrat(enf.map((e: any) => ({
        enfant_id: e.id,
        classe_id: e.classe_id || '',
        classe_nom: e.classes?.nom || '',
        postes: [],
        sous_total: 0,
      })))
    } else if (cont?.contrat_enfants) {
      setEnfantsContrat(cont.contrat_enfants)
    }

    setLoading(false)
  }

  function setFam(key: string, val: any) { setFamForm((p: any) => ({ ...p, [key]: val })); setFamModified(true) }

  function setEnfantClasse(enfantId: string, classeId: string) {
    const cls = classes.find(c => c.id === classeId)
    setEnfantsContrat(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      // Recalculer les postes selon le nouveau secteur
      const tarifsDispos = getTarifsForSecteur(cls?.secteur_id || '')
      const postesObligatoires = tarifsDispos.filter((t: any) => t.obligatoire)
      return {
        ...e, classe_id: classeId, classe_nom: cls?.nom || '',
        postes: postesObligatoires.map((t: any) => ({ tarif_id: t.id, nom: t.nom_poste, montant: t.montant })),
        sous_total: postesObligatoires.reduce((s: number, t: any) => s + t.montant, 0),
      }
    }))
  }

  function togglePoste(enfantId: string, tarif: any) {
    setEnfantsContrat(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      const exists = e.postes.find((p: any) => p.tarif_id === tarif.id)
      const newPostes = exists
        ? e.postes.filter((p: any) => p.tarif_id !== tarif.id)
        : [...e.postes, { tarif_id: tarif.id, nom: tarif.nom_poste, montant: tarif.montant }]
      return { ...e, postes: newPostes, sous_total: newPostes.reduce((s: number, p: any) => s + p.montant, 0) }
    }))
  }

  function getTarifsForSecteur(secteurId: string) {
    return tarifs.filter(t => !t.secteur_id || t.secteur_id === secteurId)
  }

  // Calculs
  const totalScolarite = enfantsContrat.reduce((s, e) => s + (e.sous_total || 0), 0)
  const nbEnfants = enfantsContrat.filter(e => e.classe_id).length

  // Réduction famille nombreuse
  const getReductionFamilleNombreuse = () => {
    if (nbEnfants < 2) return 0
    const applicable = reductions.filter(r => parseInt(r.nb_enfants) <= nbEnfants)
    if (applicable.length === 0) return 0
    return parseFloat(applicable[applicable.length - 1].montant_reduction) || 0
  }

  const reductionFN = reductionAccordee ? 0 : (getReductionFamilleNombreuse() || 0)
  const totalAssurance = assuranceEcole ? (config?.montant_assurance || 12) * nbEnfants : 0

  const totalAnnuel = reductionAccordee?.tarif_accorde
    ? reductionAccordee.tarif_accorde + totalAssurance
    : Math.max(0, totalScolarite - reductionFN) + totalAssurance

  const minEch = paiementConfig?.nb_echeances_min || 1
  const maxEch = paiementConfig?.nb_echeances_max || 12
  const montantEcheance = nbEcheances > 0 ? Math.round((totalAnnuel / nbEcheances) * 100) / 100 : 0

  async function soumettre() {
    if (enfantsContrat.filter(e => e.classe_id).length === 0) { alert('Veuillez sélectionner au moins une classe'); return }
    if (!modeReglement) { alert('Veuillez choisir un mode de règlement'); return }

    setSaving(true)
    const s = createClient()

    // Mettre à jour infos famille si modifiées
    if (famModified) {
      await s.from('familles').update({
        parent1_prenom: famForm.parent1_prenom, parent1_nom: famForm.parent1_nom,
        parent1_email: famForm.parent1_email, parent1_telephone: famForm.parent1_telephone,
        parent1_adresse: famForm.parent1_adresse, parent1_code_postal: famForm.parent1_code_postal,
        parent1_ville: famForm.parent1_ville,
        parent2_prenom: famForm.parent2_prenom, parent2_nom: famForm.parent2_nom,
        parent2_email: famForm.parent2_email, parent2_telephone: famForm.parent2_telephone,
        situation_maritale: famForm.situation_maritale,
      }).eq('id', familleId)
    }

    const payload = {
      famille_id: familleId, ecole_id: ecoleId, annee_scolaire: ANNEE_COURANTE,
      demande_reduction_id: reductionAccordee ? (await s.from('demandes_reduction').select('id').eq('famille_id', familleId).eq('annee_scolaire', ANNEE_COURANTE).single()).data?.id : null,
      assurance_ecole: assuranceEcole, assurance_montant_total: totalAssurance,
      mode_reglement: modeReglement, nb_echeances: nbEcheances,
      montant_total: totalAnnuel, autorisation_image: autorisationImage,
      engagement_lu: true, statut: 'soumis', soumis_le: new Date().toISOString(),
    }

    let contratId = contrat?.id
    if (contratId) {
      await s.from('contrats_scolarisation').update(payload).eq('id', contratId)
      await s.from('contrat_enfants').delete().eq('contrat_id', contratId)
    } else {
      const { data: nc } = await s.from('contrats_scolarisation').insert(payload).select().single()
      contratId = nc?.id
    }

    if (contratId) {
      for (const e of enfantsContrat.filter(e => e.classe_id)) {
        const cls = classes.find(c => c.id === e.classe_id)
        await s.from('contrat_enfants').insert({
          contrat_id: contratId, enfant_id: e.enfant_id,
          secteur_id: cls?.secteur_id || null, classe_prevue: e.classe_nom,
          postes: e.postes, sous_total: e.sous_total,
        })
      }

      // Générer chèques si mode chèque
      if (modeReglement === 'cheque' && nbEcheances > 0 && dateEncaissement) {
        await s.from('cheques_prevus').delete().eq('contrat_id', contratId)
        const cheques = []
        const today = new Date()
        let moisDebut = today.getMonth()
        let anneeDebut = today.getFullYear()
        // Si on est après la date d'encaissement, on commence le mois prochain
        if (today.getDate() > dateEncaissement) { moisDebut++; if (moisDebut > 11) { moisDebut = 0; anneeDebut++ } }

        for (let i = 0; i < nbEcheances; i++) {
          let m = moisDebut + i; let y = anneeDebut
          while (m > 11) { m -= 12; y++ }
          const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(dateEncaissement).padStart(2, '0')}`
          cheques.push({
            contrat_id: contratId, famille_id: familleId, ecole_id: ecoleId,
            numero_cheque: i + 1, montant: montantEcheance,
            date_echeance: dateStr, statut: 'prevu',
          })
        }
        await s.from('cheques_prevus').insert(cheques)
      }
    }

    setSaving(false)
    router.push('/portail/inscriptions')
  }

  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' as const }
  const Section = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', borderBottom: '1px solid #F1F5F9', paddingBottom: 10 }}>{title}</div>
      {children}
    </div>
  )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

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
            <span style={{ fontWeight: 600 }}>{contrat.mode_reglement} — {contrat.nb_echeances} échéance(s)</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, padding: 0, textAlign: 'left', width: 'fit-content' }}>
        ← Retour
      </button>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>Contrat de scolarisation {ANNEE_COURANTE}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
          À retourner avant le {config?.date_cloture_inscription ? new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR') : '30 juin'}
        </p>
      </div>

      {/* ── INFOS FAMILLE ── */}
      <Section title="1. Vos informations">
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Vérifiez et corrigez vos informations si nécessaire.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Situation *</label>
            <select style={inp} value={famForm.situation_maritale || ''} onChange={e => setFam('situation_maritale', e.target.value)}>
              <option value="marie">Marié(e)</option><option value="veuf">Veuf/Veuve</option>
              <option value="divorce">Divorcé(e)</option><option value="autre">Autre</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Prénom resp. 1 *</label><input style={inp} value={famForm.parent1_prenom || ''} onChange={e => setFam('parent1_prenom', e.target.value)} /></div>
          <div><label style={lbl}>Nom resp. 1 *</label><input style={inp} value={famForm.parent1_nom || ''} onChange={e => setFam('parent1_nom', e.target.value)} /></div>
          <div><label style={lbl}>Adresse *</label><input style={inp} value={famForm.parent1_adresse || ''} onChange={e => setFam('parent1_adresse', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>CP *</label><input style={inp} value={famForm.parent1_code_postal || ''} onChange={e => setFam('parent1_code_postal', e.target.value)} /></div>
            <div><label style={lbl}>Ville *</label><input style={inp} value={famForm.parent1_ville || ''} onChange={e => setFam('parent1_ville', e.target.value)} /></div>
          </div>
          <div><label style={lbl}>Portable *</label><input style={inp} value={famForm.parent1_telephone || ''} onChange={e => setFam('parent1_telephone', e.target.value)} /></div>
          <div><label style={lbl}>Email *</label><input style={inp} type="email" value={famForm.parent1_email || ''} onChange={e => setFam('parent1_email', e.target.value)} /></div>
          {(famForm.parent2_prenom || famForm.parent2_nom) && <>
            <div><label style={lbl}>Prénom resp. 2</label><input style={inp} value={famForm.parent2_prenom || ''} onChange={e => setFam('parent2_prenom', e.target.value)} /></div>
            <div><label style={lbl}>Nom resp. 2</label><input style={inp} value={famForm.parent2_nom || ''} onChange={e => setFam('parent2_nom', e.target.value)} /></div>
            <div><label style={lbl}>Portable resp. 2</label><input style={inp} value={famForm.parent2_telephone || ''} onChange={e => setFam('parent2_telephone', e.target.value)} /></div>
            <div><label style={lbl}>Email resp. 2</label><input style={inp} type="email" value={famForm.parent2_email || ''} onChange={e => setFam('parent2_email', e.target.value)} /></div>
          </>}
        </div>
      </Section>

      {/* ── ENFANTS + CLASSES ── */}
      <Section title="2. Enfants à (ré)inscrire *">
        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Sélectionnez la classe souhaitée pour chaque enfant — le tarif est calculé automatiquement.</p>
        {enfants.map(enfant => {
          const enf = enfantsContrat.find(e => e.enfant_id === enfant.id) || { classe_id: '', postes: [], sous_total: 0 }
          const isSelected = enfantsContrat.some(e => e.enfant_id === enfant.id)
          const cls = classes.find(c => c.id === enf.classe_id)
          const tarifsDispos = getTarifsForSecteur(cls?.secteur_id || '')

          function toggleEnfantContrat() {
            setEnfantsContrat(prev => {
              if (prev.some(e => e.enfant_id === enfant.id)) {
                return prev.filter(e => e.enfant_id !== enfant.id)
              }
              return [...prev, { enfant_id: enfant.id, classe_id: '', classe_nom: '', postes: [], sous_total: 0 }]
            })
          }

          return (
            <div key={enfant.id} style={{ border: `2px solid ${isSelected ? '#2563EB' : '#E2E8F0'}`, borderRadius: 12, overflow: 'hidden', transition: 'all 0.15s' }}>
              <div style={{ padding: '12px 16px', background: isSelected ? '#EFF6FF' : '#F8FAFC', display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={toggleEnfantContrat}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2563EB', flexShrink: 0 }}
                />
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {enfant.prenom?.[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                  {enfant.classes?.nom && <div style={{ fontSize: 11, color: '#94A3B8' }}>Classe actuelle : {enfant.classes.nom}</div>}
                </div>
                {enf.sous_total > 0 && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{enf.sous_total.toLocaleString('fr-FR')} €</div>
                )}
              </div>
              {isSelected && <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={lbl}>Classe souhaitée 2026/2027 *</label>
                  <select style={inp} value={enf.classe_id || ''} onChange={e => setEnfantClasse(enfant.id, e.target.value)}>
                    <option value="">Choisir une classe</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.nom}{c.secteurs?.nom ? ` — ${c.secteurs.nom}` : ''}</option>
                    ))}
                  </select>
                </div>
                {enf.classe_id && tarifsDispos.length > 0 && (
                  <div>
                    <label style={lbl}>Prestations</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {tarifsDispos.map((t: any) => {
                        const selected = enf.postes?.find((p: any) => p.tarif_id === t.id)
                        return (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: t.obligatoire ? 'default' : 'pointer', background: selected ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${selected ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input type="checkbox" checked={!!selected || t.obligatoire} disabled={t.obligatoire}
                                onChange={() => !t.obligatoire && togglePoste(enfant.id, t)} />
                              <span style={{ fontSize: 13, color: '#1E293B' }}>
                                {t.nom_poste}{t.obligatoire && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6 }}>(inclus)</span>}
                              </span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0 }}>{t.montant.toLocaleString('fr-FR')} €</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>}
            </div>
          )
        })}
      </Section>

      {/* ── ASSURANCE ── */}
      <Section title="3. Assurance scolaire">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
            <input type="radio" checked={assuranceEcole} onChange={() => setAssuranceEcole(true)} />
            <div>Assurance proposée par l'établissement
              <span style={{ fontWeight: 700, color: '#059669', marginLeft: 8 }}>{config?.montant_assurance || 12} € × {Math.max(1, nbEnfants)} = {totalAssurance} €</span>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: !assuranceEcole ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${!assuranceEcole ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1E293B' }}>
            <input type="radio" checked={!assuranceEcole} onChange={() => setAssuranceEcole(false)} />
            Je fournis ma propre attestation d'assurance scolaire valide
          </label>
        </div>
      </Section>

      {/* ── TOTAL ── */}
      <div style={{ background: '#1E293B', borderRadius: 14, padding: 24, color: '#fff' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 16, letterSpacing: '0.06em' }}>RÉCAPITULATIF</div>

        {enfantsContrat.filter(e => e.sous_total > 0).map(e => {
          const enfant = enfants.find(en => en.id === e.enfant_id)
          return (
            <div key={e.enfant_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
              <span>{enfant?.prenom} — {e.classe_nom}</span>
              <span>{e.sous_total.toLocaleString('fr-FR')} €</span>
            </div>
          )
        })}

        {reductionFN > 0 && !reductionAccordee && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#34D399' }}>
            <span>Réduction famille nombreuse ({nbEnfants} enfants)</span>
            <span>- {reductionFN.toLocaleString('fr-FR')} €</span>
          </div>
        )}

        {reductionAccordee && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#34D399' }}>
            <span>Tarif accordé (dossier de réduction)</span>
            <span>{reductionAccordee.tarif_accorde?.toLocaleString('fr-FR')} €</span>
          </div>
        )}

        {assuranceEcole && totalAssurance > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
            <span>Assurance scolaire</span>
            <span>{totalAssurance.toLocaleString('fr-FR')} €</span>
          </div>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
          <span>Total annuel</span>
          <span style={{ color: '#60A5FA' }}>{totalAnnuel.toLocaleString('fr-FR')} €</span>
        </div>
      </div>

      {/* ── RÈGLEMENT ── */}
      <Section title="4. Mode de règlement *">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {modes.map(m => (
            <div key={m.id} style={{ border: `1px solid ${modeReglement === m.type ? '#BFDBFE' : '#E2E8F0'}`, background: modeReglement === m.type ? '#EFF6FF' : '#F8FAFC', borderRadius: 10, padding: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <input type="radio" checked={modeReglement === m.type} onChange={() => setModeReglement(m.type)} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{m.label}</span>
              </label>

              {modeReglement === m.type && (
                <div style={{ marginTop: 14, marginLeft: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Nb échéances */}
                  <div>
                    <label style={lbl}>Nombre d'échéances *</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Array.from({ length: maxEch - minEch + 1 }, (_, i) => minEch + i).map(n => (
                        <button key={n} onClick={() => setNbEcheances(n)}
                          style={{
                            width: 44, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: nbEcheances === n ? 700 : 400,
                            background: nbEcheances === n ? '#2563EB' : '#F1F5F9',
                            color: nbEcheances === n ? '#fff' : '#475569',
                          }}>
                          {n}
                        </button>
                      ))}
                    </div>
                    {nbEcheances > 1 && (
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>
                        Soit <strong>{montantEcheance.toLocaleString('fr-FR')} €</strong> × {nbEcheances} {m.type === 'cheque' ? 'chèques' : 'prélèvements'}
                      </div>
                    )}
                  </div>

                  {/* Date d'encaissement */}
                  {datesEncaissement.length > 0 && (
                    <div>
                      <label style={lbl}>Date d'encaissement mensuelle *</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {datesEncaissement.map(d => (
                          <button key={d.id} onClick={() => setDateEncaissement(d.jour_du_mois)}
                            style={{
                              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: dateEncaissement === d.jour_du_mois ? 600 : 400,
                              background: dateEncaissement === d.jour_du_mois ? '#2563EB' : '#F1F5F9',
                              color: dateEncaissement === d.jour_du_mois ? '#fff' : '#475569',
                            }}>
                            {d.label || `${d.jour_du_mois} du mois`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── AUTORISATION IMAGE ── */}
      <Section title="5. Autorisation et engagement">
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
          <input type="checkbox" checked={autorisationImage} onChange={e => setAutorisationImage(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>J'autorise la prise et l'utilisation d'image de mes enfants dans le cadre de la communication des institutions scolaires.</span>
        </label>

        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#475569', lineHeight: 1.6, borderLeft: '3px solid #2563EB' }}>
          Nous soussigné(e)s, <strong>{famForm.parent1_prenom} {famForm.parent1_nom}</strong>, reconnaissons avoir pris connaissance des tarifs pour l'année scolaire {ANNEE_COURANTE} et approuvons le règlement de l'établissement.
          En validant ce formulaire, nous nous engageons à régler la somme de <strong>{totalAnnuel.toLocaleString('fr-FR')} €</strong> selon les modalités choisies.
        </div>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8 }}>
        <button onClick={() => router.push('/portail/inscriptions')}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 20px', fontSize: 13, color: '#64748B', cursor: 'pointer' }}>
          Annuler
        </button>
        <button onClick={soumettre} disabled={saving}
          style={{ background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Envoi...' : '📝 Soumettre le contrat'}
        </button>
      </div>
    </div>
  )
}
