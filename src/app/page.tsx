'use client'
import { useEffect, useState } from 'react'

/**
 * Landing page TalmidApp - version minimaliste.
 * - Hero "Coming soon" en gros
 * - Grille des fonctionnalités
 * - Pas de pricing, pas de CTA démo
 */

const FEATURES = [
  { icon: '👨‍👩‍👧', title: 'Gestion des familles', desc: 'Dossiers complets, situation maritale, contacts, documents — tout centralisé en un clic.' },
  { icon: '💰', title: 'Moteur financier', desc: 'Calcul automatique des scolarités, facturation par enfant, suivi des règlements en temps réel.' },
  { icon: '📧', title: 'Notifications email', desc: 'Templates personnalisables avec variables dynamiques. Solde, relances, bienvenue — automatisés.' },
  { icon: '👨‍🏫', title: 'Portail enseignants', desc: 'Chaque professeur accède à sa classe, ses élèves, saisit notes et commentaires.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Portail parents', desc: "Espace sécurisé : enfants, factures, solde, documents — accessible depuis n'importe quel appareil." },
  { icon: '📅', title: 'Gestion N+1', desc: "Préparez la rentrée suivante sans stress : inscriptions anticipées, passage de classe, listes d'attente." },
  { icon: '🛡️', title: 'Conforme RGPD', desc: "Anonymisation, portabilité, journal d'audit, hébergement européen sécurisé." },
  { icon: '🌍', title: 'Multilingue', desc: "Interface FR / EN / HE avec support RTL pour l'hébreu." },
  { icon: '📊', title: 'Comptabilité intégrée', desc: 'Plan de comptes, exercices comptables, export FEC, rapprochement bancaire.' },
]

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      color: '#0F172A',
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        borderBottom: scrolled ? '1px solid #E2E8F0' : '1px solid transparent',
        transition: 'all 0.2s',
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🎓</span>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>TalmidApp</span>
          </div>
          <a href="/login" style={{
            background: '#0F172A', color: '#fff', textDecoration: 'none',
            padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          }}>
            Se connecter
          </a>
        </div>
      </header>

      {/* Hero "Coming soon" */}
      <section style={{
        maxWidth: 1180, margin: '0 auto',
        padding: '80px 24px 60px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(37, 99, 235, 0.08)',
          color: '#2563EB',
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 12, fontWeight: 600,
          marginBottom: 24,
          letterSpacing: '0.02em',
        }}>
          🚧 En préparation
        </div>
        <h1 style={{
          fontSize: 'clamp(72px, 14vw, 160px)',
          fontWeight: 900,
          letterSpacing: '-0.05em',
          lineHeight: 0.95,
          margin: '0 0 20px',
          background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #0EA5E9 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Coming soon
        </h1>
        <p style={{
          fontSize: 'clamp(16px, 2vw, 20px)',
          color: '#475569',
          maxWidth: 640, margin: '0 auto 40px',
          lineHeight: 1.6,
        }}>
          TalmidApp prépare la rentrée 2026. La plateforme de gestion scolaire moderne pour
          les écoles juives, pensée pour soulager l&apos;administration et accompagner les familles.
        </p>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h2 style={{
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 800, letterSpacing: '-0.02em',
          textAlign: 'center', margin: '0 0 12px',
        }}>
          Tout ce dont une école a besoin
        </h2>
        <p style={{
          color: '#64748B', fontSize: 15,
          textAlign: 'center', margin: '0 auto 48px',
          maxWidth: 600,
        }}>
          De l&apos;inscription à la facturation, en passant par la pédagogie et la communication.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 24,
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{
                fontSize: 16, fontWeight: 700,
                margin: '0 0 8px', color: '#0F172A',
              }}>
                {f.title}
              </h3>
              <p style={{
                fontSize: 14, lineHeight: 1.55,
                color: '#64748B', margin: 0,
              }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer minimal */}
      <footer style={{
        borderTop: '1px solid #E2E8F0',
        padding: '32px 24px',
        textAlign: 'center',
        background: 'rgba(255,255,255,0.5)',
      }}>
        <div style={{ fontSize: 13, color: '#64748B' }}>
          <span style={{ fontWeight: 700, color: '#0F172A' }}>🎓 TalmidApp</span>
          <span style={{ margin: '0 8px', color: '#CBD5E1' }}>·</span>
          <span>Plateforme de gestion scolaire</span>
        </div>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 14, fontSize: 12, flexWrap: 'wrap' }}>
          <a href="/mentions-legales" style={{ color: '#64748B', textDecoration: 'none' }}>Mentions légales</a>
          <a href="/confidentialite" style={{ color: '#64748B', textDecoration: 'none' }}>Confidentialité</a>
          <a href="/cgu" style={{ color: '#64748B', textDecoration: 'none' }}>CGU</a>
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 12 }}>
          © {new Date().getFullYear()} TalmidApp. Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}
