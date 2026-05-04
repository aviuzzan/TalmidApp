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
  const [contrat, setContrat] = useState<any>(null)
  const [reduction, setReduction] = useState<any>(null)
  const [contratsEnfants, setContratsEnfants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ecoleId, setEcoleId] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles')
      .select('famille_id, ecole_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.famille_id) { setLoading(false); return }
    setEcoleId(profile.ecole_id)

    const [{ data: fam }, { data: enf }, { data: cfg }, { data: red }, { data: cont }] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*').eq('famille_id', profile.famille_id).order('prenom'),
      s.from('inscriptions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', ANNEE_COURANTE).single(),
      s.from('contrats_scolarisation')
        .select('*, contrat_enfants(enfant_id)')
        .eq('famille_id', profile.famille_id)
        .eq('annee_scolaire', ANNEE_COURANTE)
        .single(),
    ])

    setFamille(fam); setEnfants(enf ?? []); setConfig(cfg)
    setReduction(red); setContrat(cont)
    setContratsEnfants(cont?.contrat_enfants?.map((c: any) => c.enfant_id) ?? [])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <div style={{ color: '#64748B', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  if (!famille) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>
      Aucune famille liée à ce compte. Contactez l'école.
    </div>
  )

  const today = new Date().toISOString().split('T')[0]
  const reductionsOuvertes = config?.reductions_ouvertes &&
    config?.date_ouverture_reduction <= today &&
    config?.date_cloture_reduction >= today
  const inscriptionsOuvertes = config?.inscriptions_ouvertes &&
    config?.date_ouverture_inscription <= today &&
    config?.date_cloture_inscription >= today

  // Séparer enfants existants vs nouveaux (ceux déjà dans contrat = déjà traités)
  const enfantsExistants = enfants // tous les enfants déjà en base
  const contratSoumis = contrat && ['soumis', 'valide'].includes(contrat.statut)

  const inp = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'Inter, sans-serif', padding: '0 0 48px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>
          Inscriptions {ANNEE_COURANTE}
        </h1>
        {config?.message_accueil && (
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>{config.message_accueil}</p>
        )}
      </div>

      {/* ── SECTION 1 : Réinscriptions des enfants existants ── */}
      {enfantsExistants.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎓</span> Vos enfants
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {enfantsExistants.map(enfant => {
              const dansContrat = contratsEnfants.includes(enfant.id)
              return (
                <div key={enfant.id} style={{
                  background: '#fff', border: `1px solid ${dansContrat ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`,
                  borderRadius: 12, padding: '16px 18px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800, color: '#fff',
                  }}>
                    {enfant.prenom?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
                      {enfant.prenom} {enfant.nom}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      Élève inscrit
                    </div>
                  </div>
                  {dansContrat ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '4px 12px' }}>
                      ✓ Réinscrit
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '4px 12px', fontWeight: 600 }}>
                      En attente
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SECTION 2 : Étapes ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Demande de réduction — optionnel */}
        <EtapeCard
          numero={1}
          titre="Demande de réduction"
          desc="Facultatif — déposez votre dossier avant la date limite"
          optional
          status={
            reduction && ['soumis','en_etude','accepte'].includes(reduction.statut) ? 'done'
            : reduction?.statut === 'brouillon' ? 'inprogress'
            : 'todo'
          }
          ouvert={reductionsOuvertes || !!reduction}
          dateLimite={config?.date_cloture_reduction
            ? `Avant le ${new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}`
            : null}
          statutLabel={reduction ? formatStatut(reduction.statut).label : null}
          statutColor={reduction ? formatStatut(reduction.statut).color : null}
          onAction={() => router.push('/portail/inscriptions/reduction')}
          actionLabel={reduction ? 'Voir mon dossier →' : 'Déposer une demande →'}
        />

        {/* Contrat de scolarisation — principal */}
        <EtapeCard
          numero={2}
          titre="Contrat de scolarisation"
          desc={
            enfantsExistants.length > 0
              ? `Réinscrivez ${enfantsExistants.length > 1 ? 'vos enfants' : enfant_prenom(enfantsExistants)} pour ${ANNEE_COURANTE}`
              : `Finalisez votre inscription pour ${ANNEE_COURANTE}`
          }
          status={contratSoumis ? 'done' : contrat?.statut === 'brouillon' ? 'inprogress' : 'todo'}
          ouvert={inscriptionsOuvertes || !!contrat}
          dateLimite={config?.date_cloture_inscription
            ? `Avant le ${new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}`
            : null}
          statutLabel={contrat ? formatStatut(contrat.statut).label : null}
          statutColor={contrat ? formatStatut(contrat.statut).color : null}
          onAction={() => router.push('/portail/inscriptions/contrat')}
          actionLabel={contrat ? 'Voir mon contrat →' : `Remplir le contrat${enfantsExistants.length > 1 ? ` (${enfantsExistants.length} enfants)` : ''} →`}
          highlight
        />

        {/* Nouvel enfant — toujours visible */}
        <div style={{
          background: '#F8FAFC', border: '1px dashed #CBD5E1',
          borderRadius: 12, padding: '16px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
              ➕ Inscrire un nouvel enfant
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              Pour un enfant qui n'est pas encore dans notre système
            </div>
          </div>
          <button
            onClick={() => router.push('/portail/inscriptions/pedagogique')}
            style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9, padding: '8px 16px', fontSize: 12, color: '#475569', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
            Fiche d'inscription →
          </button>
        </div>
      </div>

      {/* Dates clés */}
      {(config?.date_cloture_reduction || config?.date_cloture_inscription) && (
        <div style={{ marginTop: 28, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 12, letterSpacing: '0.05em' }}>DATES CLÉS</div>
          {config.date_cloture_reduction && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              <span>Clôture demandes de réduction</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>
                {new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}
          {config.date_cloture_inscription && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}>
              <span>Clôture contrats de scolarisation</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>
                {new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function enfant_prenom(enfants: any[]) {
  return enfants[0]?.prenom || 'votre enfant'
}

function EtapeCard({ numero, titre, desc, status, ouvert, dateLimite, statutLabel, statutColor, onAction, actionLabel, optional, highlight }: {
  numero: number; titre: string; desc: string
  status: 'todo' | 'inprogress' | 'done'
  ouvert: boolean; dateLimite: string | null
  statutLabel: string | null; statutColor: string | null
  onAction: () => void; actionLabel: string
  optional?: boolean; highlight?: boolean
}) {
  const isDone = status === 'done'
  const isProgress = status === 'inprogress'

  return (
    <div style={{
      background: highlight && !isDone ? 'linear-gradient(135deg, #EFF6FF, #F0F9FF)' : '#fff',
      border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : highlight ? '#BFDBFE' : '#E2E8F0'}`,
      borderRadius: 14, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Numéro */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: isDone ? '#10B981' : isProgress ? '#F59E0B' : highlight ? '#2563EB' : '#E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: isDone || highlight || isProgress ? '#fff' : '#94A3B8',
        }}>
          {isDone ? '✓' : numero}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{titre}</span>
            {optional && (
              <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
                OPTIONNEL
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{desc}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {statutLabel && (
              <span style={{ fontSize: 11, fontWeight: 600, color: statutColor || '#64748B', background: `${statutColor}18`, borderRadius: 20, padding: '3px 10px' }}>
                {statutLabel}
              </span>
            )}
            {dateLimite && !isDone && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>📅 {dateLimite}</span>
            )}
          </div>
        </div>

        {ouvert && (
          <button onClick={onAction}
            style={{
              background: isDone ? '#F1F5F9' : highlight ? '#2563EB' : '#1E293B',
              border: 'none', borderRadius: 10, padding: '10px 18px',
              color: isDone ? '#64748B' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
              boxShadow: !isDone && highlight ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
            }}>
            {actionLabel}
          </button>
        )}

        {!ouvert && !isDone && (
          <span style={{ fontSize: 12, color: '#CBD5E1', flexShrink: 0 }}>Fermé</span>
        )}
      </div>
    </div>
  )
}
