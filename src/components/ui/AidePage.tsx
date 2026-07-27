'use client'

import { useEffect, useState } from 'react'
import { AIDE_PAGES } from '@/lib/aide-pages'

/**
 * Encart d'aide repliable affiché en haut des grandes pages admin.
 * Usage : <AidePage route="familles" />
 * - Replié par défaut, état mémorisé dans localStorage (talmid_aide_${route}).
 * - Rend null si la route n'a pas d'entrée dans le catalogue aide-pages.
 */
export default function AidePage({ route }: { route: string }) {
  const aide = AIDE_PAGES[route]
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(`talmid_aide_${route}`) === 'ouvert') setOuvert(true)
    } catch {
      // localStorage indisponible (SSR / navigation privée) — on reste replié
    }
  }, [route])

  if (!aide) return null

  const toggle = () => {
    const next = !ouvert
    setOuvert(next)
    try {
      localStorage.setItem(`talmid_aide_${route}`, next ? 'ouvert' : 'ferme')
    } catch {
      // silencieux
    }
  }

  return (
    <div
      style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 10,
        fontSize: 13,
        color: '#475569',
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={ouvert}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: 600,
          color: '#475569',
          textAlign: 'left',
        }}
      >
        <span>ℹ️ Que puis-je faire ici ?</span>
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            transition: 'transform .15s ease',
            transform: ouvert ? 'rotate(90deg)' : 'none',
            fontSize: 12,
            color: '#94A3B8',
          }}
        >
          ▶
        </span>
      </button>
      {ouvert && (
        <div style={{ padding: '0 12px 10px' }}>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>
            {aide.titre}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {aide.points.map((p, i) => (
              <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
