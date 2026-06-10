'use client'
import { useState } from 'react'
import OnboardingTour, { resetOnboarding } from '@/components/onboarding/OnboardingTour'

/**
 * Page Aide pour les administrateurs.
 * Permet de relancer le tour d'onboarding et liste les ressources d'aide.
 */
export default function AidePage() {
  const [showTour, setShowTour] = useState(false)

  function relancerTour() {
    resetOnboarding()
    setShowTour(true)
  }

  return (
    <div style={{ padding: 32, maxWidth: 820, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
        🎓 Aide & démarrage
      </h1>
      <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 32px' }}>
        Ressources pour vous accompagner dans la prise en main de TalmidApp.
      </p>

      {/* Tour de bienvenue */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ fontSize: 36 }}>👋</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              Tour de bienvenue
            </h2>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: '0 0 14px' }}>
              Revoir le tour guidé d&apos;introduction aux fonctionnalités principales :
              sidebar, sélecteur d&apos;exercice, création de famille, tableau de bord direction,
              journal d&apos;audit.
            </p>
            <button
              onClick={relancerTour}
              style={{
                background: '#2563EB', border: 'none', borderRadius: 10,
                padding: '10px 20px', fontSize: 14, fontWeight: 600,
                color: '#fff', cursor: 'pointer',
              }}
            >
              ▶ Relancer le tour
            </button>
          </div>
        </div>
      </div>

      {/* Documentation */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ fontSize: 36 }}>📚</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              Documentation
            </h2>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
              Pour des questions plus précises sur la facturation, les exercices comptables,
              les exports FEC ou les fonctionnalités RGPD, consultez la documentation interne
              ou contactez votre référent.
            </p>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ fontSize: 36 }}>💬</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              Besoin d&apos;aide ?
            </h2>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
              Si une fonctionnalité ne se comporte pas comme prévu, ou si vous souhaitez
              suggérer une amélioration, contactez l&apos;équipe TalmidApp.
            </p>
          </div>
        </div>
      </div>

      {showTour && <OnboardingTour force={true} onClose={() => setShowTour(false)} />}
    </div>
  )
}
