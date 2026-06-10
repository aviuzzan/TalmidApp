'use client'
import { useState, useRef, useEffect, ReactNode } from 'react'

/**
 * Tooltip contextuel - bulle d'aide qui s'affiche au survol ou au clic.
 *
 * Usage simple (icône "?") :
 *   <Tooltip text="Code de facturation modulé selon le revenu." />
 *
 * Usage avec contenu custom (entoure un élément) :
 *   <Tooltip text="Aide">
 *     <span>Mon élément déclencheur</span>
 *   </Tooltip>
 *
 * Le positionnement est automatique : essaie au-dessus, sinon en-dessous.
 */
interface Props {
  text: string
  children?: ReactNode
  /** Largeur max de la bulle, défaut 280 */
  width?: number
  /** Position préférée, défaut 'top' */
  position?: 'top' | 'bottom'
}

export default function Tooltip({ text, children, width = 280, position = 'top' }: Props) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<'top' | 'bottom'>(position)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    // Si pas la place au-dessus, bascule en bas
    if (position === 'top' && rect.top < 80) setPlacement('bottom')
    else setPlacement(position)
  }, [open, position])

  const trigger = children ?? (
    <span
      aria-label="Aide"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%',
        background: '#E2E8F0', color: '#64748B',
        fontSize: 10, fontWeight: 700, cursor: 'help',
        verticalAlign: 'middle', marginLeft: 4,
      }}
    >
      ?
    </span>
  )

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
    >
      {trigger}
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            [placement === 'top' ? 'bottom' : 'top']: 'calc(100% + 8px)',
            width,
            background: '#0F172A',
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.5,
            padding: '10px 12px',
            borderRadius: 8,
            boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
            zIndex: 1000,
            fontWeight: 400,
            textAlign: 'left',
            whiteSpace: 'normal',
            pointerEvents: 'none',
          }}
        >
          {text}
          {/* Petite flèche */}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              [placement === 'top' ? 'bottom' : 'top']: -4,
              width: 8,
              height: 8,
              background: '#0F172A',
            }}
          />
        </span>
      )}
    </span>
  )
}
