'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('admin_logs')
      .select('*, ecoles(nom, slug)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data ?? []); setLoading(false) })
  }, [])

  const ACTION_LABEL: Record<string, string> = {
    ecole_creee: '🏫 École créée',
    ecole_modifiee: '✏️ École modifiée',
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', marginBottom: 8 }}>Journal d'activité</h1>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 24 }}>50 dernières actions</p>
      <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>Chargement...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Aucune activité</div>
        ) : logs.map((log, i) => (
          <div key={log.id} style={{ padding: '13px 20px', borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, color: '#E2E8F0', fontWeight: 500 }}>{ACTION_LABEL[log.action] || log.action}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{log.ecoles?.nom || '—'}</div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
              {new Date(log.created_at).toLocaleString('fr-FR')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
