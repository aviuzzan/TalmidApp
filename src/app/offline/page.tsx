'use client'

/**
 * Page affichée par le service worker quand l'utilisateur est hors-ligne
 * et que la page demandée n'est pas en cache.
 */
export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      textAlign: 'center', background: '#F8FAFC',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📡</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>Vous êtes hors-ligne</h1>
      <p style={{ color: '#64748B', fontSize: 14, marginTop: 10, maxWidth: 380, lineHeight: 1.5 }}>
        Cette page n&apos;est pas disponible sans connexion internet. Les pages que vous avez déjà
        consultées restent accessibles. Reconnectez-vous pour accéder à tout TalmidApp.
      </p>
      <button onClick={() => window.location.reload()}
        style={{
          marginTop: 24, background: '#2563EB', color: '#fff', border: 'none',
          borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
        🔄 Réessayer
      </button>
    </div>
  )
}
