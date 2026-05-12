'use client'
/**
 * Dialog de confirmation modale.
 * Usage:
 *   const confirm = useConfirm()
 *   const ok = await confirm({ title: 'Supprimer', message: 'Sûr ?', danger: true })
 *   if (ok) doDelete()
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmApi = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmApi>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)

  const ask = useCallback<ConfirmApi>((opts) => {
    return new Promise<boolean>(resolve => {
      setState({ ...opts, resolve })
    })
  }, [])

  function close(result: boolean) {
    if (state) state.resolve(result)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <div onClick={() => close(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          animation: 'confirm-fade-in 0.15s ease-out',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 14,
            maxWidth: 420, width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            animation: 'confirm-pop-in 0.2s ease-out',
          }}>
            <div style={{ padding: '22px 24px 8px' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1E293B' }}>{state.title}</div>
              {state.message && (
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 8, lineHeight: 1.5 }}>{state.message}</div>
              )}
            </div>
            <div style={{
              padding: '16px 24px 22px',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
            }}>
              <button onClick={() => close(false)} style={{
                background: '#fff', border: '1px solid #CBD5E1',
                color: '#475569', fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
              }}>{state.cancelLabel ?? 'Annuler'}</button>
              <button onClick={() => close(true)} style={{
                background: state.danger ? '#DC2626' : '#2563EB',
                border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
              }}>{state.confirmLabel ?? (state.danger ? 'Supprimer' : 'Confirmer')}</button>
            </div>
          </div>
          <style jsx global>{`
            @keyframes confirm-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes confirm-pop-in  { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          `}</style>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}
