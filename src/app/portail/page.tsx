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

      const [{ count: enfants }, { data: facture }, { data: cfg }] = await Promise.all([
        supabase.from('enfants').select('*', { count: 'exact', head: true })
          .eq('famille_id', familleId)
          .or(`date_entree.is.null,date_entree.lte.${now}`)
          .or(`date_sortie.is.null,date_sortie.gte.${now}`),
        supabase.from('factures_solde').select('*')
          .eq('famille_id', familleId)
          .eq('annee_scolaire', anneeInscription)
          .single(),
        supabase.from('inscriptions_config')
          .select('inscriptions_ouvertes, date_ouverture_inscription, date_cloture_inscription, reductions_ouvertes, date_ouverture_reduction, date_cloture_reduction, tranches_eligibles_ddr, bandeau_titre, bandeau_message')
          .eq('ecole_id', ecoleId).eq('annee_scolaire', anneeInscription).maybeSingle(),
      ])

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

      setData({
        famille: (profile as any).familles,
        nbEnfants: enfants ?? 0,
        facture: facture ?? null,
        reglements,
        inscriptionsOuvertes,
        cfg: cfg ?? null,
        anneeInscription,
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
