'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Classe = { id: string; nom: string; ordre: number }
type Log = { id: string; provider: string; direction: string; nb_eleves_traites: number; nb_succes: number; nb_echecs: number; created_at: string }

const PROVIDERS = [
  { key: 'onde',       label: 'ONDE',       icon: '🏫', desc: 'Primaire (maternelle + élémentaire) — Export CSV à importer dans ONDE' },
  { key: 'siecle',     label: 'SIECLE',     icon: '🏛️', desc: 'Collège / Lycée — Export XML BEE conforme académie' },
  { key: 'parcoursup', label: 'Parcoursup', icon: '🎓', desc: 'Terminales — Export notes et moyennes pour LDA' },
]

export default function ConnecteursEnPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Classe[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [provider, setProvider] = useState<'onde' | 'siecle' | 'parcoursup'>('onde')
  const [classeId, setClasseId] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: ls }] = await Promise.all([
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('sync_education_nationale').select('id, provider, direction, nb_eleves_traites, nb_succes, nb_echecs, created_at').eq('ecole_id', ecole.id).order('created_at', { ascending: false }).limit(20),
    ])
    setClasses((cls ?? []) as Classe[])
    setLogs((ls ?? []) as Log[])
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function exporter() {
    setExporting(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setExporting(false); return }

    const res = await fetch('/api/admin/sync-en', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ecoleId: ecole.id, provider, direction: 'export', classeId: classeId || undefined }),
    })
    const data = await res.json()
    setExporting(false)
    if (!res.ok) { setMsg('Erreur : ' + (data.error || 'inconnue')); return }

    const blob = new Blob([data.content], { type: data.mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = data.filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setMsg(`✓ ${data.nbEleves} élève${data.nbEleves > 1 ? 's' : ''} exporté${data.nbEleves > 1 ? 's' : ''} — fichier téléchargé`)
    setTimeout(() => setMsg(''), 6000)
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }
  const current = PROVIDERS.find(p => p.key === provider)!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏛️ Connecteurs Éducation Nationale</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Génération de fichiers conformes pour transmission ONDE / SIECLE / Parcoursup. Import à venir.
        </p>
      </div>

      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
        ℹ️ Le code UAI/RNE de l&apos;école doit être renseigné. Les exports générés sont à uploader manuellement dans le portail académique (pas d&apos;API publique pour l&apos;échange).
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PROVIDERS.map(p => (
          <button key={p.key} onClick={() => setProvider(p.key as any)}
            style={{
              background: provider === p.key ? '#1E40AF' : '#F1F5F9',
              color: provider === p.key ? '#fff' : '#475569',
              border: 'none', borderRadius: 10, padding: '10px 16px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{current.icon} {current.label}</h2>
          <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>{current.desc}</p>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Filtre par classe (optionnel)</label>
          <select value={classeId} onChange={e => setClasseId(e.target.value)} style={{ ...inp, width: '100%' }}>
            <option value="">— Toutes les classes —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={exporter} disabled={exporting} className="btn-primary">
            {exporting ? 'Génération...' : `📥 Générer & télécharger l'export ${current.label}`}
          </button>
        </div>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>{msg}</div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>Historique des synchronisations</div>
        {logs.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucune synchro pour l&apos;instant</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Provider', 'Direction', 'Élèves', 'Succès', 'Échecs'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} style={{ borderBottom: i < logs.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{new Date(l.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{l.provider.toUpperCase()}</td>
                  <td style={{ padding: '11px 14px' }}>{l.direction === 'export' ? '⬆ Export' : '⬇ Import'}</td>
                  <td style={{ padding: '11px 14px' }}>{l.nb_eleves_traites}</td>
                  <td style={{ padding: '11px 14px', color: '#059669', fontWeight: 600 }}>{l.nb_succes}</td>
                  <td style={{ padding: '11px 14px', color: l.nb_echecs > 0 ? '#DC2626' : '#94A3B8', fontWeight: 600 }}>{l.nb_echecs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
