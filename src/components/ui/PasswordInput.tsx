'use client'
import { useState, CSSProperties } from 'react'

/**
 * Champ mot de passe avec bouton afficher/masquer (oeil).
 * - type bascule entre password et text
 * - bouton accessible (aria-label + title), type="button" pour ne pas soumettre le formulaire
 * - insetInlineEnd/paddingInlineEnd pour rester correct en hebreu (RTL)
 */

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = 'new-password',
  required,
  style,
  showLabel = 'Afficher le mot de passe',
  hideLabel = 'Masquer le mot de passe',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  style?: CSSProperties
  showLabel?: string
  hideLabel?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        required={required}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: 8,
          fontSize: 13, outline: 'none', boxSizing: 'border-box',
          ...style,
          paddingInlineEnd: 42,
        }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        style={{
          position: 'absolute', insetInlineEnd: 4, top: '50%', transform: 'translateY(-50%)',
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 8,
          display: 'flex', alignItems: 'center', color: '#64748B',
        }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

/**
 * Checklist des regles du mot de passe, cochee en direct pendant la saisie.
 * rules: liste de { label, ok }
 */
export function PasswordRules({ rules }: { rules: { label: string; ok: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      {rules.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, color: r.ok ? '#059669' : '#64748B' }}>
          <span style={{ width: 14, display: 'inline-block', textAlign: 'center', fontWeight: 700 }}>{r.ok ? '✓' : '•'}</span>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  )
}
