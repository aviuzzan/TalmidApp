'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatStatut } from '@/lib/inscriptions'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { labelModePaiement } from '@/lib/statuts'
import AideEtape from '@/components/portail/AideEtape'

type SubTab = 'dossier' | 'facture' | 'documents'

export default function PortailInscriptionsPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initTab = (searchParams.get('tab') as SubTab) || 'dossier'
  const [tab, setTab] = useState<SubTab>(initTab)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: 'Inter, sans-serif', padding: '0 0 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Année {anneeInscription}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
          Tout pour préparer la rentrée : votre dossier d'inscription, votre facture et les documents partagés par l'école.
        </p>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 22, overflowX: 'auto' }}>
        {([
          { id: 'dossier', label: '📋 Dossier d\'inscription' },
          { id: 'facture', label: '💰 Facture' },
          { id: 'documents', label: '📂 Documents école' },
        ] as { id: SubTab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#1E293B' : '#64748B',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              whiteSpace: 'nowrap', minHeight: 38,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dossier' && <DossierTab router={router} />}
      {tab === 'facture' && <FactureTab />}
      {tab === 'documents' && <DocumentsTab />}
    </div>
  )
}

// ── ONGLET 1 : DOSSIER (DDR + Contrat + Nouvel enfant) ──
function DossierTab({ router }: { router: any }) {
  const { anneeInscription } = useAnneeInscription()
  const parent = useParentCtx()
  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)
  const [reduction, setReduction] = useState<any>(null)
  const [contratsEnfants, setContratsEnfants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) return
    const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }

    const [{ data: fam }, { data: enf }, { data: cfg }, { data: red }, { data: cont }] = await Promise.all([
      s.from('familles').select('*').eq('id', profile.famille_id).single(),
      s.from('enfants').select('*').eq('famille_id', profile.famille_id).order('prenom'),
      s.from('inscriptions_config').select('*').eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('demandes_reduction').select('*').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      s.from('contrats_scolarisation').select('*, contrat_enfants(enfant_id)').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
    ])
    setFamille(fam); setEnfants(enf ?? []); setConfig(cfg)
    setReduction(red); setContrat(cont)
    setContratsEnfants(cont?.contrat_enfants?.map((c: any) => c.enfant_id) ?? [])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!famille) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>Aucune famille liée à ce compte. Contactez l'école.</div>

  const today = new Date().toISOString().split('T')[0]
  // Éligibilité DDR : 4 conditions cumulatives
  //  1) toggle reductions_ouvertes activé côté école
  //  2) date du jour dans la période d'ouverture
  //  3) la tranche de la famille est listée dans tranches_eligibles_ddr (si liste non vide)
  //     - si liste vide/null => aucune famille éligible (sécurité par défaut côté école)
  const eligiblesTranches: string[] = config?.tranches_eligibles_ddr || []
  const trancheEligible = famille?.tranche_id && eligiblesTranches.includes(famille.tranche_id)
  const reductionsOuvertes =
    !!config?.reductions_ouvertes
    && config?.date_ouverture_reduction <= today
    && config?.date_cloture_reduction >= today
    && trancheEligible
  const inscriptionsOuvertes = config?.inscriptions_ouvertes && config?.date_ouverture_inscription <= today && config?.date_cloture_inscription >= today

  // Bloquer le contrat si :
  //  1) la famille est éligible à une DDR (trancheEligible)
  //  2) ET aucune DDR encore traitée (statut soumis/en_etude OU pas de DDR du tout)
  //  3) ET la famille n'a PAS renoncé à la DDR pour cette année
  const renoncements = (famille?.renoncements_ddr || {}) as Record<string, any>
  const aRenonce = !!renoncements[anneeInscription]
  const ddrTraitee = reduction && ['accepte', 'refuse'].includes(reduction.statut)
  const contratBloqueParDDR =
    trancheEligible
    && !ddrTraitee
    && !aRenonce

  async function renoncerDDR() {
    if (!famille) return
    if (!confirm(`Confirmez-vous renoncer à la demande de réduction pour ${anneeInscription} ?\n\nVous serez basculé(e) au tarif normal.\nCette décision est définitive pour cette année.`)) return
    const s = createClient()
    const nouveau = { ...renoncements, [anneeInscription]: { renonce_le: new Date().toISOString() } }
    const { error } = await s.from('familles').update({ renoncements_ddr: nouveau }).eq('id', famille.id)
    if (error) { alert('Erreur : ' + error.message); return }
    setFamille({ ...famille, renoncements_ddr: nouveau })
  }
  const contratSoumis = contrat && ['soumis', 'valide'].includes(contrat.statut)

  return (
    <div>
      {!parent.estPrincipal && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#1E40AF', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <div>Les démarches d&apos;inscription (demande de réduction, contrat, ajout d&apos;un nouvel enfant) sont gérées par le <strong>parent principal</strong> de la famille. Vous pouvez en suivre l&apos;avancement ci-dessous.</div>
        </div>
      )}
      {/* Mes enfants */}
      {enfants.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎓</span> Vos enfants
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {enfants.map(enfant => {
              const dansContrat = contratsEnfants.includes(enfant.id)
              return (
                <div key={enfant.id} style={{ background: '#fff', border: `1px solid ${dansContrat ? 'rgba(16,185,129,0.3)' : '#E2E8F0'}`, borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff' }}>{enfant.prenom?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Élève inscrit</div>
                  </div>
                  {dansContrat
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '4px 12px' }}>✓ Réinscrit</span>
                    : <span style={{ fontSize: 12, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '4px 12px', fontWeight: 600 }}>En attente</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Demarches a faire */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Alerte verrou DDR : la famille est eligible, n'a pas encore depose de DDR ni renonce. Bloque le contrat. */}
        {contratBloqueParDDR && !contrat && (
          <div style={{ background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)', border: '1px solid #FDE68A', borderRadius: 16, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#92400E' }}>Une étape avant de pouvoir signer le contrat</div>
            </div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.55, marginBottom: 14 }}>
              Votre tranche vous donne droit à un examen de votre situation par la commission. Pour signer le contrat, vous devez choisir :
            </div>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: '#78350F', lineHeight: 1.7 }}>
              <li><strong>Soit déposer une demande de réduction</strong> et attendre la réponse de la commission.</li>
              <li><strong>Soit renoncer à la réduction</strong> et signer le contrat au tarif normal.</li>
            </ul>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/portail/inscriptions/reduction')}
                style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
                💸 Déposer une demande de réduction
              </button>
              <button onClick={renoncerDDR}
                style={{ background: '#fff', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                Je renonce, tarif normal
              </button>
            </div>
          </div>
        )}

        {/* HERO Contrat — l'action principale, mise en grand */}
        {(() => {
          const ouvertContrat = (inscriptionsOuvertes && !contratBloqueParDDR) || !!contrat
          const titreContrat = contratSoumis
            ? `Contrat ${anneeInscription} signé`
            : enfants.length === 1
              ? `Réinscrire ${enfants[0]?.prenom} pour ${anneeInscription}`
              : enfants.length > 1
                ? `Réinscrire vos ${enfants.length} enfants pour ${anneeInscription}`
                : `Inscrire votre enfant pour ${anneeInscription}`
          const sousTitre = contratSoumis
            ? `Statut : ${formatStatut(contrat?.statut).label}`
            : contratBloqueParDDR
              ? `Disponible après votre choix sur la demande de réduction`
              : config?.date_cloture_inscription
                ? `À signer avant le ${new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}`
                : `Signez le contrat de scolarisation pour préparer la rentrée`
          const actionLabel = contrat ? 'Voir mon contrat' : 'Remplir le contrat'
          return (
            <div style={{
              background: contratSoumis
                ? 'linear-gradient(135deg, #ECFDF5, #D1FAE5)'
                : contratBloqueParDDR
                  ? '#F8FAFC'
                  : 'linear-gradient(135deg, #1E3A8A, #2563EB, #3B82F6)',
              color: contratSoumis || contratBloqueParDDR ? '#1E293B' : '#fff',
              border: contratSoumis
                ? '1px solid #A7F3D0'
                : contratBloqueParDDR
                  ? '1px solid #E2E8F0'
                  : 'none',
              borderRadius: 18,
              padding: '24px 24px 22px',
              boxShadow: !contratSoumis && !contratBloqueParDDR ? '0 10px 30px rgba(37,99,235,0.25)' : 'none',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Decoration */}
              {!contratSoumis && !contratBloqueParDDR && (
                <div aria-hidden style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, position: 'relative' }}>
                <span style={{ fontSize: 22 }}>{contratSoumis ? '✅' : '📝'}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: contratSoumis || contratBloqueParDDR ? 0.6 : 0.85 }}>
                  {contratSoumis ? 'Inscription validée' : contratBloqueParDDR ? 'En attente' : 'Action principale'}
                </span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, margin: '0 0 8px', position: 'relative' }}>
                {titreContrat}
              </h2>
              <div style={{ fontSize: 13, opacity: contratSoumis || contratBloqueParDDR ? 0.8 : 0.92, lineHeight: 1.5, marginBottom: 18, position: 'relative' }}>
                {sousTitre}
              </div>
              {ouvertContrat && (
                <button onClick={() => router.push('/portail/inscriptions/contrat')}
                  style={{
                    background: contratSoumis ? '#fff' : contratBloqueParDDR ? '#E2E8F0' : '#fff',
                    color: contratSoumis ? '#065F46' : contratBloqueParDDR ? '#94A3B8' : '#1E40AF',
                    border: 'none', borderRadius: 12, padding: '14px 22px',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    minHeight: 48, width: '100%', maxWidth: 360,
                    boxShadow: !contratSoumis && !contratBloqueParDDR ? '0 4px 12px rgba(0,0,0,0.12)' : 'none',
                    position: 'relative',
                  }}>
                  {actionLabel} →
                </button>
              )}
              {!ouvertContrat && !contratSoumis && (
                <div style={{ fontSize: 12, opacity: 0.7, position: 'relative' }}>Inscriptions actuellement fermées</div>
              )}
            </div>
          )
        })()}

        {/* DDR optionnelle (si eligible et ouverte) */}
        {(reductionsOuvertes || !!reduction) && (
          <EtapeCard
            icone="💸"
            titre="Demande de réduction"
            desc="Facultatif — déposez votre dossier avant la date limite"
            optional
            status={reduction && ['soumis', 'en_etude', 'accepte'].includes(reduction.statut) ? 'done' : reduction?.statut === 'brouillon' ? 'inprogress' : 'todo'}
            ouvert={reductionsOuvertes || !!reduction}
            dateLimite={config?.date_cloture_reduction ? `Avant le ${new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}` : null}
            statutLabel={reduction ? formatStatut(reduction.statut).label : null}
            statutColor={reduction ? formatStatut(reduction.statut).color : null}
            onAction={() => router.push('/portail/inscriptions/reduction')}
            actionLabel={reduction ? 'Voir mon dossier' : 'Déposer une demande'}
            aide={
              <AideEtape
                titreEtape="Demande de réduction"
                aQuoiCaSert="Vous permet de demander à la commission de l'école une réduction sur les frais de scolarité, en fonction de votre situation financière. Le tarif accordé est ensuite appliqué automatiquement dans votre contrat."
                preparation={[
                  "Votre dernier avis d'imposition",
                  "Vos justificatifs de revenus (salaires, allocations, APL...)",
                  "Vos quittances de loyer ou taxe foncière",
                  "Tout document utile à l'étude de votre dossier",
                ]}
                duree="20 à 30 minutes"
                couleur="#7C3AED"
              />
            }
          />
        )}

        {/* Ajouter un autre enfant — secondaire, discret, en bas */}
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
          padding: '14px 16px', display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: 12, marginTop: 4,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>
            👶
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
                {enfants.length > 0
                  ? `Ajouter un autre enfant que ${enfants.map(e => e.prenom).join(', ')}`
                  : 'Ajouter votre premier enfant'}
              </span>
              <AideEtape
                titreEtape="Ajouter un autre enfant"
                aQuoiCaSert="Permet d'ajouter un enfant qui n'a pas encore de fiche dans l'école — un nouveau-né, un petit frère/petite sœur, ou un enfant qui arrive d'un autre établissement. Vous l'inscrirez dans le contrat dès que l'école aura confirmé son ajout."
                preparation={[
                  "L'état civil de l'enfant (nom, prénom, date de naissance)",
                  "La classe souhaitée pour la rentrée",
                  "Les coordonnées des contacts d'urgence et du médecin",
                ]}
                duree="10 à 15 minutes"
                couleur="#1E293B"
              />
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>
              Vous pourrez l&apos;inscrire dans le contrat dès que l&apos;école aura confirmé son ajout.
            </div>
          </div>
          <button onClick={() => router.push('/portail/inscriptions/pedagogique')}
            style={{
              background: '#F8FAFC', color: '#1E293B', border: '1px solid #CBD5E1',
              borderRadius: 10, padding: '10px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap', minHeight: 40,
            }}>
            + Ajouter
          </button>
        </div>
      </div>

      {((config?.date_cloture_reduction && (reductionsOuvertes || !!reduction)) || config?.date_cloture_inscription) && (
        <div style={{ marginTop: 28, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 12, letterSpacing: '0.05em' }}>DATES CLÉS</div>
          {config.date_cloture_reduction && (reductionsOuvertes || !!reduction) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              <span>Clôture demandes de réduction</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>{new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {config.date_cloture_inscription && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}>
              <span>Clôture contrats de scolarisation</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>{new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ONGLET 2 : FACTURE (année courante) ──
function FactureTab() {
  const { anneeInscription } = useAnneeInscription()
  const [facture, setFacture] = useState<any>(null)
  const [lignes, setLignes] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) return
      const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
      if (!profile?.famille_id) { setLoading(false); return }

      const { data: fact } = await s
        .from('factures_solde').select('*')
        .eq('famille_id', profile.famille_id)
        .eq('annee_scolaire', anneeInscription)
        .maybeSingle()

      if (fact) {
        setFacture(fact)
        const [{ data: lig }, { data: regl }] = await Promise.all([
          s.from('facture_lignes').select('*, enfants(prenom, nom)').eq('facture_id', fact.id),
          s.from('reglements').select('*').eq('facture_id', fact.id).order('date_reglement', { ascending: false }),
        ])
        setLignes(lig ?? [])
        setReglements(regl ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!facture) return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      Aucune facture pour l'année {anneeInscription}.<br /><br />
      <span style={{ fontSize: 12 }}>La facture sera générée automatiquement après la validation de votre contrat de scolarisation par l'école.</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total facturé', value: `${(facture.statut === 'annule' ? 0 : Number(facture.total_facture)).toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Total réglé', value: `${(facture.statut === 'annule' ? 0 : Number(facture.total_regle)).toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
          { label: 'Reste à régler', value: `${(facture.statut === 'annule' ? 0 : Number(facture.solde_restant)).toLocaleString('fr-FR')} €`, color: facture.statut !== 'annule' && Number(facture.solde_restant) > 0 ? '#DC2626' : '#059669', bg: facture.statut !== 'annule' && Number(facture.solde_restant) > 0 ? '#FEF2F2' : '#ECFDF5' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <a href={`/factures/${facture.id}/print?auto=true`} target="_blank" rel="noopener noreferrer" style={{ background: '#2563EB', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '5px 11px', fontSize: 11, fontWeight: 600, marginRight: 10 }}>📥 PDF</a>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Facture {facture.numero}</span>
          <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 10 }}>Émise le {new Date(facture.date_emission).toLocaleDateString('fr-FR')}</span>
        </div>
        {(() => {
          const m: any = {
            en_attente: { label: '⏳ En attente de paiement', color: '#D97706', bg: '#FFFBEB' },
            partiel: { label: '◑ Partiellement réglée', color: '#2563EB', bg: '#EFF6FF' },
            solde: { label: '✓ Soldée', color: '#059669', bg: '#ECFDF5' },
            annule: { label: '✕ Annulée', color: '#DC2626', bg: '#FEF2F2' },
          }
          const s = m[facture.statut] || { label: facture.statut, color: '#64748B', bg: '#F1F5F9' }
          return <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 }}>{s.label}</span>
        })()}
      </div>

      {facture.statut === 'en_attente' && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            <strong>Paiement en attente.</strong> Votre facture vient d'être émise. L'école vous informera prochainement du moyen de règlement (chèques, prélèvement SEPA, ou virement). Aucune action n'est requise pour l'instant.
          </div>
        </div>
      )}
      {facture.statut === 'partiel' && Number(facture.solde_restant) > 0 && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.5 }}>
            <strong>Reste à régler : {Number(facture.solde_restant).toLocaleString('fr-FR')} €.</strong> Vos prochains règlements apparaîtront automatiquement dans l'historique ci-dessous.
          </div>
        </div>
      )}
      {facture.statut === 'annule' && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5 }}>
            <strong>Cette facture a été annulée par l'école.</strong> Si vous avez une question, contactez l'administration.
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>📋 Détail</div>
        {lignes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune ligne</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>{['Élève', 'Description', 'Montant'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{l.enfants ? `${l.enfants.prenom || ''} ${l.enfants.nom || ''}`.trim() : 'Famille'}</td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>{l.description}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>{Number(l.montant).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reglements.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>💳 Règlements</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>{['Date', 'Mode', 'Référence', 'Montant'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {reglements.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{new Date(r.date_reglement).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ background: '#EFF6FF', color: '#2563EB', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{labelModePaiement(r.mode_paiement)}</span></td>
                  <td style={{ padding: '12px 16px', color: '#64748B', fontSize: 13 }}>{r.reference || '—'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669' }}>{Number(r.montant).toLocaleString('fr-FR')} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── ONGLET 3 : DOCUMENTS ÉCOLE ──
function DocumentsTab() {
  const { anneeInscription } = useAnneeInscription()
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) return
      const { data: profile } = await s.from('profiles').select('ecole_id').eq('id', session.user.id).single()
      if (!profile?.ecole_id) { setLoading(false); return }
      const { data } = await s.from('documents_ecole_publics')
        .select('*')
        .eq('ecole_id', profile.ecole_id)
        .eq('annee_scolaire', anneeInscription)
        .eq('actif', true)
        .order('ordre').order('created_at', { ascending: false })
      setDocs(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const TYPES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    circulaire: { label: 'Circulaire', icon: '📢', color: '#2563EB', bg: '#EFF6FF' },
    liste_affaires: { label: "Liste d'affaires", icon: '📝', color: '#7C3AED', bg: '#F5F3FF' },
    calendrier: { label: 'Calendrier', icon: '📅', color: '#059669', bg: '#ECFDF5' },
    reglement: { label: 'Règlement', icon: '📜', color: '#92400E', bg: '#FEF3C7' },
    autre: { label: 'Document', icon: '📄', color: '#64748B', bg: '#F1F5F9' },
  }

  if (docs.length === 0) return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      Aucun document partagé par l'école pour l'année {anneeInscription}.<br /><br />
      <span style={{ fontSize: 12 }}>L'établissement publiera ici la circulaire de rentrée, la liste des affaires, etc.</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {docs.map(d => {
        const t = TYPES[d.type_doc] || TYPES.autre
        return (
          <a key={d.id} href={d.fichier_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: t.bg, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{d.titre}</div>
              {d.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{d.description}</div>}
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                <span style={{ background: t.bg, color: t.color, borderRadius: 5, padding: '1px 8px', fontWeight: 600 }}>{t.label}</span>
                {d.nom_fichier && <span style={{ marginLeft: 8 }}>{d.nom_fichier}</span>}
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>Ouvrir →</span>
          </a>
        )
      })}
    </div>
  )
}

function EtapeCard({ icone, titre, desc, status, ouvert, dateLimite, statutLabel, statutColor, onAction, actionLabel, optional, highlight, aide }: {
  icone?: string; titre: string; desc: string
  status: 'todo' | 'inprogress' | 'done'
  ouvert: boolean; dateLimite: string | null
  statutLabel: string | null; statutColor: string | null
  onAction: () => void; actionLabel: string
  optional?: boolean; highlight?: boolean
  aide?: React.ReactNode
}) {
  const isDone = status === 'done'
  const isProgress = status === 'inprogress'
  return (
    <div style={{
      background: highlight && !isDone ? 'linear-gradient(135deg, #EFF6FF, #F0F9FF)' : '#fff',
      border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : highlight ? '#BFDBFE' : '#E2E8F0'}`,
      borderRadius: 14, padding: '16px 18px',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: isDone ? '#10B981' : isProgress ? '#FEF3C7' : highlight ? '#DBEAFE' : '#F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isDone ? 18 : 20, fontWeight: 800,
        color: isDone ? '#fff' : isProgress ? '#92400E' : highlight ? '#1E40AF' : '#64748B',
      }}>
        {isDone ? '✓' : (icone || '•')}
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{titre}</span>
          {optional && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>FACULTATIF</span>}
          {aide}
        </div>
        <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.45 }}>{desc}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {statutLabel && <span style={{ fontSize: 11, fontWeight: 600, color: statutColor || '#64748B', background: `${statutColor}18`, borderRadius: 20, padding: '3px 10px' }}>{statutLabel}</span>}
          {dateLimite && !isDone && <span style={{ fontSize: 11, color: '#94A3B8' }}>📅 {dateLimite}</span>}
        </div>
      </div>
      {ouvert && (
        <button onClick={onAction}
          style={{
            background: isDone ? '#F1F5F9' : highlight ? '#2563EB' : '#1E293B',
            border: 'none', borderRadius: 10, padding: '10px 16px',
            color: isDone ? '#64748B' : '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', minHeight: 44,
            boxShadow: !isDone && highlight ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
          }}>
          {actionLabel}
        </button>
      )}
      {!ouvert && !isDone && <span style={{ fontSize: 12, color: '#CBD5E1', flexShrink: 0 }}>Fermé</span>}
    </div>
  )
}
