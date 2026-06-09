'use client'
/**
 * Page Logs d'audit — lecture seule du contenu de admin_logs.
 * Filtres : action, période. Réservée admin principal (RLS gère).
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Log = {
  id: string
  admin_id: string | null
  ecole_id: string | null
  action: string
  details: any
  created_at: string
  admin_email?: string | null
}

export default function LogsAuditPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('')
  const [filterPeriode, setFilterPeriode] = useState<'7j' | '30j' | '90j' | 'tous'>('30j')
  const [emailsMap, setEmailsMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!ecole?.id) return
    ;(async () => {
      setLoading(true)
      const s = createClient()
      let q = s.from('admin_logs').select('*').eq('ecole_id', ecole.id).order('created_at', { ascending: false }).limit(500)
      if (filterPeriode !== 'tous') {
        const jours = filterPeriode === '7j' ? 7 : filterPeriode === '30j' ? 30 : 90
        const since = new Date(Date.now() - jours * 86400 * 1000).toISOString()
        q = q.gte('created_at', since)
      }
      if (filterAction.trim()) {
        q = q.ilike('action', `%${filterAction.trim()}%`)
      }
      const { data } = await q
      const list = (data ?? []) as Log[]
      setLogs(list)

      // Charger les emails des admin_id distincts
      const adminIds = Array.from(new Set(list.map(l => l.admin_id).filter(Boolean) as string[]))
      if (adminIds.length > 0) {
        const { data: profs } = await s.from('profiles').select('id, email').in('id', adminIds)
        const map = new Map<string, string>()
        ;((profs ?? []) as any[]).forEach(p => map.set(p.id, p.email))
        setEmailsMap(map)
      }
      setLoading(false)
    })()
  }, [ecole?.id, filterAction, filterPeriode])

  function summarize(details: any): string {
    if (!details) return ''
    if (typeof details === 'string') return details
    try {
      const keys = Object.keys(details).slice(0, 4)
      return keys.map(k => `${k}=${JSON.stringify(details[k]).slice(0, 50)}`).join(' · ')
    } catch { return JSON.stringify(details).slice(0, 120) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <button onClick={() => router.push(`/${ecole.slug}/parametres`)}
          style={{ background: 'transparent', border: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer', marginBottom: 6 }}>← Paramètres</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📋 Journal d'audit</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Trace des actions effectuées par les administrateurs (utile pour la sécurité et la conformité RGPD).
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={filterAction} onChange={e => setFilterAction(e.target.value)}
          placeholder="Filtrer par action (ex: contrat_valide)"
          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', minWidth: 240, flex: 1 }} />
        <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 9, padding: 3 }}>
          {(['7j', '30j', '90j', 'tous'] as const).map(p => (
            <button key={p} onClick={() => setFilterPeriode(p)}
              style={{ background: filterPeriode === p ? '#fff' : 'transparent', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: filterPeriode === p ? 700 : 500, color: filterPeriode === p ? '#1E293B' : '#64748B', cursor: 'pointer', boxShadow: filterPeriode === p ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>{p === 'tous' ? 'Tous' : p}</button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Aucune action enregistrée pour la période sélectionnée.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Administrateur', 'Action', 'Détails'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <td style={{ padding: '10px 14px', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>
                    {new Date(l.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#1E293B' }}>
                    {l.admin_id ? (emailsMap.get(l.admin_id) || l.admin_id.slice(0, 8)) : <span style={{ color: '#94A3B8' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: '#EEF2FF', color: '#4338CA', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, fontFamily: 'monospace' }}>{l.action}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748B', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify(l.details)}>
                    {summarize(l.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
        Affichage limité à 500 lignes les plus récentes.
      </div>
    </div>
  )
}
