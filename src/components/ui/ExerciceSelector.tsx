'use client'
import { useState } from 'react'
import { useExercice } from '@/lib/exercice-context'
import { statutLabel, statutColor } from '@/lib/exercice'

/**
 * Sélecteur d'exercice global. À placer dans le header du dashboard
 * et dans la sidebar mobile. Tout le filtrage des pages (factures, élèves,
 * contrats, etc.) suit l'exercice sélectionné ici.
 */
export default function ExerciceSelector({ compact = false }: { compact?: boolean }) {
  const { exercice, exerciceSelectionne, exercices, loading, selectExercice } = useExercice()
  const [open, setOpen] = useState(false)

  if (loading) {
    return (
      <div style={{
        padding: compact ? '6px 10px' : '8px 14px',
        background: '#F1F5F9', borderRadius: 8, color: '#94A3B8',
        fontSize: compact ? 12 : 13, fontWeight: 500,
      }}>
        📅 …
      </div>
    )
  }

  if (!exerciceSelectionne) {
    return (
      <div style={{
        padding: compact ? '6px 10px' : '8px 14px',
        background: '#FEF3C7', borderRadius: 8, color: '#92400E',
        fontSize: compact ? 12 : 13, fontWeight: 600,
      }}>
        ⚠️ Aucun exercice
      </div>
    )
  }

  const isCourant = exercice && exercice.id === exerciceSelectionne.id
  const color = statutColor(exerciceSelectionne.statut)

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: compact ? '6px 10px' : '8px 14px',
          background: isCourant ? '#EFF6FF' : '#FFFBEB',
          border: `1px solid ${isCourant ? '#BFDBFE' : '#FCD34D'}`,
          borderRadius: 8,
          color: isCourant ? '#2563EB' : '#92400E',
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>📅 {exerciceSelectionne.code}</span>
        {!isCourant && (
          <span style={{
            background: '#FEF3C7', color: '#92400E',
            fontSize: 9, fontWeight: 700, padding: '1px 6px',
            borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            VUE
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <>
          {/* Backdrop pour fermer en cliquant à côté */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
            }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 51,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
            minWidth: 240,
            padding: 6,
          }}>
            <div style={{
              padding: '8px 10px', fontSize: 10, fontWeight: 700,
              color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Exercice affiché
            </div>
            {exercices.map(ex => {
              const isSel = ex.id === exerciceSelectionne.id
              const isOff = exercice?.id === ex.id
              const c = statutColor(ex.statut)
              return (
                <button
                  key={ex.id}
                  onClick={() => { selectExercice(ex.id); setOpen(false) }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '9px 10px',
                    background: isSel ? '#EFF6FF' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#1E293B',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isSel && <span style={{ color: '#2563EB' }}>✓</span>}
                    <span style={{ fontWeight: isSel ? 600 : 400 }}>📅 {ex.code}</span>
                    {isOff && (
                      <span style={{
                        background: '#ECFDF5', color: '#059669',
                        fontSize: 9, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 6, textTransform: 'uppercase',
                      }}>
                        En cours
                      </span>
                    )}
                  </span>
                  <span style={{
                    background: c.bg, color: c.fg,
                    fontSize: 10, fontWeight: 600, padding: '2px 7px',
                    borderRadius: 5,
                  }}>
                    {statutLabel(ex.statut)}
                  </span>
                </button>
              )
            })}
            <div style={{ height: 1, background: '#E2E8F0', margin: '6px 4px' }} />
            <a
              href={`/${typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : ''}/parametres?onglet=exercices`}
              style={{
                display: 'block', padding: '8px 10px',
                color: '#64748B', fontSize: 12, textDecoration: 'none',
                borderRadius: 6,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              ⚙️ Gérer les exercices…
            </a>
          </div>
        </>
      )}
    </div>
  )
}
