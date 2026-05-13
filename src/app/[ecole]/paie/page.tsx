'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Prof = { id: string; prenom: string; nom: string; nir: string | null; salaire_brut_mensuel: number | null }
type Bulletin = {
  id: string; professeur_id: string; mois: string; prenom: string; nom: string;
  salaire_brut: number; salaire_net: number; valide: boolean; dsn_exported: boolean;
}

export default function PaiePage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [profs, setProfs] = useState<Prof[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [moisFiltre, setMoisFiltre] = useState<string>(new Date().toISOString().slice(0, 7))
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()
    const [{ data: p }, { data: b }] = await Promise.all([
      s.from('professeurs').select('id, prenom, nom, nir, salaire_brut_mensuel').eq('ecole_id', ecole.id).order('nom'),
      s.from('bulletins_paie').select('id, professeur_id, mois, prenom, nom, salaire_brut, salaire_net, valide, dsn_exported')
        .eq('ecole_id', ecole.id).eq('mois', moisFiltre + '-01').order('nom'),
    ])
    setProfs((p ?? []) as Prof[])
    setBulletins((b ?? []) as Bulletin[])
    setLoading(false)
  }, [ecole?.id, moisFiltre])

  useEffect(() => { load() }, [load])

  async function genererBulletinsAutoMois() {
    if (!confirm(`Générer les bulletins de paie pour ${moisFiltre} ? (${profs.length} professeurs)`)) return
    setGenerating(true); setMsg('')
    const s = createClient()

    let created = 0
    for (const p of profs) {
      if (!p.salaire_brut_mensuel) continue
      // Existe déjà ?
      const existing = bulletins.find(b => b.professeur_id === p.id)
      if (existing) continue
      const brut = Number(p.salaire_brut_mensuel)
      const cotSal = Number((brut * 0.22).toFixed(2))
      const cotPat = Number((brut * 0.42).toFixed(2))
      const csg = Number((brut * 0.0975).toFixed(2))
      const net = Number((brut - cotSal).toFixed(2))
      await s.from('bulletins_paie').insert({
        ecole_id: ecole.id,
        professeur_id: p.id,
        mois: moisFiltre + '-01',
        prenom: p.prenom, nom: p.nom, nir: p.nir,
        salaire_brut: brut,
        cotisations_salariales: cotSal,
        cotisations_patronales: cotPat,
        csg_crds: csg,
        salaire_net: net,
        net_imposable: Number((net + csg * 0.5).toFixed(2)),
        valide: false,
      })
      created++
    }
    setGenerating(false)
    setMsg(`✓ ${created} bulletin${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''}`)
    setTimeout(() => setMsg(''), 5000)
    await load()
  }

  async function genererDsn() {
    setGenerating(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setGenerating(false); return }
    const res = await fetch('/api/admin/dsn-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ecoleId: ecole.id, mois: moisFiltre }),
    })
    const data = await res.json()
    setGenerating(false)
    if (!res.ok) { setMsg('Erreur : ' + (data.error || 'inconnue')); return }

    const blob = new Blob([data.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = data.filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setMsg(`✓ DSN ${moisFiltre} générée (${data.nbSalaries} salariés)`)
    setTimeout(() => setMsg(''), 6000)
    await load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  const inp: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none' }
  const totalBrut = bulletins.reduce((s, b) => s + Number(b.salaire_brut || 0), 0)
  const totalNet = bulletins.reduce((s, b) => s + Number(b.salaire_net || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>💵 Paie enseignants</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Bulletins de paie + déclaration DSN mensuelle
        </p>
      </div>

      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#991B1B' }}>
        ⚠️ <strong>Mode pré-production.</strong> Les calculs de cotisations sont des approximations (~22% sal / ~42% pat / 9.75% CSG-CRDS). Pour la production, validez les bulletins avec votre expert-comptable AVANT transmission DSN. La DSN générée respecte la structure NEODES P22V01 mais peut nécessiter des rubriques additionnelles selon votre convention collective.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#F8FAFC', padding: 12, borderRadius: 10, border: '1px solid #E2E8F0' }}>
        <input type="month" value={moisFiltre} onChange={e => setMoisFiltre(e.target.value)} style={inp} />
        <button onClick={genererBulletinsAutoMois} disabled={generating || profs.length === 0} className="btn-primary">
          {generating ? '...' : '⚙ Générer bulletins du mois'}
        </button>
        <button onClick={genererDsn} disabled={generating || bulletins.length === 0}
          style={{ background: '#fff', color: '#1E40AF', border: '1px solid #1E40AF', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {generating ? '...' : '📥 Générer & télécharger DSN'}
        </button>
      </div>

      {msg && <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1E40AF' }}>{bulletins.length}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Bulletins du mois</div>
        </div>
        <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#92400E' }}>{totalBrut.toLocaleString('fr-FR')} €</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Total brut</div>
        </div>
        <div style={{ background: '#ECFDF5', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#065F46' }}>{totalNet.toLocaleString('fr-FR')} €</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Total net</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, fontSize: 14 }}>Bulletins de paie — {moisFiltre}</div>
        {bulletins.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucun bulletin. Renseignez les salaires bruts dans Pédagogie → Professeurs puis cliquez sur &quot;Générer bulletins du mois&quot;.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Professeur', 'Brut', 'Net', 'Validé', 'DSN'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bulletins.map((b, i) => (
                <tr key={b.id} style={{ borderBottom: i < bulletins.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{b.prenom} {b.nom}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{Number(b.salaire_brut).toLocaleString('fr-FR')} €</td>
                  <td style={{ padding: '11px 14px', fontWeight: 700, color: '#065F46' }}>{Number(b.salaire_net).toLocaleString('fr-FR')} €</td>
                  <td style={{ padding: '11px 14px' }}>{b.valide ? '✓' : '—'}</td>
                  <td style={{ padding: '11px 14px' }}>{b.dsn_exported ? '✓ Transmis' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
