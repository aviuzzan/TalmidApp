'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatStatut } from '@/lib/inscriptions'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import { labelModePaiement } from '@/lib/statuts'
import AideEtape from '@/components/portail/AideEtape'
import { useI18n } from '@/lib/i18n'

type SubTab = 'dossier' | 'facture' | 'documents'

export default function PortailInscriptionsPage() {
  const { anneeInscription } = useAnneeInscription()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initTab = (searchParams.get('tab') as SubTab) || 'dossier'
  const [tab, setTab] = useState<SubTab>(initTab)

  const { t } = useI18n()
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: 'Inter, sans-serif', padding: '0 0 48px' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>{t('portail.inscriptions.title', { annee: anneeInscription })}</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
          {t('portail.inscriptions.subtitle')}
        </p>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 22, overflowX: 'auto' }}>
        {([
          { id: 'dossier', label: t('portail.inscriptions.tab.dossier') },
          { id: 'facture', label: t('portail.inscriptions.tab.invoice') },
          { id: 'documents', label: t('portail.inscriptions.tab.documents') },
        ] as { id: SubTab; label: string }[]).map(tabItem => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
            style={{
              padding: '11px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === tabItem.id ? '#fff' : 'transparent',
              color: tab === tabItem.id ? '#1E293B' : '#64748B',
              fontSize: 13, fontWeight: tab === tabItem.id ? 600 : 400,
              boxShadow: tab === tabItem.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              whiteSpace: 'nowrap', minHeight: 44,
            }}>
            {tabItem.label}
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
  const { t } = useI18n()
  const { anneeInscription } = useAnneeInscription()
  const parent = useParentCtx()
  const [famille, setFamille] = useState<any>(null)
  const [enfants, setEnfants] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [contrat, setContrat] = useState<any>(null)
  const [reduction, setReduction] = useState<any>(null)
  const [contratsEnfants, setContratsEnfants] = useState<any[]>([])
  const [admissions, setAdmissions] = useState<Record<string, string>>({})
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

    // Charger l'etat d'admission par enfant (statut de la fiche inscriptions_pedagogiques)
    const ids = (enf || []).map((e: any) => e.id)
    if (ids.length > 0) {
      const { data: fp } = await s.from('inscriptions_pedagogiques')
        .select('enfant_id, statut')
        .in('enfant_id', ids)
        .eq('annee_scolaire', anneeInscription)
      const map: Record<string, string> = {}
      ;(fp || []).forEach((f: any) => { map[f.enfant_id] = f.statut })
      setAdmissions(map)
    }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading_dots')}</div>
  if (!famille) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>{t('portail.inscriptions.no_family_linked')}</div>

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
    if (!confirm(t('portail.inscriptions.ddr_waive_confirm', { annee: anneeInscription }))) return
    const s = createClient()
    const nouveau = { ...renoncements, [anneeInscription]: { renonce_le: new Date().toISOString() } }
    const { error } = await s.from('familles').update({ renoncements_ddr: nouveau }).eq('id', famille.id)
    if (error) { alert(t('portail.inscriptions.error_prefix') + ' ' + error.message); return }
    setFamille({ ...famille, renoncements_ddr: nouveau })
  }
  const contratSoumis = contrat && ['soumis', 'valide'].includes(contrat.statut)

  return (
    <div>
      {!parent.estPrincipal && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#1E40AF', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <div>{t('portail.inscriptions.not_principal_notice')}</div>
        </div>
      )}

      {/* WORKFLOW STEPPER : Admission → Validation école → Inscription → Validation → Facture */}
      {(() => {
        const nbAdmis = enfants.filter(e => admissions[e.id] === 'accepte' || admissions[e.id] === 'valide').length
        const nbEnAttente = enfants.filter(e => admissions[e.id] === 'soumis' || admissions[e.id] === 'en_etude').length
        const auMoinsUnAdmis = nbAdmis > 0
        const contratStatutActuel = contrat?.statut
        const contratSoumisOuValide = ['soumis', 'valide', 'accepte'].includes(contratStatutActuel)
        const contratValide = ['valide', 'accepte'].includes(contratStatutActuel)
        // Etat des etapes
        const etape1 = nbAdmis === enfants.length && enfants.length > 0 ? 'done' : nbEnAttente > 0 ? 'inprogress' : 'todo'
        const etape2 = auMoinsUnAdmis && !contrat ? 'todo' : contrat && !contratSoumisOuValide ? 'inprogress' : contratSoumisOuValide ? 'done' : 'locked'
        const etape3 = contratValide ? 'done' : contratSoumisOuValide ? 'inprogress' : 'locked'
        const etapes = [
          { label: t('portail.inscriptions.stepper.admission'), sub: enfants.length > 0 ? t('portail.inscriptions.stepper.admission_count', { n: nbAdmis, total: enfants.length, s: nbAdmis > 1 ? 's' : '' }) : t('portail.inscriptions.stepper.admission_todo'), etat: etape1 },
          { label: t('portail.inscriptions.stepper.registration', { annee: anneeInscription }), sub: contratSoumisOuValide ? t('portail.inscriptions.stepper.registration_sent') : t('portail.inscriptions.stepper.registration_todo'), etat: etape2 },
          { label: t('portail.inscriptions.stepper.invoice'), sub: contratValide ? t('portail.inscriptions.stepper.invoice_issued') : t('portail.inscriptions.stepper.invoice_pending'), etat: etape3 },
        ]
        return (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '16px 14px', marginBottom: 22 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingLeft: 4 }}>{t('portail.inscriptions.stepper.title')}</div>
            <div className="portail-stepper-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, position: 'relative' }}>
              {etapes.map((et, i) => {
                const isDone = et.etat === 'done'
                const isProg = et.etat === 'inprogress'
                const isLocked = et.etat === 'locked'
                const couleur = isDone ? '#10B981' : isProg ? '#F59E0B' : isLocked ? '#CBD5E1' : '#94A3B8'
                const bg = isDone ? '#10B981' : isProg ? '#FEF3C7' : isLocked ? '#F1F5F9' : '#fff'
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6, position: 'relative', minWidth: 0 }}>
                    {/* Trait de liaison vers etape suivante */}
                    {i < etapes.length - 1 && (
                      <div style={{ position: 'absolute', top: 14, left: '60%', right: '-40%', height: 2, background: isDone ? '#10B981' : '#E2E8F0', zIndex: 0 }} />
                    )}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: bg, border: `2px solid ${couleur}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                      color: isDone ? '#fff' : couleur,
                      zIndex: 1, position: 'relative',
                    }}>{isDone ? '✓' : i + 1}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isLocked ? '#94A3B8' : '#1E293B', lineHeight: 1.2 }}>{et.label}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.3 }}>{et.sub}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Mes enfants */}
      {enfants.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎓</span> {t('portail.inscriptions.children_heading')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {enfants.map(enfant => {
              const dansContrat = contratsEnfants.includes(enfant.id)
              const adm = admissions[enfant.id]
              const admis = adm === 'accepte' || adm === 'valide'
              const enAttenteAdm = adm === 'soumis' || adm === 'en_etude'
              const refuse = adm === 'refuse'
              // Etat & libelle
              let badgeBg = '#F1F5F9', badgeColor = '#64748B', badgeLabel = t('portail.inscriptions.badge.unknown_status')
              if (dansContrat) { badgeBg = '#ECFDF5'; badgeColor = '#065F46'; badgeLabel = t('portail.inscriptions.badge.reenrolled', { annee: anneeInscription }) }
              else if (admis) { badgeBg = '#EFF6FF'; badgeColor = '#1E40AF'; badgeLabel = t('portail.inscriptions.badge.admitted_to_reenroll') }
              else if (enAttenteAdm) { badgeBg = '#FFF7ED'; badgeColor = '#9A3412'; badgeLabel = t('portail.inscriptions.badge.admission_pending') }
              else if (refuse) { badgeBg = '#FEF2F2'; badgeColor = '#991B1B'; badgeLabel = t('portail.inscriptions.badge.admission_refused') }
              else { badgeBg = '#F1F5F9'; badgeColor = '#64748B'; badgeLabel = t('portail.inscriptions.badge.admission_to_request') }
              return (
                <div key={enfant.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>{enfant.prenom?.[0]?.toUpperCase()}</div>
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{enfant.prenom} {enfant.nom}</div>
                    {enfant.classe && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{enfant.classe}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: badgeColor, background: badgeBg, borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap' }}>{badgeLabel}</span>
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
              <div style={{ fontSize: 15, fontWeight: 800, color: '#92400E' }}>{t('portail.inscriptions.ddr_lock.title')}</div>
            </div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.55, marginBottom: 14 }}>
              {t('portail.inscriptions.ddr_lock.intro')}
            </div>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: '#78350F', lineHeight: 1.7 }}>
              <li dangerouslySetInnerHTML={{ __html: t('portail.inscriptions.ddr_lock.option_submit') }} />
              <li dangerouslySetInnerHTML={{ __html: t('portail.inscriptions.ddr_lock.option_waive') }} />
            </ul>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/portail/inscriptions/reduction')}
                style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
                {t('portail.inscriptions.ddr_lock.btn_submit')}
              </button>
              <button onClick={renoncerDDR}
                style={{ background: '#fff', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                {t('portail.inscriptions.ddr_lock.btn_waive')}
              </button>
            </div>
          </div>
        )}

        {/* HERO Contrat — l'action principale, mise en grand */}
        {(() => {
          const ouvertContrat = (inscriptionsOuvertes && !contratBloqueParDDR) || !!contrat
          const titreContrat = contratSoumis
            ? t('portail.inscriptions.hero.title_signed', { annee: anneeInscription })
            : enfants.length === 1
              ? t('portail.inscriptions.hero.title_one', { prenom: enfants[0]?.prenom, annee: anneeInscription })
              : enfants.length > 1
                ? t('portail.inscriptions.hero.title_many', { n: enfants.length, annee: anneeInscription })
                : t('portail.inscriptions.hero.title_first', { annee: anneeInscription })
          const sousTitre = contratSoumis
            ? t('portail.inscriptions.hero.sub_status', { statut: formatStatut(contrat?.statut).label })
            : contratBloqueParDDR
              ? t('portail.inscriptions.hero.sub_blocked_ddr')
              : config?.date_cloture_inscription
                ? t('portail.inscriptions.hero.sub_deadline', { date: new Date(config.date_cloture_inscription).toLocaleDateString('fr-FR') })
                : t('portail.inscriptions.hero.sub_default')
          const actionLabel = contrat ? t('portail.inscriptions.hero.btn_view') : t('portail.inscriptions.hero.btn_fill')
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
                  {contratSoumis ? t('portail.inscriptions.hero.eyebrow_signed') : contratBloqueParDDR ? t('portail.inscriptions.hero.eyebrow_blocked') : t('portail.inscriptions.hero.eyebrow_main')}
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
                <div style={{ fontSize: 12, opacity: 0.7, position: 'relative' }}>{t('portail.inscriptions.hero.closed')}</div>
              )}
            </div>
          )
        })()}

        {/* DDR optionnelle (si eligible et ouverte) */}
        {(reductionsOuvertes || !!reduction) && (
          <EtapeCard
            icone="💸"
            titre={t('portail.inscriptions.ddr_card.title')}
            desc={t('portail.inscriptions.ddr_card.desc')}
            optional
            status={reduction && ['soumis', 'en_etude', 'accepte'].includes(reduction.statut) ? 'done' : reduction?.statut === 'brouillon' ? 'inprogress' : 'todo'}
            ouvert={reductionsOuvertes || !!reduction}
            dateLimite={config?.date_cloture_reduction ? t('portail.inscriptions.ddr_card.date_before', { date: new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR') }) : null}
            statutLabel={reduction ? formatStatut(reduction.statut).label : null}
            statutColor={reduction ? formatStatut(reduction.statut).color : null}
            onAction={() => router.push('/portail/inscriptions/reduction')}
            actionLabel={reduction ? t('portail.inscriptions.ddr_card.btn_view') : t('portail.inscriptions.ddr_card.btn_submit')}
            aide={
              <AideEtape
                titreEtape={t('portail.inscriptions.ddr_card.help_title')}
                aQuoiCaSert={t('portail.inscriptions.ddr_card.help_what')}
                preparation={[
                  t('portail.inscriptions.ddr_card.help_prep1'),
                  t('portail.inscriptions.ddr_card.help_prep2'),
                  t('portail.inscriptions.ddr_card.help_prep3'),
                  t('portail.inscriptions.ddr_card.help_prep4'),
                ]}
                duree={t('portail.inscriptions.ddr_card.help_duration')}
                couleur="#7C3AED"
              />
            }
          />
        )}

        {/* Demander l'admission d'un nouvel enfant — secondaire, discret, en bas */}
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
                  ? t('portail.inscriptions.admission_card.title_more')
                  : t('portail.inscriptions.admission_card.title_first')}
              </span>
              <AideEtape
                titreEtape={t('portail.inscriptions.admission_card.help_title')}
                aQuoiCaSert={t('portail.inscriptions.admission_card.help_what')}
                preparation={[
                  t('portail.inscriptions.admission_card.help_prep1'),
                  t('portail.inscriptions.admission_card.help_prep2'),
                  t('portail.inscriptions.admission_card.help_prep3'),
                ]}
                duree={t('portail.inscriptions.admission_card.help_duration')}
                couleur="#1E293B"
              />
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>
              {enfants.length > 0
                ? t('portail.inscriptions.admission_card.desc_more', { prenoms: enfants.map(e => e.prenom).join(' ni ') })
                : t('portail.inscriptions.admission_card.desc_first')}
            </div>
          </div>
          <button onClick={() => router.push('/portail/inscriptions/pedagogique')}
            style={{
              background: '#F8FAFC', color: '#1E293B', border: '1px solid #CBD5E1',
              borderRadius: 10, padding: '10px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap', minHeight: 40,
            }}>
            {t('portail.inscriptions.admission_card.btn')}
          </button>
        </div>
      </div>

      {((config?.date_cloture_reduction && (reductionsOuvertes || !!reduction)) || config?.date_cloture_inscription) && (
        <div style={{ marginTop: 28, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 12, letterSpacing: '0.05em' }}>{t('portail.inscriptions.dates.heading')}</div>
          {config.date_cloture_reduction && (reductionsOuvertes || !!reduction) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              <span>{t('portail.inscriptions.dates.ddr_close')}</span>
              <span style={{ fontWeight: 600, color: '#1E293B' }}>{new Date(config.date_cloture_reduction).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {config.date_cloture_inscription && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}>
              <span>{t('portail.inscriptions.dates.contract_close')}</span>
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
  const { t } = useI18n()
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading_dots')}</div>
  if (!facture) return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      {t('portail.inscriptions.invoice.empty', { annee: anneeInscription })}<br /><br />
      <span style={{ fontSize: 12 }}>{t('portail.inscriptions.invoice.empty_help')}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: t('portail.factures.total_invoiced'), value: `${(facture.statut === 'annule' ? 0 : Number(facture.total_facture)).toLocaleString('fr-FR')} €`, color: '#2563EB', bg: '#EFF6FF' },
          { label: t('portail.factures.total_paid'), value: `${(facture.statut === 'annule' ? 0 : Number(facture.total_regle)).toLocaleString('fr-FR')} €`, color: '#059669', bg: '#ECFDF5' },
          { label: t('portail.factures.remaining_to_pay'), value: `${(facture.statut === 'annule' ? 0 : Number(facture.solde_restant)).toLocaleString('fr-FR')} €`, color: facture.statut !== 'annule' && Number(facture.solde_restant) > 0 ? '#DC2626' : '#059669', bg: facture.statut !== 'annule' && Number(facture.solde_restant) > 0 ? '#FEF2F2' : '#ECFDF5' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <a href={`/factures/${facture.id}/print?auto=true`} target="_blank" rel="noopener noreferrer" style={{ background: '#2563EB', color: '#fff', textDecoration: 'none', borderRadius: 6, padding: '5px 11px', fontSize: 11, fontWeight: 600, marginRight: 10 }}>{t('portail.inscriptions.invoice.pdf_short')}</a>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{t('portail.factures.invoice_no', { numero: facture.numero })}</span>
          <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 10 }}>{t('portail.factures.issued_on', { date: new Date(facture.date_emission).toLocaleDateString('fr-FR') })}</span>
        </div>
        {(() => {
          const m: any = {
            en_attente: { label: t('portail.factures.status.waiting'), color: '#D97706', bg: '#FFFBEB' },
            partiel: { label: t('portail.factures.status.partial'), color: '#2563EB', bg: '#EFF6FF' },
            solde: { label: t('portail.factures.status.settled'), color: '#059669', bg: '#ECFDF5' },
            annule: { label: t('portail.factures.status.cancelled'), color: '#DC2626', bg: '#FEF2F2' },
          }
          const s = m[facture.statut] || { label: facture.statut, color: '#64748B', bg: '#F1F5F9' }
          return <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600 }}>{s.label}</span>
        })()}
      </div>

      {facture.statut === 'en_attente' && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.inscriptions.invoice.banner_waiting') }} />
        </div>
      )}
      {facture.statut === 'partiel' && Number(facture.solde_restant) > 0 && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.inscriptions.invoice.banner_partial', { montant: Number(facture.solde_restant).toLocaleString('fr-FR') }) }} />
        </div>
      )}
      {facture.statut === 'annule' && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t('portail.inscriptions.invoice.banner_cancelled') }} />
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>{t('portail.inscriptions.invoice.detail_heading')}</div>
        {lignes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>{t('portail.factures.no_line')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>{[t('portail.factures.col.student'), t('portail.factures.col.description'), t('portail.factures.col.amount')].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{l.enfants ? `${l.enfants.prenom || ''} ${l.enfants.nom || ''}`.trim() : t('portail.factures.line.family')}</td>
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
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>{t('portail.factures.payments.history')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>{[t('portail.factures.col.date'), t('portail.factures.col.mode'), t('portail.factures.col.reference'), t('portail.factures.col.amount')].map(h => (
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
  const { t } = useI18n()
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>{t('portail.common.loading_dots')}</div>

  const TYPES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    circulaire: { label: t('portail.inscriptions.docs.type.circulaire'), icon: '📢', color: '#2563EB', bg: '#EFF6FF' },
    liste_affaires: { label: t('portail.inscriptions.docs.type.liste_affaires'), icon: '📝', color: '#7C3AED', bg: '#F5F3FF' },
    calendrier: { label: t('portail.inscriptions.docs.type.calendrier'), icon: '📅', color: '#059669', bg: '#ECFDF5' },
    reglement: { label: t('portail.inscriptions.docs.type.reglement'), icon: '📜', color: '#92400E', bg: '#FEF3C7' },
    autre: { label: t('portail.inscriptions.docs.type.autre'), icon: '📄', color: '#64748B', bg: '#F1F5F9' },
  }

  if (docs.length === 0) return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
      {t('portail.inscriptions.docs.empty', { annee: anneeInscription })}<br /><br />
      <span style={{ fontSize: 12 }}>{t('portail.inscriptions.docs.empty_help')}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {docs.map(d => {
        const ty = TYPES[d.type_doc] || TYPES.autre
        return (
          <a key={d.id} href={d.fichier_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: ty.bg, color: ty.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{ty.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{d.titre}</div>
              {d.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{d.description}</div>}
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                <span style={{ background: ty.bg, color: ty.color, borderRadius: 5, padding: '1px 8px', fontWeight: 600 }}>{ty.label}</span>
                {d.nom_fichier && <span style={{ marginLeft: 8 }}>{d.nom_fichier}</span>}
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>{t('portail.common.open')}</span>
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
  const { t } = useI18n()
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
          {optional && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{t('portail.inscriptions.optional_badge')}</span>}
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
      {!ouvert && !isDone && <span style={{ fontSize: 12, color: '#CBD5E1', flexShrink: 0 }}>{t('portail.inscriptions.closed')}</span>}
    </div>
  )
}
