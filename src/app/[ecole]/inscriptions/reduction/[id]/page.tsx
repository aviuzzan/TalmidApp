'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { formatStatut } from '@/lib/inscriptions'

const AVIS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  favorable:   { label: 'Favorable',   color: '#10B981', bg: 'rgba(16,185,129,0.1)',  icon: '✓' },
  defavorable: { label: 'Défavorable', color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   icon: '✗' },
  reserve:     { label: 'Réservé',     color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  icon: '~' },
  abstention:  { label: 'Abstention',  color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', icon: '—' },
}

export default function DossierReductionPage() {
  const router = useRouter()
  const params = useParams()
  const ecole = useEcole()
  const demandeId = params.id as string

  const [demande, setDemande] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [revenus, setRevenus] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [membres, setMembres] = useState<any[]>([])
  const [avis, setAvis] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Formulaire décision finale
  const [tarifDecide, setTarifDecide] = useState('')
  const [noteInterne, setNoteInterne] = useState('')
  const [tarifAccordePar, setTarifAccordePar] = useState('')
  const [dateCommission, setDateCommission] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  // Formulaire avis rapide
  const [avisForm, setAvisForm] = useState<Record<string, { avis: string; tarif: string; commentaire: string }>>({})

  useEffect(() => { load() }, [demandeId])

  async function load() {
    const s = createClient()
    const [
      { data: dem },
      { data: revs },
      { data: docs },
      { data: mems },
      { data: av },
    ] = await Promise.all([
      s.from('demandes_reduction')
        .select('*, familles(*), enfants_dossier')
        .eq('id', demandeId).single(),
      s.from('demandes_reduction_revenus').select('*').eq('demande_id', demandeId),
      s.from('reduction_documents_uploaded').select('*').eq('demande_id', demandeId),
      s.from('commission_membres').select('*').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('commission_avis').select('*').eq('demande_id', demandeId),
    ])

    setDemande(dem)
    setFamille(dem?.familles)
    setRevenus(revs ?? [])
    setDocuments(docs ?? [])
    setMembres(mems ?? [])
    setAvis(av ?? [])

    if (dem) {
      setTarifDecide(dem.tarif_accorde?.toString() || '')
      setNoteInterne(dem.note_interne || '')
      setTarifAccordePar(dem.tarif_accorde_par || '')
      setDateCommission(dem.date_commission || new Date().toISOString().split('T')[0])
    }

    // Pré-remplir form avis
    const avisMap: Record<string, any> = {}
    av?.forEach(a => {
      avisMap[a.membre_id] = { avis: a.avis || '', tarif: a.tarif_propose?.toString() || '', commentaire: a.commentaire || '' }
    })
    setAvisForm(avisMap)

    setLoading(false)
  }

  async function passerEnEtude() {
    await createClient().from('demandes_reduction').update({ statut: 'en_etude' }).eq('id', demandeId)
    await load()
  }

  async function sauvegarderAvis(membreId: string, membreNom: string) {
    const f = avisForm[membreId] || {}
    const s = createClient()
    await s.from('commission_avis').upsert({
      demande_id: demandeId,
      membre_id: membreId,
      membre_nom: membreNom,
      avis: f.avis || null,
      tarif_propose: f.tarif ? parseFloat(f.tarif) : null,
      commentaire: f.commentaire || null,
      updated_at: new Date().toISOString(),
    })
    await load()
  }

  async function decider(statut: 'accepte' | 'refuse') {
    if (statut === 'accepte' && !tarifDecide) { alert('Saisissez le tarif accordé'); return }
    setSaving(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    await s.from('demandes_reduction').update({
      statut,
      tarif_accorde: statut === 'accepte' ? parseFloat(tarifDecide) : null,
      nb_enfants_accordes: demande?.nb_enfants_concernes || null,
      note_interne: noteInterne,
      tarif_accorde_par: tarifAccordePar,
      date_commission: dateCommission,
      decide_par: session?.user.id,
      decide_le: new Date().toISOString(),
    }).eq('id', demandeId)
    await load()
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (!demande) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Dossier introuvable</div>

  const st = formatStatut(demande.statut)
  const inp = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const lbl = { fontSize: 11, fontWeight: 600 as const, color: '#64748B', display: 'block' as const, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
  const isDecide = ['accepte', 'refuse'].includes(demande.statut)

  // Calcul synthèse avis commission
  const avisCount = { favorable: 0, defavorable: 0, reserve: 0, abstention: 0 }
  avis.forEach(a => { if (a.avis) avisCount[a.avis as keyof typeof avisCount]++ })
  const tarifsProposés = avis.filter(a => a.tarif_propose).map(a => parseFloat(a.tarif_propose))
  const moyenneTarifs = tarifsProposés.length > 0 ? Math.round(tarifsProposés.reduce((s, v) => s + v, 0) / tarifsProposés.length) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860, fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => router.push(`/${ecole.slug}/inscriptions`)}
          style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          ← Retour
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: 0 }}>
            Dossier — {famille?.nom || '—'}
          </h1>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            {demande.annee_scolaire} · {demande.nb_enfants_concernes} enfant(s) · Proposition : {demande.tarif_propose?.toLocaleString('fr-FR')} €
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: st.color, background: st.bg, padding: '6px 16px', borderRadius: 20 }}>{st.label}</span>
        {demande.statut === 'soumis' && (
          <button onClick={passerEnEtude}
            style={{ background: '#0891B2', border: 'none', borderRadius: 9, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            → Passer en étude
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── COL GAUCHE : Infos famille + revenus ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Infos famille */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Famille</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Situation', value: demande.situation_familiale },
                { label: 'Resp. 1', value: `${famille?.parent1_prenom || ''} ${famille?.parent1_nom || ''}`.trim() },
                { label: 'Téléphone', value: famille?.parent1_telephone },
                { label: 'Email', value: famille?.parent1_email },
                { label: 'Adresse', value: [famille?.parent1_adresse, famille?.parent1_code_postal, famille?.parent1_ville].filter(Boolean).join(' ') },
                { label: 'Resp. 2', value: `${famille?.parent2_prenom || ''} ${famille?.parent2_nom || ''}`.trim() || '—' },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: '#1E293B' }}>{f.value || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Enfants du dossier */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
              Enfants ({demande.nb_enfants_concernes})
            </div>
            {demande.enfants_dossier?.map((e: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
                <span style={{ color: '#1E293B', fontWeight: 500 }}>{e.classe_souhaitee || `Enfant ${i + 1}`}</span>
              </div>
            )) || <div style={{ fontSize: 12, color: '#94A3B8' }}>—</div>}
          </div>

          {/* Logement */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Logement</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Type', value: demande.logement_type },
                { label: 'Nb pièces', value: demande.logement_nb_pieces },
                { label: 'Loyer/remb. mensuel', value: demande.logement_loyer_mensuel ? `${demande.logement_loyer_mensuel} €` : null },
                { label: 'Charges mensuelles', value: demande.logement_charges_mensuelles ? `${demande.logement_charges_mensuelles} €` : null },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: '#1E293B' }}>{f.value || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenus */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Revenus</div>
            {revenus.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94A3B8' }}>Aucun revenu saisi</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Nom', 'Lien', 'Employeur', 'Salaire net', 'Mois'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {revenus.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={{ padding: '6px 8px', color: '#1E293B', fontWeight: 500 }}>{r.nom_prenom}</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.lien_parente}</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.employeur}</td>
                      <td style={{ padding: '6px 8px', color: '#059669', fontWeight: 600 }}>{parseFloat(r.salaire_mensuel_net || 0).toLocaleString('fr-FR')} €</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.nb_mois}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Allocations */}
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Alloc. familiales', value: demande.alloc_familiales_mensuelles },
                { label: 'Quotient familial', value: demande.quotient_familial },
                { label: 'Allocation chômage', value: demande.alloc_chomage_mensuelle },
                { label: 'APL', value: demande.apl_mensuelle },
                { label: 'Autres revenus', value: demande.autres_revenus_mensuels },
              ].filter(f => f.value).map(f => (
                <div key={f.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>{parseFloat(f.value).toLocaleString('fr-FR')} €/mois</div>
                </div>
              ))}
            </div>
          </div>

          {/* Proposition famille */}
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 700, marginBottom: 8 }}>Proposition de la famille</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#1D4ED8' }}>
              {demande.tarif_propose?.toLocaleString('fr-FR')} €
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
              Pour {demande.nb_enfants_concernes} enfant(s)
            </div>
            {demande.commentaire && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#475569', background: '#fff', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #BFDBFE', fontStyle: 'italic' }}>
                {demande.commentaire}
              </div>
            )}
          </div>

          {/* Pièces justificatives */}
          {documents.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
                Pièces jointes ({documents.length})
              </div>
              {documents.map(d => (
                <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F8FAFC', textDecoration: 'none', color: '#2563EB' }}>
                  <span style={{ fontSize: 18 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{d.label}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}>{d.nom_fichier} — {d.taille_ko} Ko</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#2563EB' }}>Ouvrir →</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── COL DROITE : Commission + Décision ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Synthèse avis */}
          {avis.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Synthèse commission</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                {Object.entries(avisCount).filter(([, n]) => n > 0).map(([k, n]) => {
                  const cfg = AVIS_CONFIG[k]
                  return (
                    <div key={k} style={{ flex: 1, textAlign: 'center', background: cfg.bg, borderRadius: 10, padding: '10px 8px', border: `1px solid ${cfg.color}30` }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{n}</div>
                      <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                    </div>
                  )
                })}
              </div>
              {moyenneTarifs && (
                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>MOYENNE DES TARIFS PROPOSÉS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>{moyenneTarifs.toLocaleString('fr-FR')} €</div>
                </div>
              )}
            </div>
          )}

          {/* Avis de chaque membre */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>
              Avis des membres ({membres.length})
            </div>

            {membres.length === 0 && (
              <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>
                Aucun membre configuré.{' '}
                <button onClick={() => router.push(`/${ecole.slug}/parametres?tab=commission`)}
                  style={{ color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  Configurer →
                </button>
              </div>
            )}

            {membres.map(membre => {
              const f = avisForm[membre.id] || { avis: '', tarif: '', commentaire: '' }
              const avisExistant = avis.find(a => a.membre_id === membre.id)
              const avisConfig = avisExistant?.avis ? AVIS_CONFIG[avisExistant.avis] : null

              return (
                <div key={membre.id} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 16, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {(membre.prenom || membre.nom)[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                        {membre.prenom} {membre.nom}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>{membre.role_label}</div>
                    </div>
                    {avisConfig && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: avisConfig.color, background: avisConfig.bg, padding: '3px 10px', borderRadius: 20 }}>
                        {avisConfig.icon} {avisConfig.label}
                      </span>
                    )}
                  </div>

                  {!isDecide && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Boutons avis */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {Object.entries(AVIS_CONFIG).map(([val, cfg]) => (
                          <button key={val} onClick={() => setAvisForm(p => ({ ...p, [membre.id]: { ...p[membre.id], avis: val } }))}
                            style={{
                              flex: 1, padding: '6px 4px', borderRadius: 7, border: `1px solid ${f.avis === val ? cfg.color : '#E2E8F0'}`,
                              background: f.avis === val ? cfg.bg : '#F8FAFC', color: f.avis === val ? cfg.color : '#94A3B8',
                              fontSize: 11, fontWeight: f.avis === val ? 700 : 400, cursor: 'pointer',
                            }}>
                            {cfg.icon} {cfg.label}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={{ ...lbl, marginBottom: 3 }}>Tarif proposé (€)</label>
                          <input style={inp} type="number" value={f.tarif || ''} placeholder="Ex: 2 500"
                            onChange={e => setAvisForm(p => ({ ...p, [membre.id]: { ...p[membre.id], tarif: e.target.value } }))} />
                        </div>
                        <div>
                          <label style={{ ...lbl, marginBottom: 3 }}>Commentaire</label>
                          <input style={inp} value={f.commentaire || ''} placeholder="Remarque..."
                            onChange={e => setAvisForm(p => ({ ...p, [membre.id]: { ...p[membre.id], commentaire: e.target.value } }))} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => sauvegarderAvis(membre.id, `${membre.prenom} ${membre.nom}`)}
                          style={{ background: '#2563EB', border: 'none', borderRadius: 7, padding: '6px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          {avisExistant ? '↺ Mettre à jour' : '✓ Enregistrer'}
                        </button>
                      </div>
                    </div>
                  )}

                  {isDecide && avisExistant && (
                    <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>
                      {avisExistant.tarif_propose && `Tarif proposé : ${parseFloat(avisExistant.tarif_propose).toLocaleString('fr-FR')} €`}
                      {avisExistant.commentaire && ` — ${avisExistant.commentaire}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── DÉCISION FINALE ── */}
          {!isDecide ? (
            <div style={{ background: '#fff', border: '2px solid #1E293B', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 16 }}>
                ⚖️ Décision de la commission
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Date de la commission</label>
                    <input style={inp} type="date" value={dateCommission} onChange={e => setDateCommission(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Décision prise par</label>
                    <input style={inp} value={tarifAccordePar} onChange={e => setTarifAccordePar(e.target.value)} placeholder="Nom du décideur" />
                  </div>
                </div>

                <div>
                  <label style={lbl}>Tarif annuel accordé (€)</label>
                  <input
                    style={{ ...inp, fontSize: 18, fontWeight: 700, textAlign: 'center', padding: '12px', color: '#059669' }}
                    type="number" value={tarifDecide} onChange={e => setTarifDecide(e.target.value)}
                    placeholder={moyenneTarifs ? `Suggestion : ${moyenneTarifs.toLocaleString('fr-FR')}` : 'Ex: 2 500'} />
                  {moyenneTarifs && !tarifDecide && (
                    <button onClick={() => setTarifDecide(moyenneTarifs.toString())}
                      style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                      Utiliser la moyenne : {moyenneTarifs.toLocaleString('fr-FR')} €
                    </button>
                  )}
                </div>

                <div>
                  <label style={lbl}>Note interne (non visible par le parent)</label>
                  <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={noteInterne}
                    onChange={e => setNoteInterne(e.target.value)} placeholder="Observations, contexte..." />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => decider('refuse')} disabled={saving}
                    style={{ flex: 1, padding: '12px', background: 'rgba(239,68,68,0.1)', border: '2px solid #EF4444', borderRadius: 10, color: '#EF4444', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    ✗ Refuser
                  </button>
                  <button onClick={() => decider('accepte')} disabled={saving || !tarifDecide}
                    style={{ flex: 2, padding: '12px', background: '#10B981', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: !tarifDecide ? 'not-allowed' : 'pointer', opacity: !tarifDecide ? 0.5 : 1 }}>
                    ✓ Accepter — {tarifDecide ? `${parseFloat(tarifDecide).toLocaleString('fr-FR')} €` : 'saisir le tarif'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: demande.statut === 'accepte' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `2px solid ${demande.statut === 'accepte' ? '#10B981' : '#EF4444'}`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{demande.statut === 'accepte' ? '✅' : '❌'}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: demande.statut === 'accepte' ? '#059669' : '#DC2626' }}>
                {demande.statut === 'accepte' ? 'Dossier accepté' : 'Dossier refusé'}
              </div>
              {demande.tarif_accorde && (
                <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 8 }}>
                  {parseFloat(demande.tarif_accorde).toLocaleString('fr-FR')} €
                </div>
              )}
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
                {demande.tarif_accorde_par && `Par ${demande.tarif_accorde_par}`}
                {demande.date_commission && ` · ${new Date(demande.date_commission).toLocaleDateString('fr-FR')}`}
              </div>
              {demande.note_interne && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#64748B', background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'left', fontStyle: 'italic' }}>
                  {demande.note_interne}
                </div>
              )}
              {/* Permettre de corriger */}
              <button
                onClick={async () => {
                  await createClient().from('demandes_reduction').update({ statut: 'en_etude', tarif_accorde: null, decide_le: null }).eq('id', demandeId)
                  await load()
                }}
                style={{ marginTop: 12, fontSize: 11, color: '#94A3B8', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                ↺ Corriger la décision
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
