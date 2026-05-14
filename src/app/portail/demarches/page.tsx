'use client'

/**
 * Catégorie « Démarches & documents » du portail famille.
 * Page de regroupement : inscriptions N+1, documents, contact établissement.
 */
export default function DemarchesPage() {
  const items = [
    {
      icon: '📝',
      title: 'Inscriptions année suivante',
      desc: "Réinscription, demande de réduction, ajout d'un nouvel enfant et contrat de scolarisation.",
      href: '/portail/inscriptions',
    },
    {
      icon: '📄',
      title: 'Mes documents',
      desc: "Envoyer et consulter les documents demandés par l'école.",
      href: '/portail/documents',
    },
    {
      icon: '📞',
      title: "Contact de l'établissement",
      desc: "Coordonnées de l'école et de l'administration.",
      href: '/portail/contact',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Démarches &amp; documents</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>Inscriptions, documents et contact de l&apos;établissement</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {items.map(item => (
          <a key={item.href} href={item.href}
            style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '22px 24px', textDecoration: 'none', display: 'flex',
              flexDirection: 'column', gap: 10, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#2563EB'; el.style.boxShadow = '0 4px 12px rgba(37,99,235,0.1)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#E2E8F0'; el.style.boxShadow = 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{item.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>{item.title}</div>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>{item.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
