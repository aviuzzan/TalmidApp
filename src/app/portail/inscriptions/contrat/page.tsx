'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

export default function ContratPage() {
  const router = useRouter()
  const [familleId, setFamilleId] = useState('')
  const [ecoleId, setEcoleId] = useState('')
  const [enfants, setEnfants] = useState<any[]>([])
  const [secteurs, setSecteurs] = useState<any[]>([])
  const [tarifs, setTarifs] = useState<any[]>([])
  const [modes, setModes] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [reductionAccordee, setReductionAccordee] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Formulaire
  const [enfantsSelectionnes, setEnfantsSelectionnes] = useState<any[]>([])
  const [modeReglement, setModeReglement] = useState('')
  const [nbEcheances, setNbEcheances] = useState(10)
  const [assuranceEcole, setAssuranceEcole] = useState(true)
  const [autorisationImage, setAutorisationImage] = useState(false)
  const [engagementLu, setEngagementLu] = useState(false)
  const [engagementLieu, setEngagementLieu] = useState('')
  const [casReduction, setCasReduction] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) return
    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }
    setFamilleId(profile.famille_id); setEcoleId(profile.ecole_id)

    const [{ data: enf }, { data: sec }, { data: tar }, { data: mod }, { data: cfg }, { data: red }, { data: cont }] = await Promise.all([
      s.from('enfants').select('*').eq('famille_id', profile.famille_id),
      s.from('secteurs').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('tarifs_secteur').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE),
      s.from('modes_reglement_ecole').select('*').eq('ecole_id', profile.ecole_id).eq('actif', true).order('ordre'),
      s.from('inscriptions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(*, enfants(prenom, nom))').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
    ])
    setEnfants(enf ?? []); setSecteurs(sec ?? []); setTarifs(tar ?? [])
    setModes(mod ?? []); setConfig(cfg); setContrat(cont)
    if (red?.statut === 'accepte') { setReductionAccordee(red); setCasReduction(true) }
    if (mod && mod.length > 0 && !modeReglement) setModeReglement(mod[0].type)

    // Pré-remplir si contrat existant
    if (cont) {
      setModeReglement(cont.mode_reglement || '')
      setNbEcheances(cont.nb_echeances || 10)
      setAssuranceEcole(cont.assurance_ecole ?? true)
      setAutorisationImage(cont.autorisation_image ?? false)
      setEngagementLu(cont.engagement_lu ?? false)
      setEngagementLieu(cont.engagement_lieu || '')
    } else {
      // Pré-sélectionner tous les enfants
      setEnfantsSelectionnes((enf ?? []).map((e: any) => ({
        enfant_id: e.id, secteur_id: '', classe_prevue: '', postes: [], sous_total: 0,
      })))
    }
    setLoading(false)
  }

  function getTarifsForSecteur(secteurId: string) {
    return tarifs.filter(t => !t.secteur_id || t.secteur_id === secteurId)
  }

  function togglePoste(enfantId: string, tarif: any) {
    setEnfantsSelectionnes(prev => prev.map(e => {
      if (e.enfant_id !== enfantId) return e
      const exists = e.postes.find((p: any) => p.tarif_id === tarif.id)
      const newPostes = exists
        ? e.postes.filter((p: any) => p.tarif_id !== tarif.id)
        : [...e.postes, { tarif_id: tarif.id, nom: tarif.nom_poste, montant: tarif.montant }]
      return { ...e, postes: newPostes, sous_total: newPostes.reduce((s: number, p: any) => s + p.montant, 0) }
    }))
  }

  function setEnfantField(enfantId: string, key: string, val: string) {
    setEnfantsSelectionnes(prev => prev.map(e => e.enfant_id === enfantId ? { ...e, [key]: val } : e))
  }

  const totalScolarite = enfantsSelectionnes.reduce((s, e) => s + (e.sous_total || 0), 0)
  const totalAssurance = assuranceEcole ? (config?.montant_assurance || 12) * enfants.length : 0
  const totalAnnuel = casReduction && reductionAccordee?.tarif_accorde
    ? reductionAccordee.tarif_accorde + totalAssurance
    : totalScolarite + totalAssurance
  const montantEcheance = nbEcheances > 0 ? Math.round((totalAnnuel / nbEcheances) * 100) / 100 : 0

  async function soumettre() {
    if (!engagementLu) { alert('Veuillez confirmer avoir pris connaissance du règlement'); return }
    if (!modeReglement) { alert('Veuillez choisir un mode de règlement'); return }
    setSaving(true)
    const s = createClient()

    const payload = {
      famille_id: familleId, ecole_id: ecoleId, annee_scolaire: ANNEE_COURANTE,
      demande_reduction_id: reductionAccordee?.id || null,
      assurance_ecole: assuranceEcole, assurance_montant_total: totalAssurance,
      mode_reglement: modeReglement, nb_echeances: nbEcheances,
      montant_total: totalAnnuel,
      autorisation_image: autorisationImage, engagement_lu: engagementLu,
      engagement_lieu: engagementLieu, engagement_date: new Date().toISOString().split('T')[0],
      statut: 'soumis', soumis_le: new Date().toISOString(),
    }

    let contratId = contrat?.id
    if (contratId) {
      await s.from('contrats_scolarisation').update(payload).eq('id', contratId)
      await s.from('contrat_enfants').delete().eq('contrat_id', contratId)
    } else {
      const { data: newC } = await s.from('contrats_scolarisation').insert(payload).select().single()
      contratId = newC?.id
    }

    if (contratId) {
      // Insérer les enfants
      for (const e of enfantsSelectionnes) {
        if (e.secteur_id) {
          await s.from('contrat_enfants').insert({ contrat_id: contratId, enfant_id: e.enfant_id, secteur_id: e.secteur_id, classe_prevue: e.classe_prevue, postes: e.postes, sous_total: e.sous_total })
        }
      }

      // Créer les chèques prévus si mode chèque
      if (modeReglement === 'cheque' && nbEcheances > 0) {
        await s.from('cheques_prevus').delete().eq('contrat_id', contratId)
        const cheques = []
        const today = new Date()
        for (let i = 0; i < nbEcheances; i++) {
          const date = new Date(today.getFullYear(), today.getMonth() + i, 1)
          cheques.push({
            contrat_id: contratId, famille_id: familleId, ecole_id: ecoleId,
            numero_cheque: i + 1, montant: montantEcheance,
            date_echeance: date.toISOString().split('T')[0], statut: 'prevu',
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>

  if (contrat?.statut === 'soumis' || contrat?.statut === 'valide') {
    const st = formatStatut(contrat.statut)
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
        <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 32, display: 'block' }}>← Retour</button>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>Contrat soumis</h2>
        <p style={{ color: '#64748B', fontSize: 14, margin: '8px 0 20px' }}>Votre dossier d'inscription est en cours de validation.</p>
        <span style={{ fontSize: 14, fontWeight: 700, color: st.color, background: st.bg, padding: '8px 20px', borderRadius: 20 }}>{st.label}</span>
        <div style={{ marginTop: 24, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: '#64748B' }}>Total annuel</span>
            <span style={{ fontWeight: 700, color: '#1E293B' }}>{contrat.montant_total?.toLocaleString('fr-FR')} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#64748B' }}>Mode de règlement</span>
            <span style={{ fontWeight: 600, color: '#1E293B' }}>{contrat.mode_reglement}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <button onClick={() => router.push('/portail/inscriptions')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, marginBottom: 20, padding: 0 }}>← Retour</button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>Contrat de scolarisation {ANNEE_COURANTE}</h1>
      <p style={{ color: '#64748B', fontSize: 13, marginBottom: 28 }}>Engagement de paiement — à retourner avant le {config?.date_cloture_inscription ? new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR') : '30 juin'}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* CAS réduction */}
        {reductionAccordee && (
          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', marginBottom: 4 }}>✓ Réduction accordée</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{reductionAccordee.tarif_accorde?.toLocaleString('fr-FR')} €</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Ce montant sera utilisé comme base de calcul pour votre contrat</div>
          </div>
        )}

        {/* Enfants + tarifs (si pas de réduction accordée) */}
        {!casReduction && enfants.map(enfant => {
          const enf = enfantsSelectionnes.find(e => e.enfant_id === enfant.id) || {}
          const tarifsDispos = getTarifsForSecteur(enf.secteur_id || '')
          return (
            <div key={enfant.id} style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', background: '#F8FAFC', fontWeight: 600, fontSize: 14, color: '#1E293B', borderBottom: '1px solid #E2E8F0' }}>
                {enfant.prenom} {enfant.nom}
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Secteur</label>
                    <select style={inp} value={enf.secteur_id || ''}
                      onChange={e => setEnfantField(enfant.id, 'secteur_id', e.target.value)}>
                      <option value="">Choisir...</option>
                      {secteurs.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Classe prévue</label>
                    <input style={inp} value={enf.classe_prevue || ''} onChange={e => setEnfantField(enfant.id, 'classe_prevue', e.target.value)} placeholder="Ex: 6ème A" />
                  </div>
                </div>
                {enf.secteur_id && tarifsDispos.length > 0 && (
                  <div>
                    <label style={lbl}>Prestations</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {tarifsDispos.map(t => {
                        const selected = enf.postes?.find((p: any) => p.tarif_id === t.id)
                        return (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: t.obligatoire ? 'default' : 'pointer', background: selected ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${selected ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input type="checkbox" checked={!!selected || t.obligatoire} disabled={t.obligatoire}
                                onChange={() => !t.obligatoire && togglePoste(enfant.id, t)} />
                              <span style={{ fontSize: 13, color: '#1E293B' }}>
                                {t.nom_poste}
                                {t.obligatoire && <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 6 }}>(obligatoire)</span>}
                              </span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{t.montant.toLocaleString('fr-FR')} €</span>
                          </label>
                        )
                      })}
                    </div>
                    {(enf.sous_total || 0) > 0 && (
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#1E293B', marginTop: 8 }}>
                        Sous-total : {(enf.sous_total || 0).toLocaleString('fr-FR')} €
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Assurance */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 14 }}>ASSURANCE SCOLAIRE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
              <input type="radio" checked={assuranceEcole} onChange={() => setAssuranceEcole(true)} />
              <div>
                Assurance proposée par l'établissement
                <span style={{ fontWeight: 700, color: '#059669', marginLeft: 8 }}>{config?.montant_assurance || 12} € × {enfants.length} enfant(s) = {totalAssurance} €</span>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
              <input type="radio" checked={!assuranceEcole} onChange={() => setAssuranceEcole(false)} />
              J'ai ma propre assurance et fournis une attestation valide
            </label>
          </div>
        </div>

        {/* Total */}
        <div style={{ background: '#1E293B', borderRadius: 14, padding: 24, color: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>RÉCAPITULATIF</div>
          {!casReduction && enfantsSelectionnes.map(e => {
            const enfant = enfants.find(en => en.id === e.enfant_id)
            if (!e.sous_total) return null
            return (
              <div key={e.enfant_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
                <span>{enfant?.prenom}</span>
                <span>{e.sous_total.toLocaleString('fr-FR')} €</span>
              </div>
            )
          })}
          {casReduction && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
              <span>Scolarité (tarif accordé)</span>
              <span>{reductionAccordee?.tarif_accorde?.toLocaleString('fr-FR')} €</span>
            </div>
          )}
          {assuranceEcole && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>
            <span>Assurance scolaire</span><span>{totalAssurance.toLocaleString('fr-FR')} €</span>
          </div>}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}>
            <span>Total annuel</span>
            <span style={{ color: '#60A5FA' }}>{totalAnnuel.toLocaleString('fr-FR')} €</span>
          </div>
        </div>

        {/* Mode de règlement */}
        <div>
          <label style={lbl}>Mode de règlement</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modes.map(m => (
              <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: modeReglement === m.type ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${modeReglement === m.type ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 10, padding: '14px 16px' }}>
                <input type="radio" checked={modeReglement === m.type} onChange={() => setModeReglement(m.type)} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{m.label}</div>
                  {m.type === 'cheque' && (
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                      Payer sur{' '}
                      <select value={nbEcheances} onChange={e => setNbEcheances(parseInt(e.target.value))}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '2px 6px', fontSize: 12, outline: 'none', background: '#fff' }}
                        onClick={e => e.stopPropagation()}>
                        <option value={10}>10 mois</option>
                        <option value={12}>12 mois</option>
                        <option value={1}>1 chèque</option>
                      </select>
                      {nbEcheances > 1 && ` — ${montantEcheance.toLocaleString('fr-FR')} € × ${nbEcheances}`}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Autorisation image + engagement */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: '#1E293B' }}>
            <input type="checkbox" checked={autorisationImage} onChange={e => setAutorisationImage(e.target.checked)} style={{ marginTop: 2 }} />
            J'autorise la prise et l'utilisation d'image de mes enfants dans le cadre de la communication des institutions scolaires.
          </label>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: '#1E293B', fontWeight: 600 }}>
              <input type="checkbox" checked={engagementLu} onChange={e => setEngagementLu(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              ✓ Nous reconnaissons avoir pris connaissance des tarifs pour l'année scolaire {ANNEE_COURANTE} et approuvé le règlement de l'établissement.
            </label>
            <div style={{ marginTop: 14 }}>
              <label style={lbl}>Fait à</label>
              <input style={inp} value={engagementLieu} onChange={e => setEngagementLieu(e.target.value)} placeholder="Ville" />
            </div>
          </div>
        </div>

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
    </div>
  )
}
