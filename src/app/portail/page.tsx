'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useParentCtx } from '@/lib/parent-context'
import PushPrompt from '@/components/PushPrompt'
import { useI18n } from '@/lib/i18n'

export default function PortailPage() {
  const { t } = useI18n()
  const { anneeInscription } = useAnneeInscription()
  const parent = useParentCtx()
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('famille_id, familles(*)')
        .eq('id', session.user.id)
        .single()

      if (!profile?.famille_id) { setLoading(false); return }

      const familleId = profile.famille_id
      const ecoleId = (profile as any).familles?.ecole_id
      const now = new Date().toISOString().split('T')[0]

      const [{ count: enfants }, { data: enfantsList }, { data: facture }, { data: cfg }, { data: contrat }, { data: docsConfig }, { data: docsFournis }, { data: ddr }] = await Promise.all([
        supabase.from('enfants').select('*', { count: 'exact', head: true })
          .eq('famille_id', familleId)
          .or(`date_entree.is.null,date_entree.lte.${now}`)
          .or(`date_sortie.is.null,date_sortie.gte.${now}`),
        supabase.from('enfants').select('id, prenom, nom, statut_inscription').eq('famille_id', familleId),
        supabase.from('factures_solde').select('*')
          .eq('famille_id', familleId)
          .eq('annee_scolaire', anneeInscription)
          .maybeSingle(),
        supabase.from('inscriptions_config')
          .select('inscriptions_ouvertes, date_ouverture_inscription, date_cloture_inscription, reductions_ouvertes, date_ouverture_reduction, date_cloture_reduction, tranches_eligibles_ddr, bandeau_titre, bandeau_message')
          .eq('ecole_id', ecoleId).eq('annee_scolaire', anneeInscription).maybeSingle(),
        supabase.from('contrats_scolarisation').select('id, statut').eq('famille_id', familleId).eq('annee_scolaire', anneeInscription).maybeSingle(),
        supabase.from('documents_ecole').select('id, nom, obligatoire').eq('ecole_id', ecoleId).eq('actif', true),
        supabase.from('documents_famille').select('document_id').eq('famille_id', familleId),
        supabase.from('demandes_reduction').select('id, statut').eq('famille_id', familleId).eq('annee_scolaire', anneeInscription).maybeSingle(),
      ])
      // Fiches pedagogiques en 2eme passe car depend de la liste des enfants
      const enfantIds = (enfantsList || []).map((e: any) => e.id)
      const { data: fichesPedago } = enfantIds.length > 0
        ? await supabase.from('inscriptions_pedagogiques').select('id, enfant_id, urgence_1_nom, medecin_nom, statut').in('enfant_id', enfantIds)
        : { data: [] }

      // Tranche famille (pour check éligibilité DDR sur la pastille "réductions ouvertes")
      const trancheFamille = (profile as any)?.familles?.tranche_id || null
      const eligibles: string[] = (cfg as any)?.tranches_eligibles_ddr || []
      const trancheEligibleDDR = trancheFamille && eligibles.includes(trancheFamille)

      let reglements: any[] = []
      if (facture) {
        const { data: regs } = await supabase.from('reglements').select('montant, paye_par').eq('facture_id', facture.id)
        reglements = regs ?? []
      }

      const inscriptionsOuvertes = !!cfg && (
        (!!cfg.inscriptions_ouvertes && cfg.date_ouverture_inscription <= now && cfg.date_cloture_inscription >= now) ||
        (!!cfg.reductions_ouvertes && cfg.date_ouverture_reduction <= now && cfg.date_cloture_reduction >= now && trancheEligibleDDR)
      )

      // --- Checklist "Vos taches a realiser" ---
      const taches: Array<{ label: string; fait: boolean; href: string; urgent?: boolean; sub?: string }> = []
      // 1) Contrat de l'annee
      if (inscriptionsOuvertes && cfg?.inscriptions_ouvertes) {
        const ctrStatut = (contrat as any)?.statut
        const ctrSigne = ctrStatut === 'valide' || ctrStatut === 'signe' || ctrStatut === 'accepte'
        taches.push({
          label: ctrSigne ? `Contrat ${anneeInscription} signé` : `Signer le contrat ${anneeInscription}`,
          fait: ctrSigne,
          href: '/portail/inscriptions',
          urgent: !ctrSigne,
          sub: ctrSigne ? undefined : 'Inscription pas encore validée par l\'école',
        })
      }
      // 2) Fiche pedagogique par enfant (urgences + medecin requis OU statut accepte)
      ;(enfantsList || []).forEach((enf: any) => {
        const fp = (fichesPedago || []).find((f: any) => f.enfant_id === enf.id)
        const acceptee = fp?.statut === 'accepte' || fp?.statut === 'valide'
        const champsOk = !!(fp && fp.urgence_1_nom && fp.medecin_nom)
        const complete = acceptee || champsOk
        taches.push({
          label: complete ? `Fiche pédagogique de ${enf.prenom} validée` : `Compléter la fiche pédagogique de ${enf.prenom}`,
          fait: complete,
          href: '/portail/inscriptions',
          urgent: !complete && enf.statut_inscription !== 'sorti',
          sub: complete ? undefined : (fp ? 'Manque contact d\'urgence ou médecin traitant' : 'Aucune fiche pédagogique remplie'),
        })
      })
      // 3) Documents obligatoires
      const idsFournis = new Set((docsFournis || []).map((d: any) => d.document_id))
      ;(docsConfig || []).filter((d: any) => d.obligatoire).forEach((d: any) => {
        const fait = idsFournis.has(d.id)
        taches.push({
          label: fait ? `Document fourni : ${d.nom}` : `Fournir le document : ${d.nom}`,
          fait,
          href: '/portail/documents',
          urgent: !fait,
        })
      })
      // 4) DDR si eligible et inscriptions ouvertes pour reduc
      if (trancheEligibleDDR && cfg?.reductions_ouvertes && cfg.date_ouverture_reduction <= now && cfg.date_cloture_reduction >= now) {
        const ddrFaite = !!ddr && (ddr as any).statut !== 'brouillon'
        taches.push({
          label: ddrFaite ? `Demande de réduction soumise (statut : ${(ddr as any).statut})` : 'Faire votre demande de réduction',
          fait: ddrFaite,
          href: '/portail/inscriptions/reduction',
          urgent: !ddrFaite,
          sub: ddrFaite ? undefined : 'Vous êtes éligible — pensez à la faire avant la clôture',
        })
      }
      // 5) Reglement si solde > 0 et facture en attente
      if (facture && (facture as any).statut === 'en_attente' && Number((facture as any).solde_restant) > 0) {
        taches.push({
          label: `Régler la facture (reste ${Number((facture as any).solde_restant).toLocaleString('fr-FR')} €)`,
          fait: false,
          href: '/portail/factures',
          sub: 'En attente du moyen de règlement choisi par l\'école',
        })
      }

      setData({
        famille: (profile as any).familles,
        nbEnfants: enfants ?? 0,
        facture: facture ?? null,
        reglements,
        inscriptionsOuvertes,
        cfg: cfg ?? null,
        anneeInscription,
        taches,
      })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: 40 }}>Chargement...</div>

  if (!data?.famille) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>Bienvenue sur TalmidApp</h2>
      <p style={{ color: '#64748B', fontSize: 14 }}>Votre compte n'est pas encore lié à une famille. Contactez l'administration.</p>
    </div>
  )

  // Une facture annulee n'est ni due ni a regler — la famille ne doit rien
  const factureActive = data.facture && data.facture.statut !== 'annule' ? data.facture : null
  const solde = factureActive ? Number(factureActive.solde_restant) : 0
  const maPart = factureActive ? Number(factureActive.total_facture) * parent.partPct / 100 : 0
  const regleMoi = (data.reglements || []).filter((r: any) => r.paye_par === parent.parentSlot).reduce((s: number, r: any) => s + Number(r.montant), 0)
  const monSolde = maPart - regleMoi

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PushPrompt />
      {/* Welcome */}
      <div style={{
        background: 'linear-gradient(135deg, #1A3A6B, #2563EB)',
        borderRadius: 16, padding: '28px 32px', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            Bonjour, famille {data.famille.nom} 👋
          </h1>
          <p style={{ opacity: 0.8, fontSize: 14 }}>{t('portail.school_year')} {anneeInscription}</p>
        </div>
        <div style={{ fontSize: 48, opacity: 0.3 }}>🏫</div>
      </div>

      {/* Checklist "Vos taches" */}
      {data.taches && data.taches.length > 0 && (() => {
        const restantes = data.taches.filter((t: any) => !t.fait)
        const total = data.taches.length
        const faites = total - restantes.length
        const toutBon = restantes.length === 0
        return (
          <div style={{
            background: toutBon ? '#F0FDF4' : '#FFF7ED',
            border: `1px solid ${toutBon ? '#BBF7D0' : '#FED7AA'}`,
            borderRadius: 14, overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 18px', borderBottom: `1px solid ${toutBon ? '#DCFCE7' : '#FFEDD5'}`,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 24 }}>{toutBon ? '✅' : '📋'}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: toutBon ? '#065F46' : '#9A3412' }}>
                  {toutBon ? 'Votre dossier est complet 🎉' : 'Vos tâches à réaliser'}
                </div>
                <div style={{ fontSize: 12, color: toutBon ? '#065F46' : '#9A3412', opacity: 0.85, marginTop: 2 }}>
                  {toutBon
                    ? 'Vous n\'avez plus rien à faire pour le moment. L\'école vous contactera si besoin.'
                    : `${faites}/${total} éléments complétés — il vous reste ${restantes.length} action${restantes.length > 1 ? 's' : ''}`}
                </div>
              </div>
            </div>
            <div style={{ background: '#fff' }}>
              {data.taches.map((t: any, i: number) => (
                <div key={i} onClick={() => t.href && router.push(t.href)}
                  style={{
                    padding: '12px 18px', borderBottom: i < data.taches.length - 1 ? '1px solid #F1F5F9' : 'none',
                    display: 'flex', alignItems: 'flex-start', gap: 12, cursor: t.href ? 'pointer' : 'default',
                    background: '#fff', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (t.href) e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                  <div style={{
                    fontSize: 18, marginTop: 1,
                    color: t.fait ? '#10B981' : t.urgent ? '#DC2626' : '#94A3B8',
                  }}>{t.fait ? '✓' : t.urgent ? '⚠' : '○'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: t.fait ? 500 : 600,
                      color: t.fait ? '#94A3B8' : '#1E293B',
                      textDecoration: t.fait ? 'line-through' : 'none',
                    }}>{t.label}</div>
                    {t.sub && !t.fait && (
                      <div style={{ fontSize: 11, color: t.urgent ? '#991B1B' : '#64748B', marginTop: 2 }}>{t.sub}</div>
                    )}
                  </div>
                  {t.href && !t.fait && (
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: t.urgent ? '#DC2626' : '#2563EB',
                      whiteSpace: 'nowrap', flexShrink: 0, paddingTop: 1,
                    }}>{t.urgent ? 'À faire →' : 'Voir →'}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Bandeau "Inscriptions ouvertes" — si l'école a une fenêtre active */}
      {data.inscriptionsOuvertes && (() => {
        const cfg = data.cfg || {}
        const titre = cfg.bandeau_titre?.trim() || `Période d'inscriptions ${data.anneeInscription} ouverte`
        const today = new Date().toISOString().split('T')[0]
        const dateLimite = cfg.date_cloture_inscription && cfg.date_cloture_inscription >= today
          ? new Date(cfg.date_cloture_inscription).toLocaleDateString('fr-FR')
          : null
        const messageDefaut = dateLimite
          ? `Vous pouvez inscrire vos enfants pour l'année ${data.anneeInscription} jusqu'au ${dateLimite}. Nous restons à votre disposition pour toute question.`
          : `Vous pouvez inscrire vos enfants pour l'année ${data.anneeInscription}.`
        const message = cfg.bandeau_message?.trim() || messageDefaut
        return (
          <div style={{
            background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
            border: '1px solid #10B981',
            borderRadius: 14, padding: '18px 22px',
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            boxShadow: '0 1px 3px rgba(16,185,129,0.1)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#10B981', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0,
            }}>✓</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#065F46' }}>{titre}</div>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 3, lineHeight: 1.5 }}>{message}</div>
            </div>
            <button onClick={() => router.push('/portail/inscriptions')}
              style={{
                background: '#10B981', color: '#fff', border: 'none',
                borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                boxShadow: '0 2px 6px rgba(16,185,129,0.35)',
              }}>
              Démarrer les démarches →
            </button>
          </div>
        )
      })()}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { icon: '🎓', label: 'Élèves inscrits', value: data.nbEnfants, color: '#2563EB', bg: '#EFF6FF', action: () => router.push('/portail/enfants') },
          { icon: '📄', label: parent.estSeparee ? 'Ma part' : `Facture ${anneeInscription}`, value: factureActive ? `${(parent.estSeparee ? maPart : Number(factureActive.total_facture)).toLocaleString('fr-FR')} €` : '—', color: '#059669', bg: '#ECFDF5', action: () => router.push('/portail/factures') },
          { icon: '💳', label: parent.estSeparee ? 'Mon solde' : 'Solde restant', value: factureActive ? `${(parent.estSeparee ? monSolde : solde).toLocaleString('fr-FR')} €` : '—', color: (parent.estSeparee ? monSolde : solde) > 0 ? '#DC2626' : '#059669', bg: (parent.estSeparee ? monSolde : solde) > 0 ? '#FEF2F2' : '#ECFDF5', action: () => router.push('/portail/factures') },
        ].map(s => (
          <div key={s.label} onClick={s.action} style={{
            background: s.bg, borderRadius: 12, padding: '20px 24px', cursor: 'pointer',
            border: `1px solid ${s.bg}`, transition: 'transform 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {[
          { icon: '🎓', title: 'Mes enfants', desc: 'Consulter les informations de vos enfants', href: '/portail/enfants' },
          { icon: '💰', title: 'Mes factures', desc: 'Voir vos factures et règlements', href: '/portail/factures' },
          { icon: '📝', key: 'insc', title: 'Inscriptions N+1', desc: 'Gérer les inscriptions 2026/2027', href: '/portail/inscriptions' },
          { icon: '📄', title: 'Documents', desc: 'Envoyer et consulter vos documents', href: '/portail/documents' },
          { icon: '📞', title: 'Contact', desc: 'Coordonnées de l\'établissement', href: '/portail/contact' },
        ].map(item => {
          const bloque = (item as any).key === 'insc' && data && data.inscriptionsOuvertes === false
          return (
          <a key={item.title} href={bloque ? '#' : item.href}
            onClick={bloque ? (ev => ev.preventDefault()) : undefined}
            style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '20px 24px', textDecoration: 'none', display: 'flex',
              alignItems: 'center', gap: 16, transition: 'all 0.15s',
              opacity: bloque ? 0.5 : 1, cursor: bloque ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (bloque) return; (e.currentTarget as HTMLElement).style.borderColor = '#2563EB'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(37,99,235,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{bloque ? 'Ouverture prochainement' : item.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#94A3B8', fontSize: 18 }}>→</div>
          </a>
        )})}
      </div>
    </div>
  )
}
