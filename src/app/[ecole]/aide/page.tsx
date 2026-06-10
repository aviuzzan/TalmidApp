'use client'
import { useState } from 'react'
import OnboardingTour, { resetOnboarding } from '@/components/onboarding/OnboardingTour'
import Tooltip from '@/components/ui/Tooltip'

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

      {/* Glossaire des termes courants - démontre les tooltips */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginTop: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 14px' }}>
          📖 Glossaire des termes
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 18px' }}>
          Survolez les <Tooltip text="Ces petits points d'interrogation sont disséminés dans l'application à côté des champs qui méritent une explication." /> dans l&apos;application pour obtenir une explication contextuelle.
        </p>
        <div style={{ display: 'grid', gap: 14, fontSize: 13, color: '#475569' }}>
          <div>
            <strong>Tranche de facturation (A/B/C)</strong>
            <Tooltip text="Code de facturation modulé selon le revenu de la famille. Configurable dans Paramètres > Inscriptions > Tranches." />
            <div style={{ marginTop: 4, fontSize: 12, color: '#94A3B8' }}>
              Tarif modulé selon le revenu de la famille.
            </div>
          </div>
          <div>
            <strong>Code comptable</strong>
            <Tooltip text="Code à 6 chiffres du plan comptable général (PCG). Exemple : 706100 = Prestations - Scolarité. Utilisé pour l'export FEC." />
            <div style={{ marginTop: 4, fontSize: 12, color: '#94A3B8' }}>
              Catégorisation comptable selon le PCG (706xxx, 411xxx...).
            </div>
          </div>
          <div>
            <strong>Exercice comptable</strong>
            <Tooltip text="Période comptable de 12 mois alignée sur l'année scolaire (ex : 2026-2027 = sept 2026 à août 2027). Clôture en fin d'année = verrouillage des données." />
            <div style={{ marginTop: 4, fontSize: 12, color: '#94A3B8' }}>
              Période de 12 mois alignée sur l&apos;année scolaire.
            </div>
          </div>
          <div>
            <strong>Compte client (411)</strong>
            <Tooltip text="Compte comptable individuel par famille (411xxxxx). Recense automatiquement factures et règlements." />
            <div style={{ marginTop: 4, fontSize: 12, color: '#94A3B8' }}>
              Compte comptable individualisé par famille.
            </div>
          </div>
          <div>
            <strong>Anonymisation RGPD</strong>
            <Tooltip text="Article 17 du RGPD (droit à l'oubli). Remplace les données nominatives par des marqueurs Anonymisé#XXX. Les factures sont conservées pour la compta (obligation 10 ans)." />
            <div style={{ marginTop: 4, fontSize: 12, color: '#94A3B8' }}>
              Effacement des données nominatives, factures conservées.
            </div>
          </div>
        </div>
      </div>

      {showTour && <OnboardingTour force={true} onClose={() => setShowTour(false)} />}
    </div>
  )
}
