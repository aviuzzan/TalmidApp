'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAnneeInscription } from '@/lib/inscription-context'
import { useI18n } from '@/lib/i18n'

/**
 * FIX P2-8 (audit portail parent 06/08) : /portail/reduction n'existait pas en
 * tant que route — l'URL tombait sur la page 404 générique « Bientôt
 * disponible », laissant croire à une fonctionnalité à venir alors que la
 * vraie page existe à /portail/inscriptions/reduction.
 *
 * Cette page fait l'aiguillage :
 *  - famille éligible (ou demande déjà déposée) → redirection vers la vraie page ;
 *  - module réduction fermé côté école → « Votre école ne propose pas de
 *    demande de réduction en ligne » ;
 *  - module ouvert mais profil non éligible (tranche hors liste ou hors
 *    période) → « Votre profil n'est pas éligible ».
 */
export default function PortailReductionRedirectPage() {
  const router = useRouter()
  const { anneeInscription } = useAnneeInscription()
  const { t } = useI18n()
  // null = en cours d'évaluation ; sinon la clé du message à afficher
  const [messageCle, setMessageCle] = useState<string | null>(null)

  useEffect(() => {
    if (!anneeInscription) return
    let annule = false
    async function check() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { router.replace('/login'); return }
      const { data: profile } = await s.from('profiles').select('famille_id, ecole_id').eq('id', session.user.id).single()
      if (!profile?.famille_id || !profile?.ecole_id) { router.replace('/portail'); return }

      const [{ data: fam }, { data: cfg }, { data: dem }] = await Promise.all([
        s.from('familles').select('tranche_id').eq('id', profile.famille_id).single(),
        s.from('inscriptions_config')
          .select('reductions_ouvertes, tranches_eligibles_ddr, date_ouverture_reduction, date_cloture_reduction')
          .eq('ecole_id', profile.ecole_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
        s.from('demandes_reduction').select('id').eq('famille_id', profile.famille_id).eq('annee_scolaire', anneeInscription).maybeSingle(),
      ])
      if (annule) return

      // Mêmes critères que /portail/inscriptions/reduction (source : cette page)
      const eligiblesT: string[] = (cfg as any)?.tranches_eligibles_ddr || []
      const trancheOK = !!fam?.tranche_id && eligiblesT.includes(fam.tranche_id)
      const today = new Date().toISOString().split('T')[0]
      const dateOK = cfg?.date_ouverture_reduction && cfg?.date_cloture_reduction
        ? (cfg.date_ouverture_reduction <= today && cfg.date_cloture_reduction >= today)
        : true
      const eligible = !!cfg?.reductions_ouvertes && dateOK && trancheOK

      if (eligible || dem) {
        // La vraie page existe et la famille y a accès : on route correctement.
        router.replace('/portail/inscriptions/reduction')
        return
      }
      // Message explicite au lieu de la 404 « Bientôt disponible »
      setMessageCle(cfg?.reductions_ouvertes ? 'portail.reduction.indispo.profil' : 'portail.reduction.indispo.ecole')
    }
    check()
    return () => { annule = true }
  }, [anneeInscription, router])

  if (!messageCle) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 13 }}>{t('portail.common.loading_dots')}</div>
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '32px 28px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💸</div>
        <p style={{ fontSize: 14, color: '#1E293B', fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
          {t(messageCle)}
        </p>
        <button onClick={() => router.push('/portail')}
          style={{ marginTop: 22, background: '#2563EB', border: 'none', borderRadius: 10, padding: '11px 22px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
          {t('portail.nav.home')}
        </button>
      </div>
    </div>
  )
}
