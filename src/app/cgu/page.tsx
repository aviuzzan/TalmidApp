'use client'

/**
 * CGU - Conditions Générales d'Utilisation.
 * Page minimaliste mais structurée. À compléter avec les valeurs réelles.
 */
export default function CguPage() {
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
          Conditions générales d&apos;utilisation
        </h1>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 36px' }}>
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <Section title="1. Objet">
          <p>
            Les présentes conditions générales (« CGU ») régissent l&apos;accès et
            l&apos;utilisation de la plateforme TalmidApp, service en ligne de gestion
            scolaire destiné aux établissements éducatifs et à leurs familles.
          </p>
          <p>
            L&apos;utilisation du service implique l&apos;acceptation pleine et entière des
            présentes CGU.
          </p>
        </Section>

        <Section title="2. Définitions">
          <ul>
            <li><strong>Éditeur :</strong> TalmidApp, propriétaire et exploitant de la plateforme.</li>
            <li><strong>Établissement :</strong> école cliente, abonnée au service.</li>
            <li><strong>Utilisateur :</strong> toute personne accédant à la plateforme (administrateur, enseignant, parent).</li>
            <li><strong>Service :</strong> ensemble des fonctionnalités proposées par la plateforme.</li>
          </ul>
        </Section>

        <Section title="3. Accès au service">
          <p>
            L&apos;accès au service est conditionné à la création d&apos;un compte par
            l&apos;établissement. Chaque utilisateur reçoit un identifiant personnel et
            s&apos;engage à conserver la confidentialité de son mot de passe.
          </p>
          <p>
            L&apos;éditeur ne saurait être tenu responsable de l&apos;usage frauduleux d&apos;un
            compte par un tiers en cas de négligence de l&apos;utilisateur (mot de passe
            partagé, session non déconnectée, etc.).
          </p>
        </Section>

        <Section title="4. Engagements de l'éditeur">
          <p>L&apos;éditeur s&apos;engage à :</p>
          <ul>
            <li>Fournir un service fonctionnel, accessible 24h/24 et 7j/7, hors maintenance programmée ou cas de force majeure.</li>
            <li>Protéger les données conformément à la politique de confidentialité.</li>
            <li>Informer les établissements en cas d&apos;évolution majeure du service.</li>
            <li>Conserver les données comptables pendant 10 ans conformément aux obligations légales.</li>
          </ul>
        </Section>

        <Section title="5. Engagements de l'utilisateur">
          <p>L&apos;utilisateur s&apos;engage à :</p>
          <ul>
            <li>Utiliser le service conformément à sa destination et à la législation en vigueur.</li>
            <li>Fournir des informations exactes et tenir ses données à jour.</li>
            <li>Ne pas tenter de contourner les mesures de sécurité.</li>
            <li>Ne pas utiliser le service à des fins illicites, frauduleuses ou contraires aux bonnes mœurs.</li>
            <li>Respecter les données personnelles d&apos;autres utilisateurs auxquelles il pourrait avoir accès.</li>
          </ul>
        </Section>

        <Section title="6. Propriété intellectuelle">
          <p>
            La plateforme, son code source, son design, ses textes et ses contenus sont la
            propriété exclusive de l&apos;éditeur. Toute reproduction ou exploitation non
            autorisée est interdite.
          </p>
          <p>
            Les données saisies par les établissements et les familles restent leur
            propriété. L&apos;éditeur n&apos;en fait usage que pour la fourniture du service.
          </p>
        </Section>

        <Section title="7. Responsabilité">
          <p>
            L&apos;éditeur ne saurait être tenu responsable :
          </p>
          <ul>
            <li>Des interruptions de service dues à un cas de force majeure ou à un défaut des sous-traitants (hébergeur, prestataires).</li>
            <li>Des pertes de données dues à une mauvaise utilisation du service par l&apos;utilisateur.</li>
            <li>Des dommages indirects résultant de l&apos;utilisation du service.</li>
          </ul>
          <p>
            L&apos;établissement reste responsable de traitement de ses données (article 4 RGPD).
            L&apos;éditeur agit en qualité de sous-traitant.
          </p>
        </Section>

        <Section title="8. Données personnelles">
          <p>
            Le traitement des données personnelles est détaillé dans la
            <a href="/confidentialite" style={{ color: '#2563EB' }}> politique de confidentialité</a>,
            qui fait partie intégrante des présentes CGU.
          </p>
        </Section>

        <Section title="9. Évolution du service">
          <p>
            L&apos;éditeur se réserve le droit de faire évoluer le service (ajout, modification,
            suppression de fonctionnalités) sans préavis. Il s&apos;engage toutefois à
            informer les établissements en cas d&apos;évolution majeure.
          </p>
        </Section>

        <Section title="10. Suspension et résiliation">
          <p>
            En cas de manquement grave aux présentes CGU, l&apos;éditeur peut suspendre ou
            résilier l&apos;accès au service, après mise en demeure restée sans effet sous 30
            jours, sauf urgence avérée.
          </p>
        </Section>

        <Section title="11. Modification des CGU">
          <p>
            L&apos;éditeur se réserve le droit de modifier les présentes CGU. Les utilisateurs
            seront informés des modifications substantielles par email ou via une notification
            dans l&apos;application.
          </p>
        </Section>

        <Section title="12. Droit applicable et juridiction">
          <p>
            Les présentes CGU sont régies par le droit français. Tout litige relatif à leur
            interprétation ou à leur exécution sera soumis aux tribunaux français compétents,
            après tentative de résolution amiable.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Pour toute question relative aux présentes CGU :
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
