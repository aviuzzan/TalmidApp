'use client'

/**
 * Barre de progression réutilisable pour tâches longues
 * (import CSV, invitation groupée, export massif, génération factures en lot…).
 *
 * Props :
 *   - current : nombre traité
 *   - total : nombre total
 *   - label : texte avant (ex: "Invitation en cours")
 *   - sublabel : ligne de détails (ex: "12 sur 134 — 5 échecs")
 *   - errors : nombre d'échecs (optionnel, affiché à droite)
 *   - color : couleur principale (défaut: bleu TalmidApp)
 *   - compact : version compacte (sans label en haut)
 */
export default function ProgressBar({
  current,
  total,
  label,
  sublabel,
  errors,
  color = '#2563EB',
  compact = false,
}: {
  current: number
  total: number
  label?: string
  sublabel?: string
  errors?: number
  color?: string
  compact?: boolean
}) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  const done = current >= total && total > 0

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderRadius: 12,
      padding: compact ? '10px 14px' : '14px 18px',
      display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10,
    }}>
      {!compact && label && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
            {done ? '✓ ' : ''}{label}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: done ? '#10B981' : color }}>
            {pct}%
          </div>
        </div>
      )}

      <div style={{
        position: 'relative',
        height: compact ? 6 : 8,
        background: '#F1F5F9',
        borderRadius: 999,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          width: `${pct}%`,
          background: done ? '#10B981' : color,
          borderRadius: 999,
          transition: 'width 0.3s ease-out',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748B' }}>
        <span>{sublabel || `${current} sur ${total}`}</span>
        {errors !== undefined && errors > 0 && (
          <span style={{ color: '#DC2626', fontWeight: 600 }}>⚠ {errors} échec(s)</span>
        )}
      </div>
    </div>
  )
}
