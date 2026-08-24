import type { Metadata } from 'next'

/**
 * tttt1 — Vitrine Yeter by TalmidApp (servie sur yeter.fr via le middleware).
 * xxxx1 — Passage en theme CLAIR (demande des associes) + logo Y officiel
 * (/yeter-icon.png, tuile du brand board). Le degrade orange -> rose -> violet
 * reste l'identite, utilise en accents sur fond clair. Slogan
 * « Le plus qui change tout ». Cible : talmudei torah, clubs, cantines.
 * Server component statique : metadata dediees, aucun JS client.
 */

export const metadata: Metadata = {
  title: 'Yeter by TalmidApp — Le plus qui change tout',
  description:
    "Inscriptions en ligne, cotisations et prelevement automatique, communication aux familles : la gestion cle en main des talmudei torah, clubs et cantines.",
}

const GRADIENT = 'linear-gradient(135deg, #F59E0B, #EC4899 55%, #8B5CF6)'

const FEATURES = [
  { icon: '📝', title: 'Inscriptions en ligne', desc: "Formulaire d'inscription public, dossier famille complet, validation en un clic — fini le papier." },
  { icon: '🏦', title: 'Prélèvement automatique', desc: 'Cotisations avec échéancier, mandat SEPA signé en ligne en 2 minutes, débit à la date prévue.' },
  { icon: '💳', title: 'Tous les moyens de paiement', desc: 'Carte bancaire en mensualités, virement, chèques, espèces — tout est suivi, les relances sont automatiques.' },
  { icon: '📣', title: 'Communication familles', desc: 'Emails groupés, SMS, notifications — avec connexion sans mot de passe pour les parents.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Portail parents', desc: 'Chaque famille voit ses enfants, ses factures, paie en ligne et gère son prélèvement.' },
  { icon: '📊', title: 'Pilotage en temps réel', desc: 'Encaissé, reste dû, retards : le trésorier sait où il en est, à tout moment, sans tableur.' },
]

export default function YeterLanding() {
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFD', color: '#1E1B2E', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <header style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yeter-icon.png" alt="Yeter" width={42} height={42} style={{ borderRadius: 11, boxShadow: '0 2px 10px rgba(139,92,246,0.18)' }} />
          <div>
            <span style={{ fontWeight: 800, fontSize: 19, backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Yeter</span>
            <span style={{ fontSize: 12, color: '#8A86A0', marginInlineStart: 8 }}>by <span style={{ color: '#059669', fontWeight: 600 }}>TalmidApp</span></span>
          </div>
        </div>
        <a href="mailto:admin@talmidapp.fr?subject=Demande%20de%20demo%20Yeter"
          style={{ background: GRADIENT, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13.5, padding: '10px 18px', borderRadius: 10, boxShadow: '0 4px 14px rgba(236,72,153,0.25)' }}>
          Demander une démo
        </a>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 80px' }}>
        <section style={{ textAlign: 'center', padding: '32px 0 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yeter-icon.png" alt="Yeter" width={76} height={76} style={{ borderRadius: 18, boxShadow: '0 8px 28px rgba(139,92,246,0.22)', marginBottom: 20 }} />
          <div style={{ display: 'block' }}>
            <span style={{ display: 'inline-block', border: '1px solid rgba(236,72,153,0.35)', background: 'rgba(236,72,153,0.06)', color: '#DB2777', borderRadius: 999, fontSize: 12, fontWeight: 600, padding: '6px 14px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Talmudei torah · Clubs · Cantines
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(38px, 7vw, 64px)', fontWeight: 900, lineHeight: 1.08, margin: '22px 0 0', letterSpacing: '-0.02em' }}>
            <span style={{ backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Le plus qui change tout</span>
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.5vw, 19px)', color: '#5B5675', maxWidth: 640, margin: '20px auto 0', lineHeight: 1.65 }}>
            Inscriptions en ligne, cotisations encaissées automatiquement, familles informées.
            Yeter s&apos;occupe de la gestion — vous, occupez-vous des enfants.
          </p>
          <div style={{ marginTop: 32 }}>
            <a href="mailto:admin@talmidapp.fr?subject=Demande%20de%20demo%20Yeter"
              style={{ background: GRADIENT, color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 16, padding: '15px 34px', borderRadius: 13, display: 'inline-block', boxShadow: '0 8px 30px rgba(236,72,153,0.30)' }}>
              Demander une démo gratuite
            </a>
            <div style={{ fontSize: 12.5, color: '#8A86A0', marginTop: 14 }}>Mise en route en une journée · Données hébergées en France · Sans engagement</div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#FFFFFF', border: '1px solid #ECEAF4', borderRadius: 16, padding: '22px 20px', boxShadow: '0 2px 12px rgba(30,27,46,0.05)' }}>
              <div style={{ fontSize: 26 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, margin: '10px 0 6px', color: '#1E1B2E' }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: '#5B5675', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </section>

        <section style={{ textAlign: 'center', marginTop: 72, border: '1px solid #ECEAF4', borderRadius: 20, padding: '40px 24px', background: '#FFFFFF', boxShadow: '0 2px 12px rgba(30,27,46,0.05)' }}>
          <div style={{ fontSize: 15, color: '#5B5675' }}>Déjà utilisé au quotidien par des établissements gérant</div>
          <div style={{ fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 900, marginTop: 8, backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            des centaines de familles et leurs règlements
          </div>
          <div style={{ fontSize: 13, color: '#8A86A0', marginTop: 10 }}>Le même moteur fait tourner des écoles complètes sur TalmidApp — Yeter en est la version allégée, pensée pour vous.</div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid #ECEAF4', padding: '26px 24px', textAlign: 'center', fontSize: 12.5, color: '#8A86A0', background: '#FFFFFF' }}>
        Yeter by <a href="https://talmidapp.fr" style={{ color: '#059669', textDecoration: 'none', fontWeight: 600 }}>TalmidApp</a> © 2026 · La gestion scolaire réinventée
      </footer>
    </div>
  )
}
