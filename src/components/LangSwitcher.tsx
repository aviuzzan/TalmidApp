'use client'
import { useState } from 'react'
import { useI18n, LANGS, Lang } from '@/lib/i18n'

/**
 * Sélecteur de langue compact (drapeau + dropdown).
 * À placer dans les headers (portail, sidebar admin).
 */
export default function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8,
          padding: compact ? '6px 10px' : '7px 12px', cursor: 'pointer',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: '#475569',
        }}
        aria-label="Changer de langue">
        <span style={{ fontSize: 15 }}>{current.flag}</span>
        {!compact && <span>{current.label}</span>}
        <span style={{ fontSize: 9, color: '#94A3B8' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 200,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
          boxShadow: '0 4px 12px rgba(15,23,42,0.1)', minWidth: 150, overflow: 'hidden',
        }}>
          {LANGS.map(l => (
            <button key={l.code}
              onClick={() => { setLang(l.code as Lang); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: l.code === lang ? '#EFF6FF' : 'transparent',
                color: l.code === lang ? '#1E40AF' : '#1E293B',
                fontSize: 13, fontWeight: l.code === lang ? 600 : 400,
              }}>
              <span style={{ fontSize: 15 }}>{l.flag}</span>
              <span>{l.label}</span>
              {l.code === lang && <span style={{ marginLeft: 'auto', color: '#1E40AF' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
