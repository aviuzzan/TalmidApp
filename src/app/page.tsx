'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const FEATURES = [
  { icon: '👨‍👩‍👧', title: 'Gestion des familles', desc: 'Dossiers complets, situation maritale, contacts, documents — tout centralisé en un clic.' },
  { icon: '💰', title: 'Moteur financier', desc: 'Calcul automatique des scolarités, facturation par enfant, suivi des règlements en temps réel.' },
  { icon: '📧', title: 'Notifications email', desc: 'Templates personnalisables avec variables dynamiques. Solde, relances, bienvenue — automatisés.' },
  { icon: '👨‍🏫', title: 'Portail enseignants', desc: 'Chaque professeur accède à sa classe, ses élèves, saisit notes et commentaires.' },
  { icon: '👨‍👩‍👧‍👦', title: 'Portail parents', desc: "Espace sécurisé : enfants, factures, solde, documents — accessible depuis n'importe quel appareil." },
  { icon: '📅', title: 'Gestion N+1', desc: "Préparez la rentrée suivante sans stress : inscriptions anticipées, passage de classe, listes d'attente." },
]

const STATS = [
  { value: '100%', label: 'En ligne, zéro installation' },
  { value: '4', label: 'Rôles distincts par école' },
  { value: '∞', label: 'Familles & élèves gérables' },
  { value: '2026', label: 'Disponible pour la rentrée' },
]

const PRICING = [
  {
    name: 'Essentiel',
    price: '20€',
    period: '/ mois',
    desc: "Jusqu'à 20 élèves",
    badge: null,
    features: [
      'Jusqu\'à 20 élèves',
      'Tous les modules inclus',
      'Portail parents & profs',
      'Notifications email',
      'Support email',
    ],
    cta: 'Démarrer',
    highlight: false,
  },
  {
    name: 'Standard',
    price: '1€',
    period: '/ élève / mois',
    desc: 'De 21 à 649 élèves',
    badge: 'POPULAIRE',
    features: [
      'Élèves illimités',
      'Tous les modules inclus',
      'Admins & rôles illimités',
      'Notifications email avancées',
      'Export PDF',
      'Support prioritaire',
    ],
    cta: 'Réserver ma place',
    highlight: true,
  },
  {
    name: 'Volume',
    price: '0,80€',
    period: '/ élève / mois',
    desc: 'À partir de 650 élèves',
    badge: null,
    features: [
      'À partir de 650 élèves',
      'Multi-établissements',
      'Console centrale',
      'SLA garanti',
      'Onboarding dédié',
      'Formation incluse',
    ],
    cta: 'Nous contacter',
    highlight: false,
  },
]

function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [school, setSchool] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleContact(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div style={{ fontFamily: "'Outfit', system-ui, sans-serif", background: '#050A14', color: '#E8EDF8', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
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
        a { text-decoration: none; }
      `}</style>

      {/* NAVBAR */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 6%', height: 68,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(5,10,20,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'all 0.3s',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo-icon.png" alt="TalmidApp" style={{ height: 36, width: 'auto' }} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#1E3A6E' }}>Talmid</span>
            <span style={{ color: '#3B82F6' }}>App</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {[['Fonctionnalités', '#fonctionnalites'], ['Tarifs', '#tarifs'], ['Contact', '#contact']].map(([label, href]) => (
            <a key={label} href={href} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}>
              {label}
            </a>
          ))}
          <button onClick={() => router.push('/login')}
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: 8, padding: '8px 18px', color: '#60A5FA', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Connexion →
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 6% 80px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 70%)' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 820 }}>
          {/* Logo hero */}
          <div className="fade-up-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <img src="/logo-icon.png" alt="TalmidApp" className="float" style={{ height: 100, width: 'auto', filter: 'drop-shadow(0 0 30px rgba(59,130,246,0.5))' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 100, padding: '6px 16px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#60A5FA', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                Disponible rentrée 2026–2027
              </span>
            </div>
          </div>

          <h1 className="fade-up-2" style={{ fontSize: 'clamp(38px, 6vw, 76px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 24 }}>
            La gestion scolaire<br />
            <span className="shimmer-text">réinventée.</span>
          </h1>

          <p className="fade-up-3" style={{ fontSize: 'clamp(15px, 2vw, 19px)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 48px' }}>
            TalmidApp centralise l'administration, les finances, la communication et les portails famille et enseignant — en un seul outil pensé pour les écoles privées et associatives.
          </p>

          <div className="fade-up-4" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#contact" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #3B82F6, #6366F1)', borderRadius: 12, padding: '14px 28px', color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 8px 32px rgba(59,130,246,0.35)' }}>
              Réserver ma démonstration →
            </a>
            <a href="#fonctionnalites" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '14px 28px', color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: 600 }}>
              Voir les fonctionnalités
            </a>
          </div>
        </div>

        {/* Dashboard preview */}
        <div className="float" style={{ marginTop: 80, position: 'relative', zIndex: 1, width: '100%', maxWidth: 860, background: 'linear-gradient(135deg, rgba(30,50,80,0.8), rgba(15,25,45,0.9))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24, boxShadow: '0 40px 80px rgba(0,0,0,0.6)', animationDelay: '0.5s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />)}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 6, height: 24, marginLeft: 8, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>talmidapp.fr/hederloubavitch</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Familles', value: '84', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
              { label: 'Élèves actifs', value: '127', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
              { label: 'CA annuel', value: '359k €', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
              { label: 'Soldes ouverts', value: '3', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: '60px 6%', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, textAlign: 'center' }}>
          {STATS.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: '#60A5FA' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="fonctionnalites" style={{ padding: '100px 6%' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 14 }}>Fonctionnalités</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 46px)', fontWeight: 800, letterSpacing: '-0.03em' }}>Tout ce dont votre école a besoin</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, marginTop: 14, maxWidth: 500, margin: '14px auto 0' }}>
              Une plateforme unifiée qui remplace vos fichiers Excel, vos mails et vos outils éparpillés.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="card-hover" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '28px 24px' }}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="tarifs" style={{ padding: '100px 6%', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 14 }}>Tarifs</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 46px)', fontWeight: 800, letterSpacing: '-0.03em' }}>Simple et transparent</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>
              À partir de <strong style={{ color: '#60A5FA' }}>1€/élève/mois</strong> — vous payez selon votre taille, sans surprise.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'center' }}>
            {PRICING.map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight ? 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12))' : 'rgba(255,255,255,0.03)',
                border: plan.highlight ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 20, padding: '32px 28px',
                transform: plan.highlight ? 'scale(1.04)' : 'scale(1)',
                boxShadow: plan.highlight ? '0 20px 60px rgba(59,130,246,0.2)' : 'none',
                position: 'relative' as const,
              }}>
                {plan.badge && (
                  <div style={{ position: 'absolute' as const, top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #3B82F6, #6366F1)', borderRadius: 100, padding: '4px 16px', fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.08em', whiteSpace: 'nowrap' as const }}>
                    {plan.badge}
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.04em' }}>{plan.price}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.3 }}>{plan.period}</span>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 16 }}>{plan.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)', alignItems: 'flex-start' }}>
                      <span style={{ color: '#22C55E', flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <a href="#contact" style={{
                  display: 'block', textAlign: 'center' as const, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: plan.highlight ? 'linear-gradient(135deg, #3B82F6, #6366F1)' : 'rgba(255,255,255,0.08)',
                  color: '#fff', boxShadow: plan.highlight ? '0 8px 24px rgba(59,130,246,0.3)' : 'none',
                  transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          {/* Note */}
          <div style={{ textAlign: 'center', marginTop: 32, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Tous les plans incluent l'ensemble des modules. Pas de frais cachés. Facturation mensuelle sans engagement.
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ padding: '100px 6%' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 14 }}>Contact</div>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>Réservez votre démonstration</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, marginBottom: 40 }}>
            Laissez-nous vos coordonnées, nous vous recontactons dans les 24h.
          </p>
          {submitted ? (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, padding: '40px 24px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Demande reçue !</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Nous vous contacterons dans les 24h à l'adresse indiquée.</div>
            </div>
          ) : (
            <form onSubmit={handleContact} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14, textAlign: 'left' as const }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.05em' }}>NOM DE L'ÉCOLE *</label>
                <input value={school} onChange={e => setSchool(e.target.value)} required
                  placeholder="Ex: École Talmud Torah de Lyon"
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color 0.15s' }}
                  onFocus={e => (e.target.style.borderColor = '#3B82F6')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: '0.05em' }}>EMAIL DE CONTACT *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="directeur@votreecole.fr"
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color 0.15s' }}
                  onFocus={e => (e.target.style.borderColor = '#3B82F6')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')} />
              </div>
              <button type="submit" style={{ padding: '14px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #3B82F6, #6366F1)', color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: '0 8px 24px rgba(59,130,246,0.3)', marginTop: 4 }}>
                Envoyer ma demande →
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '40px 6%', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo-icon.png" alt="TalmidApp" style={{ height: 28, width: 'auto' }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>Talmid</span>
            <span style={{ color: '#3B82F6' }}>App</span>
          </span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>© 2025</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['Mentions légales', 'CGU', 'RGPD'].map(item => (
            <a key={item} href="#" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
              {item}
            </a>
          ))}
        </div>
        <a href="mailto:admin@talmidapp.fr" style={{ color: '#3B82F6', fontSize: 13, fontWeight: 500 }}>
          admin@talmidapp.fr
        </a>
      </footer>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [showLanding, setShowLanding] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setShowLanding(true); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()

      if (profile?.role === 'admin' || profile?.role === 'super_admin') {
        router.push('/dashboard')
      } else if (profile?.role === 'teacher') {
        router.push('/teacher')
      } else {
        router.push('/portail')
      }
    }
    check()
  }, [router])

  if (showLanding) return <LandingPage />

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050A14' }}>
      <div style={{ color: '#64748B' }}>Chargement...</div>
    </div>
  )
}
