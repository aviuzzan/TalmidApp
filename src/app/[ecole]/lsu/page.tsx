'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'

type Classe = { id: string; nom: string; ordre: number }
type Export = { id: string; classe_id: string; periode: number; nb_eleves: number; statut: string; created_at: string }

export default function LsuPage() {
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Classe[]>([])
  const [historique, setHistorique] = useState<Export[]>([])
  const [classeId, setClasseId] = useState('')
  const [periode, setPeriode] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: cls }, { data: exps }] = await Promise.all([
      s.from('classes').select('id, nom, ordre').eq('ecole_id', ecole.id).order('ordre'),
      s.from('lsu_exports').select('id, classe_id, periode, nb_eleves, statut, created_at').eq('ecole_id', ecole.id).order('created_at', { ascending: false }).limit(20),
    ])
    setClasses((cls ?? []) as Classe[])
    setHistorique((exps ?? []) as Export[])
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  async function generer() {
    if (!classeId) { setMsg('Sélectionnez une classe'); return }
    setGenerating(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setGenerating(false); return }

    const { data: ex } = await s.from('exercices').select('id').eq('ecole_id', ecole.id).eq('code', annee).maybeSingle()
    if (!ex?.id) { setMsg('Exercice introuvable'); setGenerating(false); return }

    const res = await fetch('/api/admin/lsu-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ecoleId: ecole.id, exerciceId: ex.id, classeId, periode }),
    })
    const data = await res.json()
    setGenerating(false)
    if (!res.ok) { setMsg('Erreur : ' + (data.error || 'inconnue')); return }

    // Téléchargement immédiat
    const blob = new Blob([data.xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = data.filename || `LSU_export.xml`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setMsg(`✓ ${data.nbEleves} élève${data.nbEleves > 1 ? 's' : ''} exporté${data.nbEleves > 1 ? 's' : ''} — fichier téléchargé`)
    setTimeout(() => setMsg(''), 6000)
    await load()
  }

  async function retelecharger(exportId: string) {
    const s = createClient()
    const { data } = await s.from('lsu_exports').select('xml_content, periode, classe_id').eq('id', exportId).single()
    if (!data?.xml_content) return
    const classe = classes.find(c => c.id === data.classe_id)
    const blob = new Blob([data.xml_content], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `LSU_${classe?.nom?.replace(/\s+/g, '_') || 'classe'}_P${data.periode}.xml`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📑 LSU — Livret Scolaire Unique</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Export XML conforme BOEN à partir des bulletins. Pour les écoles sous contrat (CP-CM2, 6e-3e). Obligatoire depuis 2016.
        </p>
      </div>

      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E' }}>
        ℹ️ Pour transmettre officiellement le LSU, l&apos;école doit le déposer dans ONDE (primaire) ou SIECLE (collège). Cette page génère le XML local que vous pouvez importer manuellement ou archiver.
        Le code UAI/RNE de l&apos;école doit être renseigné dans Paramètres → École.
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Nouveau export</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <select value={classeId} onChange={e => setClasseId(e.target.value)} style={inp}>
            <option value="">— Classe —</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <select value={periode} onChange={e => setPeriode(Number(e.target.value))} style={inp}>
            <option value={1}>1er trimestre</option>
            <option value={2}>2e trimestre</option>
            <option value={3}>3e trimestre</option>
          </select>
        </div>
        <button onClick={generer} disabled={generating || !classeId} className="btn-primary" style={{ alignSelf: 'flex-end' }}>
          {generating ? 'Génération...' : '📥 Générer & télécharger XML LSU'}
        </button>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>{msg}</div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>Historique des exports</div>
        {historique.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Aucun export pour l&apos;instant</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Date', 'Classe', 'Période', 'Élèves', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historique.map((e, i) => {
                const cl = classes.find(c => c.id === e.classe_id)
                return (
                  <tr key={e.id} style={{ borderBottom: i < historique.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '11px 14px', color: '#64748B', fontSize: 12 }}>{new Date(e.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{cl?.nom || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>T{e.periode}</td>
                    <td style={{ padding: '11px 14px' }}>{e.nb_eleves}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <button onClick={() => retelecharger(e.id)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}>
                        ⬇ Re-télécharger
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
