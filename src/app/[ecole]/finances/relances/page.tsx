'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Facture = {
  id: string
  numero: string
  famille_id: string
  total_ttc: number
  solde_du: number
  date_echeance: string
  statut: string
  parent_prenom?: string
  parent_nom?: string
  parent_email?: string
}

type RelanceLog = { facture_id: string; niveau: number; envoyee_le: string }

export default function RelancesPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string>('')
  const [factures, setFactures] = useState<Facture[]>([])
  const [logs, setLogs] = useState<Record<string, RelanceLog[]>>({})
  const [config, setConfig] = useState<any>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()

    const { data: cfg } = await s.from('relances_config').select('*').eq('ecole_id', ecole.id).maybeSingle()
    setConfig(cfg)

    const today = new Date().toISOString().slice(0, 10)
    const { data: facts } = await s.from('factures')
      .select('id, numero, famille_id, total_ttc, solde_du, date_echeance, statut')
      .eq('ecole_id', ecole.id)
      .gt('solde_du', 0)
      .lt('date_echeance', today)
      .order('date_echeance', { ascending: true })

    const factsList = (facts || []) as Facture[]
    // enrich avec parent
    for (const f of factsList) {
      const { data: parent } = await s.from('profiles')
        .select('prenom, nom, email')
        .eq('famille_id', f.famille_id)
        .eq('role', 'parent')
        .limit(1)
        .maybeSingle()
      if (parent) {
        f.parent_prenom = parent.prenom
        f.parent_nom = parent.nom
        f.parent_email = parent.email
      }
    }
    setFactures(factsList)

    const { data: lgs } = await s.from('relances_log')
      .select('facture_id, niveau, envoyee_le')
      .in('facture_id', factsList.map(f => f.id))
    const map: Record<string, RelanceLog[]> = {}
    for (const l of (lgs || [])) {
      if (!map[l.facture_id]) map[l.facture_id] = []
      map[l.facture_id].push(l)
    }
    setLogs(map)

    setLoading(false)
  }

  function joursRetard(echeance: string): number {
    const d1 = new Date(echeance)
    const d2 = new Date()
    return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
  }

  function niveauPropose(jours: number): number {
    if (!config) return 0
    if (jours >= (config.delai_demeure || 60)) return 3
    if (jours >= (config.delai_relance || 30)) return 2
    if (jours >= (config.delai_rappel || 15)) return 1
    return 0
  }

  function nomNiveau(n: number) {
    return ['—', 'Rappel amical', 'Relance', 'Mise en demeure'][n] || '—'
  }

  async function envoyerRelance(facture: Facture, niveau: number) {
    if (!confirm(`Envoyer la relance niveau ${niveau} (${nomNiveau(niveau)}) à ${facture.parent_email} pour la facture ${facture.numero} ?`)) return
    setSending(facture.id); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()

    try {
      const res = await fetch('/api/relances/envoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          factureId: facture.id,
          niveau,
          ecoleId: ecole.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      setMsg(`✓ Relance niveau ${niveau} envoyée à ${facture.parent_email}`)
      await load()
    } catch (e: any) {
      setMsg('❌ ' + e.message)
    }
    setSending('')
    setTimeout(() => setMsg(''), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  const total = factures.reduce((s, f) => s + Number(f.solde_du), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📩 Relances impayés</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
          Factures avec échéance dépassée et solde non réglé
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 600, textTransform: 'uppercase' }}>Factures en retard</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>{factures.length}</div>
        </div>
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600, textTransform: 'uppercase' }}>Montant total dû</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#D97706', marginTop: 4 }}>{total.toFixed(2)} €</div>
        </div>
      </div>

      {msg && (
        <div style={{
          background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2',
          color: msg.startsWith('✓') ? '#065F46' : '#991B1B',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        }}>{msg}</div>
      )}

      {factures.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          🎉 Aucune facture en retard ! Tous les comptes sont à jour.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Facture</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Famille</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Solde</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Retard</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Relances envoyées</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {factures.map(f => {
                  const jours = joursRetard(f.date_echeance)
                  const proposed = niveauPropose(jours)
                  const sentLogs = logs[f.id] || []
                  const maxSent = sentLogs.reduce((m, l) => Math.max(m, l.niveau), 0)
                  const next = Math.min(maxSent + 1, 3)
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#1E293B' }}>{f.numero}</td>
                      <td style={{ padding: '12px', color: '#475569' }}>
                        {f.parent_prenom} {f.parent_nom}
                        {f.parent_email && <div style={{ fontSize: 11, color: '#94A3B8' }}>{f.parent_email}</div>}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>{Number(f.solde_du).toFixed(2)} €</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          background: jours >= 60 ? '#FEE2E2' : jours >= 30 ? '#FED7AA' : '#FEF3C7',
                          color: jours >= 60 ? '#991B1B' : jours >= 30 ? '#9A3412' : '#92400E',
                          padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        }}>{jours} j</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                        {sentLogs.length === 0 ? '—' : sentLogs.map(l => `N${l.niveau}`).join(', ')}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {next > maxSent && f.parent_email ? (
                          <button onClick={() => envoyerRelance(f, next)} disabled={sending === f.id}
                            style={{
                              background: next === 3 ? '#DC2626' : '#2563EB', color: '#fff', border: 'none',
                              borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              opacity: sending === f.id ? 0.6 : 1,
                            }}>
                            {sending === f.id ? '...' : `Envoyer N${next}`}
                          </button>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, fontSize: 12, color: '#475569' }}>
        💡 Les relances automatiques sont configurées dans <strong>Paramètres → Relances impayés</strong>.
        Vous pouvez aussi envoyer manuellement une relance en cliquant sur le bouton de la ligne concernée.
      </div>
    </div>
  )
}
