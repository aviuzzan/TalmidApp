'use client'

/**
 * Mentions légales - obligatoires (art. 6 LCEN).
 * Page minimaliste, à compléter avec les vraies informations société.
 */
export default function MentionsLegalesPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #EFF6FF 100%)',
      fontFamily: 'Inter, -apple-system, sans-serif',
      color: '#0F172A',
    }}>
      <header style={{
        maxWidth: 820, margin: '0 auto', padding: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ textDecoration: 'none', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎓</span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>TalmidApp</span>
        </a>
        <a href="/" style={{ color: '#64748B', fontSize: 13, textDecoration: 'none' }}>← Retour</a>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 80px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Mentions légales
        </h1>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 36px' }}>
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <Section title="Éditeur du site">
          <p>
            Le site <strong>talmidapp.fr</strong> est édité par TalmidApp.
          </p>
          <ul>
            <li><strong>Raison sociale :</strong> TalmidApp</li>
            <li><strong>Adresse :</strong> à compléter</li>
            <li><strong>Email :</strong> contact@talmidapp.fr</li>
            <li><strong>Directeur de la publication :</strong> Avi Uzzan</li>
          </ul>
        </Section>

        <Section title="Hébergement">
          <p>
            Le site est hébergé par :
          </p>
          <ul>
            <li><strong>Vercel Inc.</strong> — 440 N Barranca Avenue #4133, Covina CA 91723, États-Unis.</li>
          </ul>
          <p>
            Les données sont stockées sur l&apos;infrastructure de <strong>Supabase</strong>
            (région Europe — Frankfurt, Allemagne).
          </p>
        </Section>

        <Section title="Propriété intellectuelle">
          <p>
            L&apos;ensemble du contenu de ce site (textes, images, vidéos, logos, code source)
            est protégé par le droit d&apos;auteur. Toute reproduction sans autorisation préalable
            écrite de l&apos;éditeur est interdite.
          </p>
        </Section>

        <Section title="Responsabilité">
          <p>
            L&apos;éditeur s&apos;efforce de fournir des informations exactes et à jour, sans
            pouvoir garantir l&apos;absence d&apos;erreur. L&apos;utilisation des informations
            et contenus disponibles sur le site se fait sous la seule responsabilité de
            l&apos;utilisateur.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Pour toute question relative à ces mentions légales :
            <br />
            <a href="mailto:contact@talmidapp.fr" style={{ color: '#2563EB' }}>contact@talmidapp.fr</a>
          </p>
        </Section>

        <Footer />
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#0F172A' }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: '#475569' }}>{children}</div>
    </section>
  )
}

function Footer() {
  return (
    <div style={{
      marginTop: 50, paddingTop: 22, borderTop: '1px solid #E2E8F0',
      display: 'flex', gap: 18, fontSize: 12, color: '#94A3B8', flexWrap: 'wrap',
    }}>
      <a href="/mentions-legales" style={{ color: '#64748B', textDecoration: 'none' }}>Mentions légales</a>
      <a href="/confidentialite" style={{ color: '#64748B', textDecoration: 'none' }}>Confidentialité</a>
      <a href="/cgu" style={{ color: '#64748B', textDecoration: 'none' }}>CGU</a>
    </div>
  )
}
