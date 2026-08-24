import type { Metadata } from 'next'
import EcoleFinder from '@/components/vitrine/EcoleFinder'
import DemandeDemoForm from '@/components/vitrine/DemandeDemoForm'

/**
 * aaaa2 — Page d'accueil talmidapp.fr, alignée sur la vitrine Yeter (même
 * structure : header, hero, fonctionnalités, preuve, formulaire de démo,
 * footer) mais avec l'identité TalmidApp : fond sombre #050A14, dégradé
 * bleu -> violet, vrai logo. Fini le « Coming soon » (demande Avi 24/08).
 * « Se connecter » = recherche d'établissement par nom (style Jotform),
 * composant partagé EcoleFinder. Encart croisé vers yeter.fr en bas.
 */

export const metadata: Metadata = {
  title: 'TalmidApp — La gestion scolaire réinventée',
  description:
    "Familles, scolarités, paiements, communication, comptabilité : la plateforme de gestion complète des écoles juives, de l'inscription au bilan comptable.",
}

const GRADIENT = 'linear-gradient(135deg, #2563EB, #7C3AED)'
const YETER_GRADIENT = 'linear-gradient(135deg, #F59E0B, #EC4899 55%, #8B5CF6)'

const FEATURES = [
  { icon: '👨‍👩‍👧', title: 'Gestion des familles', desc: 'Dossiers complets, situation maritale, contacts, documents — tout centralisé en un clic.' },
  { icon: '💰', title: 'Moteur financier', desc: 'Calcul automatique des scolarités, facturation par enfant, suivi des règlements en temps réel.' },
  { icon: '🏦', title: 'Paiements automatisés', desc: 'Prélèvement SEPA et carte bancaire, mandats signés en ligne, relances automatiques.' },
  { icon: '📧', title: 'Communication familles', desc: 'Emails et SMS avec modèles personnalisables, connexion sans mot de passe pour les parents.' },
  { icon: '👨‍🏫', title: 'Portail enseignants', desc: 'Chaque professeur accède à sa classe, ses élèves, saisit notes et commentaires.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Portail parents', desc: "Espace sécurisé : enfants, factures, solde, paiement en ligne — depuis n'importe quel appareil." },
  { icon: '📅', title: 'Rentrée N+1', desc: "Préparez la rentrée suivante sans stress : réinscriptions, passage de classe, listes d'attente." },
  { icon: '🛡️', title: 'Conforme RGPD', desc: "Anonymisation, portabilité, journal d'audit, données hébergées en France." },
  { icon: '📊', title: 'Comptabilité intégrée', desc: 'Plan de comptes, exercices, export FEC, rapprochement bancaire, clôture.' },
]

export default function TalmidAppLanding() {
  return (
    <div style={{ minHeight: '100vh', background: '#050A14', color: '#E7ECF4', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <header style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon-square.png" alt="TalmidApp" width={42} height={42} style={{ objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(59,130,246,0.35))' }} />
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em', backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>TalmidApp</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EcoleFinder />
          <a href="#demo"
            style={{ background: GRADIENT, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13.5, padding: '10px 18px', borderRadius: 10, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
            Demander une démo
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 80px' }}>
        <section style={{ textAlign: 'center', padding: '32px 0 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon-square.png" alt="TalmidApp" width={84} height={84} style={{ objectFit: 'contain', filter: 'drop-shadow(0 8px 28px rgba(59,130,246,0.4))', marginBottom: 20 }} />
          <div style={{ display: 'block' }}>
            <span style={{ display: 'inline-block', border: '1px solid rgba(37,99,235,0.4)', background: 'rgba(37,99,235,0.08)', color: '#93C5FD', borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '6px 14px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              La plateforme des écoles juives
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(38px, 7vw, 64px)', fontWeight: 900, lineHeight: 1.08, margin: '22px 0 0', letterSpacing: '-0.02em' }}>
            <span style={{ backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>La gestion scolaire réinventée</span>
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.5vw, 19px)', color: '#A9B4C8', maxWidth: 640, margin: '20px auto 0', lineHeight: 1.65 }}>
            Inscriptions, scolarités, paiements, communication, comptabilité :
            tout au même endroit, pour l&apos;école comme pour les parents.
          </p>
          <div style={{ marginTop: 32 }}>
            <a href="#demo"
              style={{ background: GRADIENT, color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 16, padding: '15px 34px', borderRadius: 13, display: 'inline-block', boxShadow: '0 8px 30px rgba(37,99,235,0.4)' }}>
              Demander une démo gratuite
            </a>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 14 }}>Mise en route accompagnée · Données hébergées en France · Sans engagement</div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '22px 20px' }}>
              <div style={{ fontSize: 26 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, margin: '10px 0 6px', color: '#F4F6FF' }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: '#A9B4C8', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </section>

        <section style={{ textAlign: 'center', marginTop: 72, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '40px 24px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 15, color: '#A9B4C8' }}>Déjà utilisé au quotidien par des établissements gérant</div>
          <div style={{ fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 900, marginTop: 8, backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            des centaines de familles et leurs règlements
          </div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 10 }}>De la demande d&apos;inscription à l&apos;export comptable, chaque étape est suivie en temps réel.</div>
        </section>

        <section id="demo" style={{ marginTop: 72, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '40px clamp(20px, 5vw, 48px)', background: 'rgba(255,255,255,0.02)', maxWidth: 720, marginInline: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Demander une démo</div>
            <div style={{ fontSize: 14, color: '#A9B4C8', marginTop: 8, lineHeight: 1.6 }}>
              Laissez-nous vos coordonnées, nous vous montrons TalmidApp sur un cas réel — sans engagement.
            </div>
          </div>
          <DemandeDemoForm gradient={GRADIENT} produit="talmidapp" />
        </section>

        <section style={{ textAlign: 'center', marginTop: 72, border: '1px solid rgba(236,72,153,0.25)', borderRadius: 20, padding: '36px 24px', background: 'rgba(236,72,153,0.04)' }}>
          <span style={{ display: 'inline-block', padding: '4px 16px', borderRadius: 999, background: YETER_GRADIENT, color: '#fff', fontSize: 13, fontWeight: 800 }}>Yeter</span>
          <div style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 900, marginTop: 14, color: '#F4F6FF' }}>Talmud torah, club ou cantine ?</div>
          <div style={{ fontSize: 14, color: '#A9B4C8', maxWidth: 560, margin: '10px auto 0', lineHeight: 1.65 }}>
            Découvrez <strong style={{ color: '#F4F6FF' }}>Yeter by TalmidApp</strong>, la version allégée pensée pour les petites structures :
            inscriptions en ligne, cotisations, communication aux familles.
          </div>
          <a href="https://yeter.fr"
            style={{ display: 'inline-block', marginTop: 20, background: YETER_GRADIENT, color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 14.5, padding: '12px 26px', borderRadius: 12 }}>
            Découvrir Yeter →
          </a>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '26px 24px', textAlign: 'center', fontSize: 12.5, color: '#64748B' }}>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <a href="/mentions-legales" style={{ color: '#8FA0B8', textDecoration: 'none' }}>Mentions légales</a>
          <a href="/cgu" style={{ color: '#8FA0B8', textDecoration: 'none' }}>CGU</a>
          <a href="/confidentialite" style={{ color: '#8FA0B8', textDecoration: 'none' }}>Confidentialité</a>
        </div>
        TalmidApp © 2026 · La gestion scolaire réinventée
      </footer>
    </div>
  )
}
