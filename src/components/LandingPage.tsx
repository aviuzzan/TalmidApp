'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const FEATURES = [
  { icon: '👨‍👩‍👧', title: 'Gestion des familles', desc: 'Dossiers complets, situation maritale, contacts, documents — tout centralisé en un clic.' },
  { icon: '💰', title: 'Moteur financier', desc: 'Calcul automatique des scolarités, facturation par enfant, suivi des règlements en temps réel.' },
  { icon: '📧', title: 'Notifications email', desc: 'Templates personnalisables avec variables dynamiques. Solde, relances, bienvenue — automatisés.' },
  { icon: '👨‍🏫', title: 'Portail enseignants', desc: 'Chaque professeur accède à sa classe, ses élèves, saisit notes et commentaires.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Portail parents', desc: 'Espace sécurisé : enfants, factures, solde, documents — accessible depuis n\'importe quel appareil.' },
  { icon: '📅', title: 'Gestion N+1', desc: 'Préparez la rentrée suivante sans stress : inscriptions anticipées, passage de classe, listes d\'attente.' },
]

const STATS = [
  { value: '100%', label: 'En ligne, zéro installation' },
  { value: '4', label: 'Rôles distincts par école' },
  { value: '∞', label: 'Familles & élèves gérables' },
  { value: '2027', label: 'Disponible pour la rentrée' },
]

const PRICING = [
  {
    name: 'Découverte',
    price: 'Gratuit',
    period: '',
    desc: 'Pour tester la plateforme',
    features: ['Jusqu\'à 30 familles', 'Tous les modules inclus', 'Support email', '1 administrateur'],
    cta: 'Commencer gratuitement',
    highlight: false,
  },
  {
    name: 'École',
    price: '49€',
    period: '/ mois',
    desc: 'Pour les petites et moyennes écoles',
    features: ['Familles illimitées', 'Tous les modules inclus', 'Support prioritaire', 'Admins illimités', 'Notifications email', 'Export PDF'],
    cta: 'Réserver ma place',
    highlight: true,
  },
  {
    name: 'Réseau',
    price: 'Sur devis',
    period: '',
    desc: 'Pour les réseaux d\'établissements',
    features: ['Multi-établissements', 'Console centrale', 'Intégrations sur mesure', 'SLA garanti', 'Onboarding dédié', 'Formation incluse'],
    cta: 'Nous contacter',
    highlight: false,
  },
]

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [school, setSchool] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleContact(e: React.FormEvent) {
    e.preventDefault()
    // TODO: send to Brevo/Supabase
    setSubmitted(true)
  }

  return (
    <div style={{ fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif", background: '#050A14', color: '#E8EDF8', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 4px; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(59,130,246,0.3); }
          50% { box-shadow: 0 0 60px rgba(59,130,246,0.6); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .fade-up-1 { animation: fadeUp 0.7s 0.1s ease both; }
        .fade-up-2 { animation: fadeUp 0.7s 0.2s ease both; }
        .fade-up-3 { animation: fadeUp 0.7s 0.3s ease both; }
        .fade-up-4 { animation: fadeUp 0.7s 0.4s ease both; }
        .float { animation: float 4s ease-in-out infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, #60A5FA, #A78BFA, #60A5FA);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .card-hover { transition: transform 0.2s, box-shadow 0.2s; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
        .btn-glow:hover { animation: pulse-glow 1.5s ease infinite; }
        input:focus, textarea:focus { outline: none; border-color: #3B82F6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 5%', height: 68,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(5,10,20,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'all 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff',
          }}>T</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>TalmidApp</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Fonctionnalités', 'Tarifs', 'Contact'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`}
              style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}>
              {item}
            </a>
          ))}
          <button onClick={() => router.push('/login')}
            style={{
              background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)',
              borderRadius: 8, padding: '8px 18px', color: '#60A5FA',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.15)' }}>
            Connexion →
          </button>
          <button onClick={() => router.push('/admin')}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 14px', color: 'rgba(255,255,255,0.25)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}>
            ⚙
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '120px 5% 80px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background mesh */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(139,92,246,0.1) 0%, transparent 60%)',
        }} />
        <div style={{
          position: 'absolute', top: '20%', left: '10%', width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(40px)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800 }}>
          {/* Badge */}
          <div className="fade-up-1" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 100, padding: '6px 16px', marginBottom: 32,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#60A5FA', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Disponible rentrée 2026–2027
            </span>
          </div>

          {/* Title */}
          <h1 className="fade-up-2" style={{
            fontSize: 'clamp(40px, 7vw, 80px)', fontWeight: 900,
            lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 24,
          }}>
            La gestion scolaire
            <br />
            <span className="shimmer-text">réinventée.</span>
          </h1>

          <p className="fade-up-3" style={{
            fontSize: 'clamp(16px, 2vw, 20px)', color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.7, marginBottom: 48, maxWidth: 580, margin: '0 auto 48px',
          }}>
            TalmidApp centralise l'administration, les finances, la communication et les portails famille et enseignant — en un seul outil conçu pour les écoles privées et associatives.
          </p>

          {/* CTA */}
          <div className="fade-up-4" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#contact"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
                borderRadius: 12, padding: '14px 28px',
                color: '#fff', fontSize: 15, fontWeight: 700,
                textDecoration: 'none', transition: 'opacity 0.15s',
                boxShadow: '0 8px 32px rgba(59,130,246,0.35)',
              }}
              className="btn-glow"
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Réserver ma démonstration →
            </a>
            <a href="#fonctionnalités"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12, padding: '14px 28px',
                color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}>
              Voir les fonctionnalités
            </a>
          </div>
        </div>

        {/* Floating dashboard preview */}
        <div className="fade-up float" style={{
          marginTop: 80, position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 900,
          background: 'linear-gradient(135deg, rgba(30,50,80,0.8), rgba(15,25,45,0.9))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: 24,
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Fake browser bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map(c => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
            ))}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 6, height: 24, marginLeft: 8, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>talmidapp.fr/hederloubavitch</span>
            </div>
          </div>

          {/* Fake dashboard content */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Familles', value: '84', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
              { label: 'Élèves actifs', value: '127', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
              { label: 'CA annuel', value: '359k €', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
              { label: 'Soldes ouverts', value: '3', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, height: 80, display: 'flex', alignItems: 'center', gap: 8 }}>
              {[40,65,55,80,70,90,75,95].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 7 ? 'linear-gradient(180deg,#3B82F6,#6366F1)' : 'rgba(59,130,246,0.3)', borderRadius: 3 }} />
              ))}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, height: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
              {[['Collecté', '#22C55E', '94%'], ['Échecs', '#EF4444', '6%']].map(([l, c, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</span>
                  <span style={{ color: c as string, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ padding: '60px 5%', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, textAlign: 'center' }}>
          {STATS.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-0.04em', background: 'linear-gradient(135deg, #60A5FA, #A78BFA)', WebkitBackgroundClip: 'text' as any, WebkitTextFillColor: 'transparent' as any }}>{s.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="fonctionnalités" style={{ padding: '100px 5%' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Fonctionnalités</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Tout ce dont votre école a besoin
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, marginTop: 16, maxWidth: 500, margin: '16px auto 0' }}>
              Une plateforme unifiée qui remplace vos fichiers Excel, vos mails et vos outils éparpillés.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} className="card-hover" style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 16, padding: '28px 24px',
                animationDelay: `${i * 0.1}s`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="tarifs" style={{ padding: '100px 5%', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Tarifs</div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em' }}>
              Simple et transparent
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>
              Disponible pour la rentrée 2026–2027. Réservez votre place dès maintenant.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
            {PRICING.map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.15) 100%)'
                  : 'rgba(255,255,255,0.03)',
                border: plan.highlight ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 20, padding: '32px 28px',
                position: 'relative', overflow: 'hidden',
                transform: plan.highlight ? 'scale(1.03)' : 'scale(1)',
                boxShadow: plan.highlight ? '0 20px 60px rgba(59,130,246,0.2)' : 'none',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
                    borderRadius: 100, padding: '3px 12px',
                    fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.05em',
                  }}>POPULAIRE</div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em' }}>{plan.price}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>{plan.period}</span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>{plan.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      <span style={{ color: '#22C55E', flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                <a href="#contact"
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px',
                    borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600,
                    background: plan.highlight ? 'linear-gradient(135deg, #3B82F6, #6366F1)' : 'rgba(255,255,255,0.07)',
                    color: '#fff', transition: 'opacity 0.15s',
                    boxShadow: plan.highlight ? '0 8px 24px rgba(59,130,246,0.3)' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" style={{ padding: '100px 5%' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Contact</div>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>
            Réservez votre démonstration
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, marginBottom: 40 }}>
            Laissez-nous vos coordonnées, nous vous recontactons dans les 24h.
          </p>

          {submitted ? (
            <div style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 16, padding: '32px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Demande reçue !</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Nous vous contacterons dans les 24h.</div>
            </div>
          ) : (
            <form onSubmit={handleContact} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.03em' }}>NOM DE L'ÉCOLE *</label>
                <input value={school} onChange={e => setSchool(e.target.value)} required
                  placeholder="Ex: École Talmud Torah de Lyon"
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.03em' }}>EMAIL DE CONTACT *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="directeur@votreecole.fr"
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14 }} />
              </div>
              <button type="submit"
                style={{
                  padding: '14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
                  marginTop: 4,
                }}>
                Envoyer ma demande →
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '40px 5%', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>T</div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>TalmidApp</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>© 2025</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Mentions légales', 'CGU', 'RGPD', 'Contact'].map(item => (
            <a key={item} href="#" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none', fontSize: 13, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
              {item}
            </a>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
          <a href="mailto:admin@talmidapp.fr" style={{ color: '#3B82F6', textDecoration: 'none' }}>admin@talmidapp.fr</a>
        </div>
      </footer>
    </div>
  )
}
