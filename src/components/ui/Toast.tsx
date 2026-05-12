'use client'
/**
 * Toast système — empilable, auto-disparition.
 * Usage:
 *   const toast = useToast()
 *   toast.success('Famille créée')
 *   toast.error('Erreur, réessaye')
 *   toast.info('Profil enregistré')
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; message: string }

type ToastApi = {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastApi>({
  success: () => {},
  error: () => {},
  info: () => {},
})

const COLORS: Record<ToastKind, { bg: string; fg: string; border: string; icon: string }> = {
  success: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0', icon: '✓' },
  error:   { bg: '#FEF2F2', fg: '#991B1B', border: '#FECACA', icon: '✕' },
  info:    { bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE', icon: 'ℹ' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setItems(prev => [...prev, { id, kind, message }])
    setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const api: ToastApi = {
    success: (m) => push('success', m),
    error:   (m) => push('error', m),
    info:    (m) => push('info', m),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 32px)',
      }}>
        {items.map(t => {
          const c = COLORS[t.kind]
          return (
            <div key={t.id} style={{
              background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
              borderRadius: 10, padding: '12px 16px',
              fontSize: 13, fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              display: 'flex', alignItems: 'center', gap: 10,
              pointerEvents: 'auto',
              animation: 'toast-in 0.2s ease-out',
              minWidth: 240, maxWidth: 380,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 700,
                width: 22, height: 22, borderRadius: '50%',
                background: c.fg, color: c.bg,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>{c.icon}</span>
              <span style={{ flex: 1, lineHeight: 1.35 }}>{t.message}</span>
            </div>
          )
        })}
      </div>
      <style jsx global>{`
        @keyframes toast-in {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
