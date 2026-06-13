'use client'

/**
 * Politique de confidentialité — RGPD article 13.
 * Page minimaliste mais conforme. À compléter avec les vraies informations.
 */
export default function ConfidentialitePage() {
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
          Politique de confidentialité
        </h1>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 36px' }}>
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <Section title="Préambule">
          <p>
            TalmidApp est une plateforme de gestion scolaire mise à disposition des
            établissements et de leurs familles. Cette politique explique quelles données
            personnelles sont collectées, dans quel but, et quels sont vos droits.
          </p>
        </Section>

        <Section title="Responsable de traitement">
          <p>
            Le responsable du traitement des données est <strong>l&apos;établissement scolaire</strong>
            qui utilise TalmidApp pour la gestion de ses élèves et familles.
            TalmidApp agit en qualité de <strong>sous-traitant</strong> au sens de l&apos;article 28
            du RGPD.
          </p>
        </Section>

        <Section title="Données collectées">
          <p>Selon votre rôle, TalmidApp peut traiter :</p>
          <ul>
            <li><strong>Familles :</strong> nom, prénoms, email, téléphone, adresse, situation maritale, emploi (facultatif), liens enfants.</li>
            <li><strong>Élèves :</strong> nom, prénoms, date et lieu de naissance, classe, statut d&apos;inscription, éventuellement informations de santé renseignées par les parents.</li>
            <li><strong>Données financières :</strong> factures, règlements, échéanciers, chèques, modes de paiement.</li>
            <li><strong>Données techniques :</strong> adresse IP, journaux de connexion, préférences (langue, exercice sélectionné).</li>
          </ul>
        </Section>

        <Section title="Finalités du traitement">
          <ul>
            <li>Gestion administrative et pédagogique des élèves.</li>
            <li>Facturation, suivi des règlements, comptabilité.</li>
            <li>Communication avec les familles (notifications, relances).</li>
            <li>Sécurité et amélioration du service.</li>
            <li>Respect des obligations légales (conservation des pièces comptables 10 ans).</li>
          </ul>
        </Section>

        <Section title="Base légale">
          <ul>
            <li>Exécution du contrat de scolarisation entre l&apos;école et la famille.</li>
            <li>Obligations légales (comptabilité, archivage).</li>
            <li>Intérêt légitime de l&apos;école pour la gestion scolaire.</li>
          </ul>
        </Section>

        <Section title="Durée de conservation">
          <ul>
            <li><strong>Données scolaires :</strong> durée de la scolarisation + 1 an.</li>
            <li><strong>Pièces comptables (factures, règlements) :</strong> 10 ans (obligation légale).</li>
            <li><strong>Journaux d&apos;audit :</strong> 5 ans.</li>
            <li><strong>Comptes inactifs :</strong> anonymisation après 3 ans d&apos;inactivité.</li>
          </ul>
        </Section>

        <Section title="Destinataires des données">
          <ul>
            <li>Personnel administratif de l&apos;école (selon permissions).</li>
            <li>Enseignants (données pédagogiques de leurs classes uniquement).</li>
            <li>Sous-traitants techniques : Vercel (hébergement), Supabase (base de données, région Europe), Brevo ou SMTP (envoi d&apos;emails).</li>
          </ul>
          <p>
            Aucune donnée n&apos;est revendue à un tiers, ni utilisée à des fins commerciales
            non liées à la gestion scolaire.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>Conformément au RGPD, vous disposez des droits suivants :</p>
          <ul>
            <li><strong>Accès :</strong> obtenir une copie des données vous concernant.</li>
            <li><strong>Rectification :</strong> corriger des données inexactes.</li>
            <li><strong>Effacement :</strong> demander la suppression (sous réserve des obligations légales de conservation).</li>
            <li><strong>Portabilité :</strong> récupérer vos données dans un format structuré (JSON). Une fonctionnalité de téléchargement est disponible dans votre espace.</li>
            <li><strong>Opposition :</strong> vous opposer à certains traitements.</li>
            <li><strong>Limitation :</strong> demander à geler un traitement contesté.</li>
            <li><strong>Réclamation auprès de la CNIL :</strong> <a href="https://www.cnil.fr" style={{ color: '#2563EB' }}>www.cnil.fr</a>.</li>
          </ul>
        </Section>

        <Section title="Sécurité">
          <p>
            TalmidApp met en œuvre des mesures techniques et organisationnelles pour
            protéger vos données : chiffrement des connexions (HTTPS), accès cloisonnés
            par école (RLS Postgres), journaux d&apos;audit, hébergement européen,
            sauvegardes quotidiennes.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            TalmidApp n&apos;utilise que des cookies strictement nécessaires au fonctionnement
            du service (authentification, préférences). Aucun cookie publicitaire ni de
            traçage tiers n&apos;est déposé.
          </p>
        </Section>

        <Section title="Contact RGPD">
          <p>
            Pour exercer vos droits ou poser une question :
            <br />
            <a href="mailto:rgpd@talmidapp.fr" style={{ color: '#2563EB' }}>rgpd@talmidapp.fr</a>
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
