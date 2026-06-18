'use client'
import { useState } from 'react'

/**
 * Bouton d'aide pour chaque etape du parcours d'inscription portail.
 *
 * Comportement :
 *  - Petit bouton "?" rond avec tooltip au survol ("Voir l'aide")
 *  - Au clic : ouvre une modale FAQ avec 3 sections (a quoi ca sert,
 *    ce qu'il faut preparer, combien de temps)
 *
 * Props :
 *  - titreEtape : titre affiche dans la modale
 *  - aQuoiCaSert : description en 1-2 phrases
 *  - preparation : tableau de choses a preparer (sera affiche en liste)
 *  - duree : ex "5 a 10 minutes"
 *  - couleur : couleur accent (par defaut bleu)
 */
export default function AideEtape({
  titreEtape,
  aQuoiCaSert,
  preparation,
  duree,
  couleur = '#2563EB',
}: {
  titreEtape: string
  aQuoiCaSert: string
  preparation: string[]
  duree: string
  couleur?: string
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          aria-label="Voir l'aide"
          style={{
            width: 26, height: 26, borderRadius: '50%',
            background: '#EFF6FF',
            color: couleur,
            border: `1px solid ${couleur}40`,
            cursor: 'pointer',
            fontSize: 14, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
            padding: 0,
          }}
        >?</button>
        {hover && (
          <div style={{
            position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)',
            background: '#1E293B', color: '#fff',
            fontSize: 11, padding: '5px 9px', borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>Voir l&apos;aide</div>
        )}
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16,
              maxWidth: 480, width: '100%',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ background: couleur, color: '#fff', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: '0.05em' }}>AIDE</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{titreEtape}</div>
              </div>
              <button onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, width: 30, height: 30, borderRadius: '50%' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* A quoi ca sert */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: couleur, letterSpacing: '0.04em', marginBottom: 6, textTransform: 'uppercase' }}>À quoi ça sert</div>
                <div style={{ fontSize: 13.5, color: '#1E293B', lineHeight: 1.55 }}>{aQuoiCaSert}</div>
              </div>

              {/* Preparation */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: couleur, letterSpacing: '0.04em', marginBottom: 8, textTransform: 'uppercase' }}>Ce qu&apos;il faut préparer</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#1E293B', lineHeight: 1.7 }}>
                  {preparation.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>

              {/* Duree */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>⏱</span>
                <div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TEMPS ESTIMÉ</div>
                  <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{duree}</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ background: '#F8FAFC', padding: '14px 22px', borderTop: '1px solid #E2E8F0', textAlign: 'right' }}>
              <button onClick={() => setOpen(false)}
                style={{ background: couleur, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
