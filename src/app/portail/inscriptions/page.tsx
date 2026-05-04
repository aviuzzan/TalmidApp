'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ANNEE_COURANTE, formatStatut } from '@/lib/inscriptions'

export default function PortailInscriptionsPage() {
  const router = useRouter()
  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [pedStatus, setPedStatus] = useState<any[]>([])
  const [reduction, setReduction] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }

    const [{ data: fam }, { data: enf }, { data: cfg }, { data: ped }, { data: red }, { data: cont }] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*').eq('famille_id', profile.famille_id),
      s.from('inscriptions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('inscriptions_pedagogiques').select('*, enfants(prenom, nom), secteurs(nom)').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(*, enfants(prenom))').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
    ])
    setFamille(fam); setEnfants(enf ?? []); setConfig(cfg)
    setPedStatus(ped ?? []); setReduction(red); setContrat(cont)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement...</div>
  if (!famille) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Aucune famille liée à ce compte.</div>

  const today = new Date().toISOString().split('T')[0]
  const reductionsOuvertes = config?.reductions_ouvertes && config?.date_cloture_reduction >= today
  const inscriptionsOuvertes = config?.inscriptions_ouvertes && config?.date_cloture_inscription >= today

  // Déterminer le statut global de chaque étape
  const nbEnfantsNouveaux = enfants.filter(e => !pedStatus.find(p => p.enfant_id === e.id && p.statut !== 'brouillon')).length
  const step1Done = pedStatus.some(p => ['soumis', 'accepte'].includes(p.statut))
  const step2Done = reduction && ['soumis', 'en_etude', 'accepte'].includes(reduction.statut)
  const step3Done = contrat && ['soumis', 'valide'].includes(contrat.statut)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'Inter, sans-serif', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>
          Inscriptions {ANNEE_COURANTE}
        </h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          {config?.message_accueil || `Bienvenue ${famille.nom}, retrouvez ici toutes vos démarches d'inscription.`}
        </p>
      </div>

      {/* Étapes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ÉTAPE 1 — Fiche pédagogique (nouveaux élèves seulement) */}
        {nbEnfantsNouveaux > 0 && (
          <EtapeCard
            numero={1}
            titre="Fiche d'inscription pédagogique"
            desc="Pour chaque nouvel élève — à faire une seule fois"
            status={step1Done ? 'done' : 'todo'}
            badge={step1Done ? `${pedStatus.filter(p => ['soumis','accepte'].includes(p.statut)).length} soumis` : `${nbEnfantsNouveaux} enfant(s) à inscrire`}
            ouvert={true}
            onAction={() => router.push('/portail/inscriptions/pedagogique')}
            actionLabel="Remplir la fiche →"
          />
        )}

        {/* ÉTAPE 2 — Demande de réduction (optionnelle) */}
        <EtapeCard
          numero={nbEnfantsNouveaux > 0 ? 2 : 1}
          titre="Demande de réduction"
          desc="Facultatif — à soumettre avant la date limite"
          status={step2Done ? 'done' : reduction?.statut === 'brouillon' ? 'inprogress' : 'todo'}
          badge={
            !reductionsOuvertes
              ? (config?.date_cloture_reduction ? `Clôturé le ${new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}` : 'Fermé')
              : `Avant le ${new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}`
          }
          ouvert={reductionsOuvertes || !!reduction}
          onAction={() => router.push('/portail/inscriptions/reduction')}
          actionLabel={reduction ? 'Voir mon dossier →' : 'Déposer une demande →'}
          optional
        />

        {/* ÉTAPE 3 — Contrat de scolarisation */}
        <EtapeCard
          numero={nbEnfantsNouveaux > 0 ? 3 : 2}
          titre="Contrat de scolarisation"
          desc="Engagement de paiement — obligatoire pour valider l'inscription"
          status={step3Done ? 'done' : contrat?.statut === 'brouillon' ? 'inprogress' : 'todo'}
          badge={
            !inscriptionsOuvertes
              ? (config?.date_cloture_inscription ? `Clôturé le ${new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}` : 'Fermé')
              : `Avant le ${new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}`
          }
          ouvert={inscriptionsOuvertes || !!contrat}
          onAction={() => router.push('/portail/inscriptions/contrat')}
          actionLabel={contrat ? 'Voir mon contrat →' : 'Remplir le contrat →'}
        />
      </div>

      {/* Résumé des enfants */}
      {enfants.length > 0 && (
        <div style={{ marginTop: 28, background: '#F8FAFC', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 12, letterSpacing: '0.05em' }}>VOS ENFANTS</div>
          {enfants.map(e => {
            const ped = pedStatus.find(p => p.enfant_id === e.id)
            const st = ped ? formatStatut(ped.statut) : null
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                  {e.prenom[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{e.prenom} {e.nom}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{ped?.secteurs?.nom || 'Classe à définir'}</div>
                </div>
                {st && <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EtapeCard({ numero, titre, desc, status, badge, ouvert, onAction, actionLabel, optional }: {
  numero: number; titre: string; desc: string; status: 'todo' | 'inprogress' | 'done'
  badge: string; ouvert: boolean; onAction: () => void; actionLabel: string; optional?: boolean
}) {
  const colors = { todo: '#94A3B8', inprogress: '#F59E0B', done: '#10B981' }
  const bgs = { todo: '#F8FAFC', inprogress: 'rgba(245,158,11,0.06)', done: 'rgba(16,185,129,0.06)' }
  const icons = { todo: '○', inprogress: '◑', done: '✓' }
  const color = colors[status]

  return (
    <div style={{ background: bgs[status], border: `1px solid ${status === 'done' ? 'rgba(16,185,129,0.25)' : status === 'inprogress' ? 'rgba(245,158,11,0.25)' : '#E2E8F0'}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Numéro */}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: status === 'done' ? '#10B981' : status === 'inprogress' ? '#F59E0B' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: status === 'todo' ? '#94A3B8' : '#fff', flexShrink: 0 }}>
          {status === 'done' ? '✓' : numero}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{titre}</span>
            {optional && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>OPTIONNEL</span>}
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>{desc}</div>
          <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 6 }}>
            {status === 'done' ? '✓ Soumis' : `📅 ${badge}`}
          </div>
        </div>

        {ouvert && (
          <button onClick={onAction}
            style={{ background: status === 'done' ? '#F1F5F9' : '#2563EB', border: 'none', borderRadius: 10, padding: '9px 18px', color: status === 'done' ? '#64748B' : '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
