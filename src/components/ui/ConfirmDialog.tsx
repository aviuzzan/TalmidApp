'use client'
/**
 * Dialogs applicatifs modaux — remplacement COMPLET des dialogues natifs du
 * navigateur (arbitrage Avi 06/08/2026 : plus aucun window.confirm/alert/prompt,
 * tout passe par des boites integrees).
 *
 * Deux APIs :
 *
 * 1. Hook historique (inchange, utilise par factures/[id] et parametres) :
 *      const confirm = useConfirm()
 *      const ok = await confirm({ title: 'Supprimer', message: 'Sur ?', danger: true })
 *
 * 2. Fonctions module (utilisables PARTOUT, y compris hors composant, memes
 *    contrats que les natifs mais asynchrones) :
 *      if (!(await appConfirm('Supprimer ce devoir ?'))) return
 *      await appAlert('Enregistre.')
 *      const motif = await appPrompt('Motif du refus :')   // null si Annuler
 *
 *    Elles s'appuient sur le ConfirmProvider monte une seule fois dans le
 *    layout racine (via AppProviders). Si le provider n'est pas monte
 *    (cas theoriquement impossible), repli sur le dialogue natif pour ne
 *    jamais bloquer une action.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode, CSSProperties } from 'react'

type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmApi = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmApi>(async () => false)

// ---------------------------------------------------------------------------
// API module : appAlert / appConfirm / appPrompt
// ---------------------------------------------------------------------------

type DialogKind = 'alert' | 'confirm' | 'prompt'
type DialogRequest = {
  kind: DialogKind
  message: string
  title?: string
  defaultValue?: string
  danger?: boolean
  resolve: (v: any) => void
}

let enqueueDialog: ((d: DialogRequest) => void) | null = null

function pousser(kind: DialogKind, message: string, extra?: Partial<DialogRequest>): Promise<any> {
  return new Promise(resolve => {
    if (!enqueueDialog) {
      // Provider absent : repli natif pour ne jamais bloquer l'utilisateur.
      if (kind === 'alert') { window.alert(message); resolve(undefined) }
      else if (kind === 'confirm') resolve(window.confirm(message))
      else resolve(window.prompt(message, extra?.defaultValue ?? ''))
      return
    }
    enqueueDialog({ kind, message, resolve, ...extra })
  })
}

/** Equivalent asynchrone de window.alert(message). */
export function appAlert(message: string, title?: string): Promise<void> {
  return pousser('alert', String(message ?? ''), { title })
}

/** Equivalent asynchrone de window.confirm(message) → boolean. */
export function appConfirm(message: string, opts?: { title?: string; danger?: boolean; confirmLabel?: string }): Promise<boolean> {
  const msg = String(message ?? '')
  // Bouton rouge automatique pour les actions destructrices evidentes.
  const danger = opts?.danger ?? /supprim|retirer|revoq|d[ée]sactiv|refus/i.test(msg)
  return pousser('confirm', msg, { title: opts?.title, danger })
}

/** Equivalent asynchrone de window.prompt(message, defaut) → string | null. */
export function appPrompt(message: string, defaultValue?: string, title?: string): Promise<string | null> {
  return pousser('prompt', String(message ?? ''), { defaultValue: defaultValue ?? '', title })
}

// ---------------------------------------------------------------------------
// Provider (monte via AppProviders dans le layout racine)
// ---------------------------------------------------------------------------

export function ConfirmProvider({ children }: { children: ReactNode }) {
  // Hook historique
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  // File des dialogs "API module" (un seul affiche a la fois)
  const [queue, setQueue] = useState<DialogRequest[]>([])
  const [promptValue, setPromptValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const ask = useCallback<ConfirmApi>((opts) => {
    return new Promise<boolean>(resolve => {
      setState({ ...opts, resolve })
    })
  }, [])

  useEffect(() => {
    enqueueDialog = (d: DialogRequest) => setQueue(q => [...q, d])
    return () => { enqueueDialog = null }
  }, [])

  const current = queue[0] || null

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setPromptValue(current.defaultValue ?? '')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [current])

  function close(result: boolean) {
    if (state) state.resolve(result)
    setState(null)
  }

  function closeCurrent(value: any) {
    if (!current) return
    current.resolve(value)
    setQueue(q => q.slice(1))
  }

  function validerCurrent() {
    if (!current) return
    if (current.kind === 'prompt') closeCurrent(promptValue)
    else if (current.kind === 'confirm') closeCurrent(true)
    else closeCurrent(undefined)
  }

  function annulerCurrent() {
    if (!current) return
    if (current.kind === 'prompt') closeCurrent(null)
    else if (current.kind === 'confirm') closeCurrent(false)
    else closeCurrent(undefined)
  }

  const overlayStyle: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9998,
    background: 'rgba(15,23,42,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
    animation: 'confirm-fade-in 0.15s ease-out',
  }
  const cardStyle: CSSProperties = {
    background: '#fff', borderRadius: 14,
    maxWidth: 440, width: '100%',
    boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
    animation: 'confirm-pop-in 0.2s ease-out',
  }
  const btnSecondaire: CSSProperties = {
    background: '#fff', border: '1px solid #CBD5E1',
    color: '#475569', fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
  }
  const btnPrimaire = (danger?: boolean): CSSProperties => ({
    background: danger ? '#DC2626' : '#2563EB',
    border: 'none', color: '#fff',
    fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
  })

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <div onClick={() => close(false)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={cardStyle}>
            <div style={{ padding: '22px 24px 8px' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1E293B' }}>{state.title}</div>
              {state.message && (
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{state.message}</div>
              )}
            </div>
            <div style={{ padding: '16px 24px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => close(false)} style={btnSecondaire}>{state.cancelLabel ?? 'Annuler'}</button>
              <button onClick={() => close(true)} style={btnPrimaire(state.danger)}>{state.confirmLabel ?? (state.danger ? 'Supprimer' : 'Confirmer')}</button>
            </div>
          </div>
          <style jsx global>{`
            @keyframes confirm-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes confirm-pop-in  { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          `}</style>
        </div>
      )}
      {!state && current && (
        <div onClick={current.kind === 'alert' ? () => closeCurrent(undefined) : annulerCurrent} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={cardStyle}>
            <div style={{ padding: '22px 24px 8px' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1E293B' }}>
                {current.title ?? (current.kind === 'alert' ? 'Information' : current.kind === 'prompt' ? 'Saisie' : 'Confirmation')}
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{current.message}</div>
              {current.kind === 'prompt' && (
                <input
                  ref={inputRef}
                  value={promptValue}
                  onChange={e => setPromptValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') validerCurrent(); if (e.key === 'Escape') annulerCurrent() }}
                  style={{
                    marginTop: 12, width: '100%', boxSizing: 'border-box',
                    border: '1px solid #CBD5E1', borderRadius: 8,
                    padding: '9px 12px', fontSize: 13, color: '#1E293B', outline: 'none',
                  }}
                />
              )}
            </div>
            <div style={{ padding: '16px 24px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {current.kind !== 'alert' && (
                <button onClick={annulerCurrent} style={btnSecondaire}>Annuler</button>
              )}
              <button onClick={validerCurrent} style={btnPrimaire(current.kind === 'confirm' && current.danger)}>
                {current.kind === 'alert' ? 'OK' : current.kind === 'prompt' ? 'Valider' : (current.danger ? 'Confirmer' : 'Confirmer')}
              </button>
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
