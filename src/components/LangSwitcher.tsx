'use client'
import { useI18n, Lang } from '@/lib/i18n'

/**
 * Toggle de langue binaire FR / HE.
 * Le drapeau actif est mis en avant. Clic = bascule l'autre langue.
 * Sur petit ecran le label disparait, on garde juste les drapeaux.
 */
export default function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n()

  const baseBtn: React.CSSProperties = {
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: compact ? 14 : 16, padding: compact ? '4px 8px' : '5px 10px',
    borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'background 0.15s, color 0.15s',
  }
  const activeBtn: React.CSSProperties = {
    ...baseBtn,
    background: '#fff',
    color: '#1E40AF',
    fontWeight: 700,
    boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
  }
  const idleBtn: React.CSSProperties = {
    ...baseBtn,
    color: '#64748B',
    fontWeight: 500,
  }

  return (
    <div role="group" aria-label="Langue"
      style={{
        display: 'inline-flex', alignItems: 'center',
        background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8,
        padding: 3,
      }}>
      <button onClick={() => setLang('fr' as Lang)} aria-pressed={lang === 'fr'}
        title="Français"
        style={lang === 'fr' ? activeBtn : idleBtn}>
        <span aria-hidden>🇫🇷</span>
        {!compact && <span style={{ fontSize: 12 }}>FR</span>}
      </button>
      <button onClick={() => setLang('he' as Lang)} aria-pressed={lang === 'he'}
        title="עברית"
        style={lang === 'he' ? activeBtn : idleBtn}>
        <span aria-hidden>🇮🇱</span>
        {!compact && <span style={{ fontSize: 12 }}>HE</span>}
      </button>
    </div>
  )
}
