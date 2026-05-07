'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

const AVIS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  favorable:   { label: 'Favorable',   color: '#10B981', bg: 'rgba(16,185,129,0.1)',  icon: '✓' },
  defavorable: { label: 'Défavorable', color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   icon: '✗' },
  reserve:     { label: 'Réservé',     color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  icon: '~' },
  abstention:  { label: 'Abstention',  color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', icon: '—' },
}

export default function DossierReductionPage() {
  const router = useRouter(); const params = useParams(); const ecole = useEcole()
  const demandeId = params.id as string
  const [demande, setDemande] = useState<any>(null)
  const [famille, setFamille] = useState<any>(null)
  const [revenus, setRevenus] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [membres, setMembres] = useState<any[]>([])
  const [avis, setAvis] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isIPad, setIsIPad] = useState(false)

  const [tarifDecide, setTarifDecide] = useState('')
  const [noteInterne, setNoteInterne] = useState('')
  const [tarifAccordePar, setTarifAccordePar] = useState('')
  const [dateCommission, setDateCommission] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [avisForm, setAvisForm] = useState<Record<string, any>>({})

  useEffect(() => {
    setIsIPad(window.innerWidth <= 1024)
    load()
  }, [demandeId])

  async function load() {
    const s = createClient()
    const [{ data: dem }, { data: revs }, { data: docs }, { data: mems }, { data: av }] = await Promise.all([
      s.from('demandes_reduction').select('*, familles(*)').eq('id', demandeId).single(),
      s.from('demandes_reduction_revenus').select('*').eq('demande_id', demandeId),
      s.from('reduction_documents_uploaded').select('*').eq('demande_id', demandeId),
      s.from('commission_membres').select('*').eq('ecole_id', ecole.id).eq('actif', true).order('ordre'),
      s.from('commission_avis').select('*').eq('demande_id', demandeId),
    ])
    setDemande(dem); setFamille(dem?.familles); setRevenus(revs ?? [])
    setDocuments(docs ?? []); setMembres(mems ?? []); setAvis(av ?? [])
    if (dem) {
      setTarifDecide(dem.tarif_accorde?.toString() || '')
      setNoteInterne(dem.note_interne || '')
      setTarifAccordePar(dem.tarif_accorde_par || '')
      setDateCommission(dem.date_commission || new Date().toISOString().split('T')[0])
    }
    const avisMap: Record<string, any> = {}
    av?.forEach((a: any) => { avisMap[a.membre_id] = { avis: a.avis || '', tarif: a.tarif_propose?.toString() || '', commentaire: a.commentaire || '' } })
    setAvisForm(avisMap)
    setLoading(false)
  }

  async function passerEnEtude() {
    await createClient().from('demandes_reduction').update({ statut: 'en_etude' }).eq('id', demandeId)
    await load()
  }

  async function sauvegarderAvis(membreId: string, membreNom: string) {
    const f = avisForm[membreId] || {}
    await createClient().from('commission_avis').upsert({ demande_id: demandeId, membre_id: membreId, membre_nom: membreNom, avis: f.avis || null, tarif_propose: f.tarif ? parseFloat(f.tarif) : null, commentaire: f.commentaire || null, updated_at: new Date().toISOString() })
    await load()
  }

  async function decider(statut: 'accepte' | 'refuse') {
    if (statut === 'accepte' && !tarifDecide) { alert('Saisissez le tarif accordé'); return }
    setSaving(true)
    const s = createClient(); const { data: { session } } = await s.auth.getSession()
    await s.from('demandes_reduction').update({ statut, tarif_accorde: statut === 'accepte' ? parseFloat(tarifDecide) : null, note_interne: noteInterne, tarif_accorde_par: tarifAccordePar, date_commission: dateCommission, decide_par: session?.user.id, decide_le: new Date().toISOString() }).eq('id', demandeId)
    await load(); setSaving(false)
  }

  function printFiche() { window.print() }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (!demande) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Dossier introuvable</div>

  const st = formatStatut(demande.statut)
  const isDecide = ['accepte', 'refuse'].includes(demande.statut)

  // ── ANALYSE FINANCIÈRE ──
  const totalRev = parseFloat(demande.revenus_total_mensuel) || 0
  const totalChargesLog = (parseFloat(demande.logement_loyer_mensuel) || 0) + (parseFloat(demande.logement_charges_mensuelles) || 0)
  const totalScolaritesAutres = (demande.enfants_autres_etablissements || []).reduce((s: number, e: any) => s + (parseFloat(e.tarif_mensuel) || 0), 0)
  const resteAvie = totalRev - totalChargesLog - totalScolaritesAutres
  const tarifOfficiel = parseFloat(demande.nb_enfants_concernes > 0 ? (demande.tarif_officiel || 0) : 0)
  const scolariteN1 = parseFloat(famille?.scolarite_n1) || 0

  // Comparaison proposition vs N-1
  const evolutionVsN1 = scolariteN1 > 0 ? Math.round(((parseFloat(demande.tarif_propose) - scolariteN1) / scolariteN1) * 100) : null

  // Taux logement
  const tauxLogement = totalRev > 0 ? Math.round((totalChargesLog / totalRev) * 100) : 0

  // Alerte demande trop basse (si < 45% du tarif proposé l'an dernier)
  const alertBasse = scolariteN1 > 0 && parseFloat(demande.tarif_propose) < scolariteN1 * 0.7

  // Suggestion fourchette basée sur reste à vivre
  const getSuggestion = () => {
    if (!totalRev) return null
    const ratio = resteAvie / totalRev
    if (ratio < 0.3) return { label: 'Situation précaire', min: scolariteN1 * 0.5, max: scolariteN1 * 0.7, color: '#EF4444' }
    if (ratio < 0.5) return { label: 'Situation modeste', min: scolariteN1 * 0.7, max: scolariteN1 * 0.85, color: '#F59E0B' }
    if (ratio < 0.7) return { label: 'Situation intermédiaire', min: scolariteN1 * 0.85, max: scolariteN1 * 0.95, color: '#0891B2' }
    return { label: 'Situation confortable', min: scolariteN1 * 0.95, max: scolariteN1, color: '#10B981' }
  }
  const suggestion = getSuggestion()

  const avisCount = { favorable: 0, defavorable: 0, reserve: 0, abstention: 0 }
  avis.forEach((a: any) => { if (a.avis) avisCount[a.avis as keyof typeof avisCount]++ })
  const tarifsProposés = avis.filter((a: any) => a.tarif_propose).map((a: any) => parseFloat(a.tarif_propose))
  const moyenneTarifs = tarifsProposés.length > 0 ? Math.round(tarifsProposés.reduce((s, v) => s + v, 0) / tarifsProposés.length) : null

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

  const InfoBlock = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div>
      <div style={lbl}>{label}</div>
      <div style={{ fontSize: 13, color: color || '#1E293B', fontWeight: color ? 700 : 400 }}>{value || '—'}</div>
    </div>
  )

  return (
    <>
      {/* CSS Print */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #fiche-commission, #fiche-commission * { visibility: visible !important; }
          #fiche-commission { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          button { display: none !important; }
        }
      `}</style>

      <div id="fiche-commission" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960, fontFamily: 'Inter, sans-serif' }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }} className="no-print">
          <button onClick={() => router.push(`/${ecole.slug}/inscriptions`)} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>← Retour</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: 0 }}>Dossier — {famille?.nom || '—'}</h1>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{demande.annee_scolaire} · {demande.nb_enfants_concernes} enfant(s) · Proposition : <strong>{parseFloat(demande.tarif_propose || 0).toLocaleString('fr-FR')} €</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={printFiche} style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: '#475569', cursor: 'pointer' }}>🖨️ Imprimer</button>
            {demande.statut === 'soumis' && <button onClick={passerEnEtude} style={{ background: '#0891B2', border: 'none', borderRadius: 9, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>→ En étude</button>}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: st.color, background: st.bg, padding: '6px 16px', borderRadius: 20 }}>{st.label}</span>
        </div>

        {/* ── TITRE IMPRIMABLE ── */}
        <div style={{ display: 'none' }} className="print-header">
          <div style={{ textAlign: 'center', borderBottom: '2px solid #1E293B', paddingBottom: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>COMMISSION DEMANDE DE RÉDUCTION</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Fiche d'étude famille</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Commission du : {dateCommission ? new Date(dateCommission).toLocaleDateString('fr-FR') : '___________'}</div>
          </div>
        </div>

        {/* ── GRILLE PRINCIPALE ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isIPad ? '1fr' : '1fr 1fr', gap: 16 }}>

          {/* COL GAUCHE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Identité */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Identité</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <InfoBlock label="Famille" value={famille?.nom} />
                <InfoBlock label="Situation" value={demande.situation_familiale} />
                <InfoBlock label="Responsable 1" value={`${famille?.parent1_prenom || ''} ${famille?.parent1_nom || ''}`.trim()} />
                <InfoBlock label="Téléphone" value={famille?.parent1_telephone} />
                <InfoBlock label="Email" value={famille?.parent1_email} />
                <InfoBlock label="Adresse" value={[famille?.parent1_adresse, famille?.parent1_code_postal, famille?.parent1_ville].filter(Boolean).join(' ')} />
              </div>
            </div>

            {/* Logement */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Logement</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <InfoBlock label="Type" value={demande.logement_type} />
                <InfoBlock label="Pièces" value={demande.logement_nb_pieces?.toString()} />
                <InfoBlock label="Loyer mensuel" value={demande.logement_loyer_mensuel ? `${demande.logement_loyer_mensuel} €` : null} />
                <InfoBlock label="Charges" value={demande.logement_charges_mensuelles ? `${demande.logement_charges_mensuelles} €` : null} />
                {demande.logement_date_occupation && <InfoBlock label="Occupé depuis" value={new Date(demande.logement_date_occupation).toLocaleDateString('fr-FR')} />}
                {demande.logement_personne_handicapee && <div style={{ gridColumn: '1/-1' }}><span style={{ fontSize: 11, background: '#EDE9FE', color: '#7C3AED', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>Personne handicapée au foyer</span></div>}
              </div>
            </div>

            {/* Revenus */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Revenus</div>
              {revenus.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    {['Nom', 'Lien', 'Employeur', 'Salaire net', 'Mois'].map(h => <th key={h} style={{ padding: '5px 8px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, fontSize: 10 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{revenus.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.nom_prenom}</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.lien_parente}</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.employeur}</td>
                      <td style={{ padding: '6px 8px', color: '#059669', fontWeight: 600 }}>{parseFloat(r.salaire_mensuel_net || 0).toLocaleString('fr-FR')} €</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{r.nb_mois}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {demande.revenus_artisans_profession && (
                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
                  <strong>{demande.revenus_artisans_profession}</strong> ({demande.revenus_artisans_regime}) — {(parseFloat(demande.revenus_artisans_montant_annuel) / 12).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €/mois
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['CAF/Alloc. familiales', demande.alloc_familiales_mensuelles],
                  ['QF CAF', demande.quotient_familial],
                  ['Chômage', demande.alloc_chomage_mensuelle],
                  ['APL', demande.apl_mensuelle],
                  ['Autres', demande.autres_revenus_mensuels],
                  ['Aides', demande.aides_mensuelles],
                ].filter(([_, v]) => v).map(([label, value]) => (
                  <div key={label as string} style={{ background: '#F8FAFC', borderRadius: 6, padding: '6px 10px' }}>
                    <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{parseFloat(value as string).toLocaleString('fr-FR')} €/mois</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Autres enfants */}
            {demande.enfants_autres_etablissements?.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Autres établissements</div>
                {demande.enfants_autres_etablissements.map((e: any, i: number) => (
                  <div key={i} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid #F8FAFC' }}>
                    <strong>{e.prenom}</strong> ({e.classe}) — {e.etablissement} — {e.tarif_mensuel} €/mois × {e.nb_mois}
                  </div>
                ))}
              </div>
            )}

            {/* Personnes à charge */}
            {demande.personnes_charge?.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Personnes à charge</div>
                {demande.personnes_charge.map((p: any, i: number) => (
                  <div key={i} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid #F8FAFC' }}>
                    {p.prenom} {p.nom} ({p.age} ans) — {p.lien_parente}
                  </div>
                ))}
              </div>
            )}

            {/* Proposition */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 700, marginBottom: 6 }}>Proposition de la famille</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1D4ED8' }}>{parseFloat(demande.tarif_propose || 0).toLocaleString('fr-FR')} €</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Pour {demande.nb_enfants_concernes} enfant(s)</div>
              {demande.commentaire && <div style={{ marginTop: 10, fontSize: 12, color: '#475569', background: '#fff', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #BFDBFE', fontStyle: 'italic' }}>{demande.commentaire}</div>}
            </div>

            {/* Pièces */}
            {documents.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Pièces jointes ({documents.length})</div>
                {documents.map((d: any) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #F8FAFC', textDecoration: 'none', color: '#2563EB', fontSize: 12 }}>
                    📄 <span style={{ flex: 1 }}>{d.label}</span><span style={{ fontSize: 11, color: '#94A3B8' }}>{d.taille_ko} Ko →</span>
                  </a>
                ))}
                {demande.signature_url && (
                  <a href={demande.signature_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', textDecoration: 'none', color: '#059669', fontSize: 12, fontWeight: 600 }}>
                    ✍️ Signature sur l'honneur →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* COL DROITE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── ANALYSE FINANCIÈRE ── */}
            <div style={{ background: '#1E293B', borderRadius: 14, padding: 20, color: '#fff' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 14, letterSpacing: '0.06em' }}>ANALYSE FINANCIÈRE</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Revenus totaux', value: `${totalRev.toLocaleString('fr-FR')} €/mois`, color: '#60A5FA' },
                  { label: 'Charges habitat', value: `${totalChargesLog.toLocaleString('fr-FR')} €/mois`, color: 'rgba(255,255,255,0.8)' },
                  { label: 'Reste à vivre', value: `${resteAvie.toLocaleString('fr-FR')} €/mois`, color: resteAvie < 1500 ? '#FCA5A5' : resteAvie < 2500 ? '#FCD34D' : '#34D399' },
                  { label: 'QF CAF', value: demande.quotient_familial ? `${demande.quotient_familial} €` : '—', color: 'rgba(255,255,255,0.8)' },
                  { label: 'Taux logement', value: `${tauxLogement}%`, color: tauxLogement > 40 ? '#FCA5A5' : 'rgba(255,255,255,0.8)' },
                  { label: 'Scolarités ext.', value: `${totalScolaritesAutres.toLocaleString('fr-FR')} €/mois`, color: 'rgba(255,255,255,0.8)' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Scolarité N-1 */}
              {scolariteN1 > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>COMPARAISON AVEC SCOLARITÉ N-1 ({famille?.scolarite_n1_annee || '2025-2026'})</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Montant N-1</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{scolariteN1.toLocaleString('fr-FR')} €</div>
                    </div>
                    <div style={{ fontSize: 24 }}>→</div>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Proposition actuelle</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#60A5FA' }}>{parseFloat(demande.tarif_propose || 0).toLocaleString('fr-FR')} €</div>
                    </div>
                    {evolutionVsN1 !== null && (
                      <div style={{ background: evolutionVsN1 < -20 ? 'rgba(239,68,68,0.2)' : evolutionVsN1 < 0 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)', borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: evolutionVsN1 < -20 ? '#FCA5A5' : evolutionVsN1 < 0 ? '#FCD34D' : '#34D399' }}>
                          {evolutionVsN1 > 0 ? '+' : ''}{evolutionVsN1}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Alerte + Suggestion */}
              {alertBasse && (
                <div style={{ background: 'rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>⚠️</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#FCA5A5' }}>Demande très basse</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>La proposition est significativement inférieure à l'an dernier</div>
                  </div>
                </div>
              )}

              {suggestion && scolariteN1 > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>SUGGESTION OUTIL — {suggestion.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Fourchette estimée</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: suggestion.color }}>
                      {Math.round(suggestion.min).toLocaleString('fr-FR')} — {Math.round(suggestion.max).toLocaleString('fr-FR')} €
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Synthèse avis commission */}
            {avis.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Synthèse commission</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {Object.entries(avisCount).filter(([, n]) => n > 0).map(([k, n]) => {
                    const cfg = AVIS_CONFIG[k]
                    return <div key={k} style={{ flex: 1, textAlign: 'center', background: cfg.bg, borderRadius: 10, padding: '10px 8px' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{n}</div>
                      <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                    </div>
                  })}
                </div>
                {moyenneTarifs && <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>MOYENNE DES TARIFS PROPOSÉS</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{moyenneTarifs.toLocaleString('fr-FR')} €</div>
                </div>}
              </div>
            )}

            {/* Avis membres — version iPad large */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Avis des membres</div>
              {membres.map((membre: any) => {
                const f = avisForm[membre.id] || { avis: '', tarif: '', commentaire: '' }
                const avisExistant = avis.find((a: any) => a.membre_id === membre.id)
                const avisConfig = avisExistant?.avis ? AVIS_CONFIG[avisExistant.avis] : null
                return (
                  <div key={membre.id} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {(membre.prenom || membre.nom)[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{membre.prenom} {membre.nom}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{membre.role_label}</div>
                      </div>
                      {avisConfig && <span style={{ fontSize: 12, fontWeight: 700, color: avisConfig.color, background: avisConfig.bg, padding: '4px 12px', borderRadius: 20 }}>{avisConfig.icon} {avisConfig.label}</span>}
                    </div>
                    {!isDecide && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Boutons avis — plus grands pour iPad */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                          {Object.entries(AVIS_CONFIG).map(([val, cfg]) => (
                            <button key={val} onClick={() => setAvisForm((p: any) => ({ ...p, [membre.id]: { ...p[membre.id], avis: val } }))}
                              style={{ padding: isIPad ? '14px 6px' : '8px 4px', borderRadius: 9, border: `1px solid ${f.avis === val ? cfg.color : '#E2E8F0'}`, background: f.avis === val ? cfg.bg : '#F8FAFC', color: f.avis === val ? cfg.color : '#94A3B8', fontSize: isIPad ? 13 : 11, fontWeight: f.avis === val ? 700 : 400, cursor: 'pointer' }}>
                              {cfg.icon} {cfg.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                          <div>
                            <label style={lbl}>Tarif proposé (€)</label>
                            <input style={inp} type="number" value={f.tarif || ''} placeholder="Ex: 2 500"
                              onChange={e => setAvisForm((p: any) => ({ ...p, [membre.id]: { ...p[membre.id], tarif: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={lbl}>Commentaire</label>
                            <input style={inp} value={f.commentaire || ''} placeholder="Observation..."
                              onChange={e => setAvisForm((p: any) => ({ ...p, [membre.id]: { ...p[membre.id], commentaire: e.target.value } }))} />
                          </div>
                        </div>
                        <button onClick={() => sauvegarderAvis(membre.id, `${membre.prenom} ${membre.nom}`)}
                          style={{ background: '#2563EB', border: 'none', borderRadius: 8, padding: isIPad ? '13px' : '8px 16px', color: '#fff', fontSize: isIPad ? 14 : 12, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                          {avisExistant ? '↺ Mettre à jour l\'avis' : '✓ Enregistrer l\'avis'}
                        </button>
                      </div>
                    )}
                    {isDecide && avisExistant && (
                      <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>
                        {avisExistant.tarif_propose && `${parseFloat(avisExistant.tarif_propose).toLocaleString('fr-FR')} €`}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 16 }}>⚖️ Décision de la commission</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lbl}>Date de la commission</label><input style={inp} type="date" value={dateCommission} onChange={e => setDateCommission(e.target.value)} /></div>
                    <div><label style={lbl}>Décision prise par</label><input style={inp} value={tarifAccordePar} onChange={e => setTarifAccordePar(e.target.value)} placeholder="Nom du décideur" /></div>
                  </div>
                  <div>
                    <label style={lbl}>Tarif annuel accordé (€)</label>
                    <input style={{ ...inp, fontSize: 20, fontWeight: 700, textAlign: 'center', padding: '14px', color: '#059669' }}
                      type="number" value={tarifDecide} onChange={e => setTarifDecide(e.target.value)}
                      placeholder={moyenneTarifs ? `Suggestion : ${moyenneTarifs.toLocaleString('fr-FR')}` : 'Montant'} />
                    {moyenneTarifs && !tarifDecide && (
                      <button onClick={() => setTarifDecide(moyenneTarifs.toString())} style={{ fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                        Utiliser la moyenne : {moyenneTarifs.toLocaleString('fr-FR')} €
                      </button>
                    )}
                  </div>
                  <div><label style={lbl}>Note interne (non visible par le parent)</label>
                    <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={noteInterne} onChange={e => setNoteInterne(e.target.value)} placeholder="Observations, contexte..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <button onClick={() => decider('refuse')} disabled={saving} style={{ padding: isIPad ? '16px' : '12px', background: 'rgba(239,68,68,0.1)', border: '2px solid #EF4444', borderRadius: 10, color: '#EF4444', fontSize: isIPad ? 16 : 14, fontWeight: 700, cursor: 'pointer' }}>✗ Refuser</button>
                    <button onClick={() => decider('accepte')} disabled={saving || !tarifDecide} style={{ padding: isIPad ? '16px' : '12px', background: '#10B981', border: 'none', borderRadius: 10, color: '#fff', fontSize: isIPad ? 16 : 14, fontWeight: 700, cursor: !tarifDecide ? 'not-allowed' : 'pointer', opacity: !tarifDecide ? 0.5 : 1 }}>
                      ✓ Accepter {tarifDecide ? `— ${parseFloat(tarifDecide).toLocaleString('fr-FR')} €` : ''}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: demande.statut === 'accepte' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `2px solid ${demande.statut === 'accepte' ? '#10B981' : '#EF4444'}`, borderRadius: 14, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{demande.statut === 'accepte' ? '✅' : '❌'}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: demande.statut === 'accepte' ? '#059669' : '#DC2626' }}>{demande.statut === 'accepte' ? 'Accepté' : 'Refusé'}</div>
                {demande.tarif_accorde && <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 8 }}>{parseFloat(demande.tarif_accorde).toLocaleString('fr-FR')} €</div>}
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>{demande.tarif_accorde_par}{demande.date_commission && ` · ${new Date(demande.date_commission).toLocaleDateString('fr-FR')}`}</div>
                {demande.note_interne && <div style={{ marginTop: 10, fontSize: 12, color: '#64748B', background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'left', fontStyle: 'italic' }}>{demande.note_interne}</div>}
                <button onClick={async () => { await createClient().from('demandes_reduction').update({ statut: 'en_etude', tarif_accorde: null, decide_le: null }).eq('id', demandeId); await load() }}
                  style={{ marginTop: 12, fontSize: 11, color: '#94A3B8', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                  ↺ Corriger la décision
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
