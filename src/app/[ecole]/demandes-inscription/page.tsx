'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useI18n } from '@/lib/i18n'

/**
 * Demandes d'inscription : l'admin envoie un lien a un parent prospect,
 * suit les demandes recues et les accepte / refuse.
 * L'acceptation cree automatiquement la famille, l'enfant et le compte parent.
 */

type Exercice = { id: string; code: string; libelle: string | null; statut: string }
type Demande = {
  id: string; statut: string; email_invite: string; annee_scolaire: string
  exercice_id: string | null; created_at: string; envoye_le: string | null
  soumis_le: string | null; traite_le: string | null; motif_refus: string | null
  nom_famille: string | null; situation_maritale: string | null
  parent1_prenom: string | null; parent1_nom: string | null; parent1_email: string | null
  parent1_telephone: string | null; parent1_emploi: string | null; parent1_adresse: string | null
  parent1_code_postal: string | null; parent1_ville: string | null
  parent2_prenom: string | null; parent2_nom: string | null; parent2_email: string | null
  parent2_telephone: string | null; parent2_emploi: string | null; parent2_adresse: string | null
  parent2_code_postal: string | null; parent2_ville: string | null
  enfant_prenom: string | null; enfant_deuxieme_prenom: string | null; enfant_nom: string | null
  enfant_genre: string | null; enfant_date_naissance: string | null; enfant_lieu_naissance: string | null
  classe_souhaitee: string | null; date_entree_souhaitee: string | null
  deja_scolarise: boolean | null; etablissement_precedent: string | null
  transport: boolean | null; instruction_religieuse: boolean | null; etude_garderie: boolean | null
  signes_particuliers: string | null; medecin_nom: string | null; medecin_telephone: string | null
  urgence_1_nom: string | null; urgence_1_tel: string | null; urgence_1_lien: string | null
  urgence_2_nom: string | null; urgence_2_tel: string | null; urgence_2_lien: string | null
}

const STATUTS: Record<string, { label: string; color: string; bg: string }> = {
  envoye: { label: 'Lien envoyé', color: '#1E40AF', bg: '#EFF6FF' },
  en_attente: { label: 'À traiter', color: '#92400E', bg: '#FEF3C7' },
  accepte: { label: 'Acceptée', color: '#065F46', bg: '#ECFDF5' },
  refuse: { label: 'Refusée', color: '#991B1B', bg: '#FEF2F2' },
}

export default function DemandesInscriptionPage() {
  const { t } = useI18n()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [exercices, setExercices] = useState<Exercice[]>([])
  const [filtre, setFiltre] = useState<'tous' | 'envoye' | 'en_attente' | 'accepte' | 'refuse'>('en_attente')

  const [showEnvoi, setShowEnvoi] = useState(false)
  const [email, setEmail] = useState('')
  const [exerciceId, setExerciceId] = useState('')
  const [envoiMsg, setEnvoiMsg] = useState('')
  const [envoiErr, setEnvoiErr] = useState('')
  const [envoiLoading, setEnvoiLoading] = useState(false)

  const [detail, setDetail] = useState<Demande | null>(null)
  const [traiteLoading, setTraiteLoading] = useState(false)
  const [traiteMsg, setTraiteMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: d }, { data: ex }] = await Promise.all([
      s.from('demandes_inscription').select('*').eq('ecole_id', ecole.id).order('created_at', { ascending: false }),
      s.from('exercices').select('id, code, libelle, statut').eq('ecole_id', ecole.id).order('code', { ascending: false }),
    ])
    setDemandes((d ?? []) as Demande[])
    setExercices((ex ?? []) as Exercice[])
    if (!exerciceId && ex && ex.length > 0) {
      const ouvert = ex.find((e: Exercice) => e.statut === 'ouvert') || ex[0]
      setExerciceId(ouvert.id)
    }
    setLoading(false)
  }, [ecole?.id])
  useEffect(() => { load() }, [load])

  async function envoyerLien() {
    setEnvoiErr(''); setEnvoiMsg('')
    if (!email.trim()) { setEnvoiErr('Veuillez saisir un email.'); return }
    if (!exerciceId) { setEnvoiErr('Veuillez choisir un exercice.'); return }
    setEnvoiLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    try {
      const res = await fetch('/api/admin/envoyer-lien-inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: email.trim(), ecoleId: ecole.id, exerciceId }),
      })
      const data = await res.json()
      setEnvoiLoading(false)
      if (!res.ok) { setEnvoiErr(data.error || 'Erreur lors de l\'envoi.'); return }
      setEnvoiMsg(data.emailSent ? `Lien envoye a ${email.trim()}` : `Lien cree. ${data.emailError || ''} Lien : ${data.link}`)
      setEmail('')
      await load()
    } catch (e: any) {
      setEnvoiLoading(false)
      setEnvoiErr('Erreur reseau.')
    }
  }

  async function traiter(action: 'accepter' | 'refuser') {
    if (!detail) return
    let motif = ''
    if (action === 'refuser') {
      motif = window.prompt('Motif du refus (optionnel, sera communique a la famille) :') || ''
    } else {
      if (!window.confirm('Accepter cette demande ? La famille, l\'enfant et le compte parent vont etre crees automatiquement, et un email d\'acces sera envoye.')) return
    }
    setTraiteLoading(true); setTraiteMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    try {
      const res = await fetch('/api/admin/traiter-demande-inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ demandeId: detail.id, action, motif }),
      })
      const data = await res.json()
      setTraiteLoading(false)
      if (!res.ok) { setTraiteMsg('Erreur : ' + (data.error || 'inconnue')); return }
      if (action === 'accepter') {
        setTraiteMsg(data.emailSent
          ? 'Demande acceptee. Famille creee et email d\'acces envoye au parent.'
          : 'Demande acceptee. Famille creee. ' + (data.emailError ? 'Email non envoye : ' + data.emailError : '') + (data.inviteLink ? ' Lien : ' + data.inviteLink : ''))
      } else {
        setTraiteMsg('Demande refusee.')
      }
      await load()
      setTimeout(() => { setDetail(null); setTraiteMsg('') }, 2600)
    } catch (e: any) {
      setTraiteLoading(false)
      setTraiteMsg('Erreur reseau.')
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const stats = {
    envoye: demandes.filter(d => d.statut === 'envoye').length,
    en_attente: demandes.filter(d => d.statut === 'en_attente').length,
    accepte: demandes.filter(d => d.statut === 'accepte').length,
    refuse: demandes.filter(d => d.statut === 'refuse').length,
  }
  const filtres = filtre === 'tous' ? demandes : demandes.filter(d => d.statut === filtre)
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('fr-FR') : '-'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('pages.demandes.title')}</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Envoyez un lien a une nouvelle famille et traitez les demandes recues</p>
        </div>
        <button onClick={() => { setShowEnvoi(true); setEnvoiMsg(''); setEnvoiErr('') }} className="btn-primary">+ Envoyer un lien d&apos;inscription</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <button onClick={() => setFiltre('envoye')} style={{ background: filtre === 'envoye' ? '#EFF6FF' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{stats.envoye}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Liens envoyes</div>
        </button>
        <button onClick={() => setFiltre('en_attente')} style={{ background: filtre === 'en_attente' ? '#FEF3C7' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#92400E' }}>{stats.en_attente}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>A traiter</div>
        </button>
        <button onClick={() => setFiltre('accepte')} style={{ background: filtre === 'accepte' ? '#ECFDF5' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#065F46' }}>{stats.accepte}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Acceptees</div>
        </button>
        <button onClick={() => setFiltre('refuse')} style={{ background: filtre === 'refuse' ? '#FEF2F2' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#991B1B' }}>{stats.refuse}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Refusees</div>
        </button>
        <button onClick={() => setFiltre('tous')} style={{ background: filtre === 'tous' ? '#F1F5F9' : '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1E293B' }}>{demandes.length}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Total</div>
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Recue le', 'Email invite', 'Enfant', 'Classe souhaitee', 'Annee', 'Statut', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#94A3B8' }}>Aucune demande</td></tr>
            ) : filtres.map((d, i) => {
              const st = STATUTS[d.statut] || { label: d.statut, color: '#64748B', bg: '#F1F5F9' }
              return (
                <tr key={d.id} style={{ borderBottom: i < filtres.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{fmtDate(d.soumis_le || d.created_at)}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12 }}>{d.email_invite}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{d.enfant_prenom ? `${d.enfant_prenom} ${d.enfant_nom || ''}` : <span style={{ color: '#CBD5E1' }}>-</span>}</td>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{d.classe_souhaitee || '-'}</td>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{d.annee_scolaire}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {d.statut === 'envoye'
                      ? <span style={{ color: '#94A3B8', fontSize: 12 }}>En attente du parent</span>
                      : <button onClick={() => { setDetail(d); setTraiteMsg('') }} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}>Voir le detail</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal envoi de lien */}
      {showEnvoi && (
        <div onClick={() => !envoiLoading && setShowEnvoi(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 460, width: '100%' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 6 }}>Envoyer un lien d&apos;inscription</h2>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 0, marginBottom: 16 }}>Le parent recevra un email avec un lien securise pour remplir la demande, sans avoir besoin de creer un compte.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Email du parent *</label>
                <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@email.com" />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Exercice / annee scolaire concerne *</label>
                <select style={inp} value={exerciceId} onChange={e => setExerciceId(e.target.value)}>
                  <option value="">- Choisir -</option>
                  {exercices.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.libelle || ex.code}{ex.statut === 'ouvert' ? ' (ouvert)' : ''}</option>
                  ))}
                </select>
              </div>
              {envoiErr && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13 }}>{envoiErr}</div>}
              {envoiMsg && <div style={{ background: '#ECFDF5', color: '#065F46', padding: 10, borderRadius: 8, fontSize: 13, wordBreak: 'break-all' }}>{envoiMsg}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEnvoi(false)} disabled={envoiLoading} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Fermer</button>
                <button type="button" onClick={envoyerLien} disabled={envoiLoading} className="btn-primary">{envoiLoading ? 'Envoi...' : 'Envoyer le lien'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detail demande */}
      {detail && (
        <div onClick={() => !traiteLoading && setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                Demande d&apos;inscription
                {detail.enfant_prenom ? ` - ${detail.enfant_prenom} ${detail.enfant_nom || ''}` : ''}
              </h2>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8', lineHeight: 1 }}>&times;</button>
            </div>

            <DetailBlock titre="Enfant" lignes={[
              ['Prenom', detail.enfant_prenom], ['Deuxieme prenom', detail.enfant_deuxieme_prenom], ['Nom', detail.enfant_nom],
              ['Genre', detail.enfant_genre === 'M' ? 'Garcon' : detail.enfant_genre === 'F' ? 'Fille' : detail.enfant_genre],
              ['Date de naissance', detail.enfant_date_naissance ? new Date(detail.enfant_date_naissance).toLocaleDateString('fr-FR') : null],
              ['Lieu de naissance', detail.enfant_lieu_naissance],
            ]} />
            <DetailBlock titre="Scolarite demandee" lignes={[
              ['Classe souhaitee', detail.classe_souhaitee],
              ['Date d\'entree souhaitee', detail.date_entree_souhaitee ? new Date(detail.date_entree_souhaitee).toLocaleDateString('fr-FR') : null],
              ['Deja scolarise', detail.deja_scolarise ? 'Oui' : 'Non'],
              ['Etablissement precedent', detail.etablissement_precedent],
              ['Transport', detail.transport ? 'Oui' : 'Non'],
              ['Instruction religieuse', detail.instruction_religieuse ? 'Oui' : 'Non'],
              ['Etude / garderie', detail.etude_garderie ? 'Oui' : 'Non'],
            ]} />
            <DetailBlock titre="Responsable 1" lignes={[
              ['Prenom', detail.parent1_prenom], ['Nom', detail.parent1_nom], ['Email', detail.parent1_email],
              ['Telephone', detail.parent1_telephone], ['Profession', detail.parent1_emploi],
              ['Adresse', [detail.parent1_adresse, detail.parent1_code_postal, detail.parent1_ville].filter(Boolean).join(' ')],
            ]} />
            <DetailBlock titre="Responsable 2" lignes={[
              ['Prenom', detail.parent2_prenom], ['Nom', detail.parent2_nom], ['Email', detail.parent2_email],
              ['Telephone', detail.parent2_telephone], ['Profession', detail.parent2_emploi],
              ['Adresse', [detail.parent2_adresse, detail.parent2_code_postal, detail.parent2_ville].filter(Boolean).join(' ')],
            ]} />
            <DetailBlock titre="Famille" lignes={[
              ['Nom de famille', detail.nom_famille], ['Situation familiale', detail.situation_maritale],
            ]} />
            <DetailBlock titre="Sante" lignes={[
              ['Signes particuliers', detail.signes_particuliers], ['Medecin', detail.medecin_nom], ['Tel. medecin', detail.medecin_telephone],
            ]} />
            <DetailBlock titre="Urgences" lignes={[
              ['Contact 1', [detail.urgence_1_nom, detail.urgence_1_tel, detail.urgence_1_lien].filter(Boolean).join(' - ')],
              ['Contact 2', [detail.urgence_2_nom, detail.urgence_2_tel, detail.urgence_2_lien].filter(Boolean).join(' - ')],
            ]} />

            {detail.statut === 'refuse' && detail.motif_refus && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 8 }}>
                Motif du refus : {detail.motif_refus}
              </div>
            )}

            {traiteMsg && (
              <div style={{ background: traiteMsg.startsWith('Erreur') ? '#FEF2F2' : '#ECFDF5', color: traiteMsg.startsWith('Erreur') ? '#991B1B' : '#065F46', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 12, wordBreak: 'break-all' }}>
                {traiteMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid #F1F5F9', paddingTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => window.open(`/${ecole.slug}/demandes-inscription/${detail.id}/print`, '_blank')}
                disabled={traiteLoading}
                style={{ background: '#F1F5F9', color: '#1E293B', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: traiteLoading ? 'not-allowed' : 'pointer' }}
              >
                📄 Imprimer / PDF
              </button>
              {detail.statut === 'en_attente' && (
                <>
                  <button onClick={() => traiter('refuser')} disabled={traiteLoading}
                    style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: traiteLoading ? 'not-allowed' : 'pointer' }}>
                    Refuser
                  </button>
                  <button onClick={() => traiter('accepter')} disabled={traiteLoading} className="btn-primary">
                    {traiteLoading ? 'Traitement...' : 'Accepter et creer la famille'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailBlock({ titre, lignes }: { titre: string; lignes: [string, any][] }) {
  const visibles = lignes.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
  if (visibles.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{titre}</div>
      <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibles.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', fontSize: 13 }}>
            <div style={{ width: 170, color: '#94A3B8', flexShrink: 0 }}>{k}</div>
            <div style={{ color: '#1E293B', fontWeight: 500 }}>{String(v)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
