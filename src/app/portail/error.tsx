'use client'
import { useEffect } from 'react'

/**
 * Error boundary du portail parent (Next App Router).
 * S'affiche a la place de la page en cas d'erreur non geree :
 * message sobre aux couleurs du portail + bouton Reessayer (reset)
 * + retour a l'accueil du portail.
 */
export default function PortailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Trace pour le debug (visible en console navigateur / monitoring)
    console.error('[portail] Erreur non geree :', error)
  }, [error])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
      <div style={{
        background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
        padding: '36px 32px', maxWidth: 460, width: '100%', textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', margin: '0 0 8px' }}>
          Une erreur est survenue
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, margin: '0 0 22px' }}>
          Impossible d&apos;afficher cette page pour le moment. Vous pouvez r&eacute;essayer,
          ou revenir &agrave; l&apos;accueil de votre espace famille.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={reset}
            style={{
              background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10,
              padding: '11px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44,
            }}>
            Réessayer
          </button>
          <a href="/portail"
            style={{
              background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 10,
              padding: '11px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box',
            }}>
            Retour &agrave; l&apos;accueil
          </a>
        </div>
      </div>
    </div>
  )
}
