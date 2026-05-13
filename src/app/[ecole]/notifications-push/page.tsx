'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Classe = { id: string; nom: string; ordre: number }
type Log = { id: string; titre: string; body: string; statut: string; created_at: string }

export default function NotificationsPushPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Classe[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [sending, setSending] = useState(false)
  const [cibleType, setCibleType] = useState<'classe' | 'tous'>('classe')
  const [cibleClasse, setCibleClasse] = useState<string>('')
  const [titre, setTitre] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/portail')
  const [msg, setMsg] = useState('')
  const [stats, setStats] = useState<{ abonnes: number } | null>(null)

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: ls }, { count }] = await Promise.all([
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('notifications_push_envoyees').select('id, titre, body, statut, created_at').eq('ecole_id', ecole.id).order('created_at', { ascending: false }).limit(20),
      s.from('web_push_subscriptions').select('id', { count: 'exact', head: true }),
    ])
    setClasses((cls ?? []) as Classe[])
    setLogs((ls ?? []) as Log[])
    setStats({ abonnes: count || 0 })
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function envoyer() {
    if (!titre.trim() || !body.trim()) { setMsg('Titre et message requis'); return }
    if (cibleType === 'classe' && !cibleClasse) { setMsg('Sélectionnez une classe'); return }
    if (!confirm(`Envoyer cette notification ?`)) return
    setSending(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setSending(false); return }

    const payload: any = { ecoleId: ecole.id, cibleType, titre, body, url }
    if (cibleType === 'classe') payload.cibleId = cibleClasse

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSending(false)
    if (!res.ok) { setMsg('Erreur : ' + (data.error || 'inconnue')); return }
    setMsg(`✓ ${data.envoyes}/${data.total} envoyée${data.envoyes > 1 ? 's' : ''}` + (data.echecs ? ` — ${data.echecs} échec${data.echecs > 1 ? 's' : ''}` : ''))
    setTitre(''); setBody('')
    setTimeout(() => setMsg(''), 6000)
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🔔 Notifications push</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Envoyez des alertes instantanées sur les appareils des familles — gratuit, illimité, sans installation
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '14px 18px', flex: '1 1 220px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{stats?.abonnes ?? 0}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Appareils abonnés (toutes écoles)</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Nouvelle notification</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { v: 'classe', l: '🏫 Une classe' },
            { v: 'tous', l: '👥 Toutes les familles' },
          ].map(o => (
            <button key={o.v} onClick={() => setCibleType(o.v as any)}
              style={{ background: cibleType === o.v ? '#2563EB' : '#F1F5F9', color: cibleType === o.v ? '#fff' : '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {o.l}
            </button>
          ))}
        </div>

        {cibleType === 'classe' && (
          <select value={cibleClasse} onChange={e => setCibleClasse(e.target.value)} style={inp}>
            <option value="">— Choisir une classe —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        )}

        <input type="text" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre (ex: École fermée demain)" style={inp} maxLength={80} />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Message (visible dans la notification)" style={{ ...inp, minHeight: 80, resize: 'vertical' }} maxLength={300} />
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="URL à ouvrir au clic (ex: /portail/messages)" style={inp} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={envoyer} disabled={sending} className="btn-primary">
            {sending ? 'Envoi...' : '📤 Envoyer la notification'}
          </button>
        </div>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>{msg}</div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>Historique (20 derniers envois)</div>
        {logs.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune notification envoyée</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Titre', 'Message', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{l.titre}</td>
                  <td style={{ padding: '11px 14px', color: '#475569', maxWidth: 320 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.body}</div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {l.statut === 'sent' ? (
                      <span style={{ background: '#ECFDF5', color: '#065F46', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>✓</span>
                    ) : l.statut === 'expired' ? (
                      <span style={{ background: '#FFFBEB', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Expiré</span>
                    ) : (
                      <span style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>✕</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
