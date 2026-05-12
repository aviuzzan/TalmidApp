'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Facture = {
  id: string
  numero: string
  famille_id: string
  total_facture: number
  total_regle: number
  solde_restant: number
  date_emission: string
  date_echeance: string | null
  statut: string
  parent_prenom?: string
  parent_nom?: string
  parent_email?: string
  famille_nom?: string
}

type RelanceLog = { facture_id: string; niveau: number; envoyee_le: string }

export default function RelancesPage() {
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string>('')
  const [factures, setFactures] = useState<Facture[]>([])
  const [logs, setLogs] = useState<Record<string, RelanceLog[]>>({})
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const s = createClient()

    // Utilise factures_solde (vue) + jointure familles pour récupérer parent + filtrer école
    const { data: facts } = await s.from('factures_solde')
      .select('*, familles!inner(nom, parent1_prenom, parent1_nom, parent1_email, ecole_id)')
      .gt('solde_restant', 0)
      .neq('statut', 'annule')
      .eq('familles.ecole_id', ecole.id)
      .order('date_echeance', { ascending: true, nullsFirst: false })

    const factsList: Facture[] = (facts || []).map((f: any) => ({
      id: f.id, numero: f.numero, famille_id: f.famille_id,
      total_facture: Number(f.total_facture || 0),
      total_regle: Number(f.total_regle || 0),
      solde_restant: Number(f.solde_restant || 0),
      date_emission: f.date_emission,
      date_echeance: f.date_echeance,
      statut: f.statut,
      famille_nom: f.familles?.nom || '',
      parent_prenom: f.familles?.parent1_prenom || '',
      parent_nom: f.familles?.parent1_nom || '',
      parent_email: f.familles?.parent1_email || '',
    }))

    // Affiche TOUTES les factures avec solde > 0 non annulées.
    // Le retard est calculé et affiché en colonne (peut être négatif si pas encore due).
    setFactures(factsList)

    if (factsList.length > 0) {
      const { data: lgs } = await s.from('relances_log')
        .select('facture_id, niveau, envoyee_le, envoye_at')
        .in('facture_id', factsList.map(f => f.id))
      const map: Record<string, RelanceLog[]> = {}
      for (const l of (lgs || [])) {
        const niveau = typeof (l as any).niveau === 'number' ? (l as any).niveau : parseInt((l as any).niveau) || 1
        const envoye = (l as any).envoyee_le || (l as any).envoye_at || ''
        if (!map[l.facture_id]) map[l.facture_id] = []
        map[l.facture_id].push({ facture_id: l.facture_id, niveau, envoyee_le: envoye })
      }
      setLogs(map)
    } else setLogs({})
    setLoading(false)
  }, [ecole?.id])

  useEffect(() => { load() }, [load])

  function joursRetard(f: Facture): number {
    // Si date_echeance définie → diff. Sinon, diff avec date_emission (négatif si récent).
    const ref = f.date_echeance ? new Date(f.date_echeance) : new Date(f.date_emission)
    return Math.floor((new Date().getTime() - ref.getTime()) / (1000 * 60 * 60 * 24))
  }
  const nomNiveau = (n: number) => ['—', 'Rappel amical', 'Relance', 'Mise en demeure'][n] || '—'

  async function envoyerRelance(f: Facture, niveau: number) {
    if (!f.parent_email) { setMsg('❌ Aucun email parent'); return }
    if (!confirm(`Envoyer la relance N${niveau} (${nomNiveau(niveau)}) à ${f.parent_email} pour ${f.numero} ?`)) return
    setSending(f.id); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    try {
      const res = await fetch('/api/relances/envoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ factureId: f.id, niveau, ecoleId: ecole.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      setMsg(`✓ Relance N${niveau} envoyée à ${f.parent_email}`)
      await load()
    } catch (e: any) { setMsg('❌ ' + e.message) }
    setSending(''); setTimeout(() => setMsg(''), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  const total = factures.reduce((s, f) => s + f.solde_restant, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📩 Relances impayés</h1>
        <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
          Toutes les factures avec solde non réglé. Le retard est calculé à partir de la date d&apos;échéance (ou d&apos;émission si aucune échéance définie).
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 600, textTransform: 'uppercase' }}>Factures impayées</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>{factures.length}</div>
        </div>
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600, textTransform: 'uppercase' }}>Montant total dû</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#D97706', marginTop: 4 }}>{total.toFixed(2)} €</div>
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2',
          color: msg.startsWith('✓') ? '#065F46' : '#991B1B',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{msg}</div>
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
                  {['Facture','Famille','Solde','Retard','Relances envoyées','Action'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Solde' ? 'right' : h === 'Retard' || h === 'Relances envoyées' ? 'center' : h === 'Action' ? 'right' : 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factures.map(f => {
                  const jours = joursRetard(f)
                  const sentLogs = logs[f.id] || []
                  const maxSent = sentLogs.reduce((m, l) => Math.max(m, l.niveau), 0)
                  const next = Math.min(maxSent + 1, 3)
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#1E293B' }}>{f.numero}</td>
                      <td style={{ padding: '12px', color: '#475569' }}>
                        <div style={{ fontWeight: 600 }}>{f.famille_nom}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>
                          {f.parent_prenom} {f.parent_nom}
                          {f.parent_email && <span> · {f.parent_email}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{f.solde_restant.toFixed(2)} €</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {jours < 0 ? (
                          <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>Dans {Math.abs(jours)} j</span>
                        ) : (
                          <span style={{ background: jours >= 60 ? '#FEE2E2' : jours >= 30 ? '#FED7AA' : jours >= 7 ? '#FEF3C7' : '#F1F5F9', color: jours >= 60 ? '#991B1B' : jours >= 30 ? '#9A3412' : jours >= 7 ? '#92400E' : '#475569', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                            {jours === 0 ? "Aujourd'hui" : `+${jours} j`}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#475569', fontSize: 12 }}>
                        {sentLogs.length === 0 ? '—' : sentLogs.map(l => `N${l.niveau}`).join(', ')}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {next > maxSent && f.parent_email ? (
                          <button onClick={() => envoyerRelance(f, next)} disabled={sending === f.id}
                            style={{ background: next === 3 ? '#DC2626' : '#2563EB', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: sending === f.id ? 0.6 : 1 }}>
                            {sending === f.id ? '…' : `Envoyer N${next}`}
                          </button>
                        ) : <span style={{ color: '#94A3B8', fontSize: 11 }}>—</span>}
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
        💡 Niveaux : <strong>N1 Rappel amical</strong> → <strong>N2 Relance</strong> → <strong>N3 Mise en demeure</strong>. Configurez délais et templates dans Paramètres → Relances.
      </div>
    </div>
  )
}
