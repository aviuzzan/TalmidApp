'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Log = {
  id: string
  admin_id: string | null
  ecole_id: string | null
  action: string
  details: any
  created_at: string
  ecoles?: { nom: string; slug: string } | null
  profile_email?: string | null
}

const ACTION_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ecole_creee:        { label: 'École créée',      icon: '🏫', color: '#059669', bg: 'rgba(16,185,129,0.12)' },
  ecole_modifiee:     { label: 'École modifiée',   icon: '✏️', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
  ecole_supprimee:    { label: 'École supprimée',  icon: '🗑️', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  compte_cree:        { label: 'Compte créé',      icon: '👤', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  compte_supprime:    { label: 'Compte supprimé',  icon: '🗑️', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  permissions_modifiees: { label: 'Permissions modifiées', icon: '🔐', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
}

function formatDate(d: string) {
  const date = new Date(d)
  return date.toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, icon: '•', color: '#64748B', bg: 'rgba(100,116,139,0.12)' }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filtreAction, setFiltreAction] = useState<string>('')
  const [filtreEcole, setFiltreEcole] = useState<string>('')

  useEffect(() => {
    async function load() {
      const s = createClient()
      const { data } = await s.from('admin_logs')
        .select('*, ecoles(nom, slug)')
        .order('created_at', { ascending: false })
        .limit(200)
      setLogs((data as any[] | null) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const ecoles = useMemo(() => {
    const map = new Map<string, string>()
    logs.forEach(l => { if (l.ecole_id && l.ecoles?.nom) map.set(l.ecole_id, l.ecoles.nom) })
    return Array.from(map.entries())
  }, [logs])

  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action))), [logs])

  const filtered = logs.filter(l =>
    (!filtreAction || l.action === filtreAction) &&
    (!filtreEcole || l.ecole_id === filtreEcole),
  )

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', marginBottom: 6 }}>Journal d'activité</h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 20 }}>
        {filtered.length} entrée{filtered.length > 1 ? 's' : ''} {filtered.length !== logs.length && `(sur ${logs.length})`} — 200 dernières
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={filtreAction} onChange={e => setFiltreAction(e.target.value)}
          style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
          <option value="">Toutes les actions</option>
          {actions.map(a => <option key={a} value={a}>{actionMeta(a).label}</option>)}
        </select>
        <select value={filtreEcole} onChange={e => setFiltreEcole(e.target.value)}
          style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.1)', color: '#E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
          <option value="">Toutes les écoles</option>
          {ecoles.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
        </select>
        {(filtreAction || filtreEcole) && (
          <button onClick={() => { setFiltreAction(''); setFiltreEcole('') }}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Aucune activité correspondante</div>
        ) : filtered.map((log, i) => {
          const meta = actionMeta(log.action)
          return (
            <div key={log.id} style={{
              padding: '14px 20px',
              borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: meta.bg, color: meta.color,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#E2E8F0', fontWeight: 500 }}>{meta.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {log.ecoles?.nom && <span>🏫 {log.ecoles.nom}</span>}
                  {log.details && Object.keys(log.details).length > 0 && (
                    <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>
                      {Object.entries(log.details).slice(0, 2).map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 30)}`).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                {formatDate(log.created_at)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
