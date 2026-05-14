'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

type Cheque = {
  id: string
  numero_cheque: string
  montant: number
  date_echeance: string | null
  statut: string
  facture_id: string | null
  mode_paiement: string | null
  note: string | null
  famille_id: string
  familles: { nom: string; numero: string; parent1_nom: string | null; parent1_prenom: string | null } | null
}

const PRINT_CSS = `
@page { size: A4 portrait; margin: 1.5cm; }
@media print {
  body { background: #fff !important; }
  .no-print { display: none !important; }
  .print-card { box-shadow: none !important; border: 1px solid #000 !important; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
}
`

export default function BordereauPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'prevu' | 'tous'>('prevu')
  const [loading, setLoading] = useState(true)
  const [banque, setBanque] = useState('')
  const [ribDestinataire, setRibDestinataire] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, filter, dateFrom, dateTo])

  async function load() {
    setLoading(true)
    const s = createClient()
    let q = s.from('cheques_prevus')
      .select('*, familles(nom, numero, parent1_nom, parent1_prenom)')
      .eq('ecole_id', ecole.id)
      .order('date_echeance', { ascending: true })
    if (filter === 'prevu') q = q.eq('statut', 'prevu')
    if (dateFrom) q = q.gte('date_echeance', dateFrom)
    if (dateTo) q = q.lte('date_echeance', dateTo)
    const { data } = await q
    setCheques((data as any) || [])
    setLoading(false)
  }

  function toggle(id: string) {
    const newS = new Set(selected)
    if (newS.has(id)) newS.delete(id); else newS.add(id)
    setSelected(newS)
  }
  function toggleAll() {
    if (selected.size === cheques.length) setSelected(new Set())
    else setSelected(new Set(cheques.map(c => c.id)))
  }

  const selectedCheques = cheques.filter(c => selected.has(c.id))
  const total = selectedCheques.reduce((s, c) => s + Number(c.montant), 0)
  const fmt = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  async function marquerDepose() {
    if (selectedCheques.length === 0) return
    if (!confirm(`Marquer ${selectedCheques.length} chèque(s) comme déposé(s) ? (statut → encaisse)`)) return
    const today = new Date().toISOString().split('T')[0]
    await createClient()
      .from('cheques_prevus')
      .update({ statut: 'encaisse', encaisse_le: today })
      .in('id', selectedCheques.map(c => c.id))
    setSelected(new Set())
    await load()
  }

  function printNow() {
    window.print()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* CONTROLS - hidden when printing */}
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/${ecole.slug}/finances`)}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#475569' }}>← Retour</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0, flex: 1 }}>Bordereau de remise de chèques</h1>
          <button onClick={printNow}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🖨 Imprimer
          </button>
          {selectedCheques.length > 0 && (
            <button onClick={marquerDepose}
              style={{ background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              ✓ Marquer déposé(s)
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Filtre</label>
            <select value={filter} onChange={e => setFilter(e.target.value as any)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff' }}>
              <option value="prevu">À déposer (prévus)</option>
              <option value="tous">Tous</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Échéance du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Échéance au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Banque de dépôt</label>
            <input value={banque} onChange={e => setBanque(e.target.value)} placeholder="Ex: Crédit Agricole — Agence Paris 19e"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>N° compte / RIB école</label>
            <input value={ribDestinataire} onChange={e => setRibDestinataire(e.target.value)} placeholder="FR76 ... (optionnel)"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#64748B' }}>
          ✅ <strong>{selected.size}</strong> chèque(s) sélectionné(s) sur {cheques.length} · Total : <strong style={{ color: '#1E293B' }}>{fmt(total)}</strong>
          <button onClick={toggleAll} style={{ marginLeft: 12, background: 'transparent', color: '#2563EB', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
            {selected.size === cheques.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>
      </div>

      {/* SELECTION TABLE - hidden when printing if there's a print preview */}
      <div className="no-print" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
        {cheques.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Aucun chèque {filter === 'prevu' ? 'prévu à déposer' : 'enregistré'}.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F8FAFC' }}>
              <tr>
                <th style={{ padding: '10px 12px', width: 40 }}>
                  <input type="checkbox" checked={selected.size === cheques.length && cheques.length > 0} onChange={toggleAll} />
                </th>
                {['N° chèque', 'Émetteur (Famille)', 'Montant', 'Échéance', 'Statut', 'Note'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cheques.map(c => {
                const tireur = c.familles?.parent1_nom
                  ? `${c.familles.parent1_prenom || ''} ${c.familles.parent1_nom}`.trim()
                  : (c.familles?.nom ? `Famille ${c.familles.nom}` : '—')
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid #F1F5F9', cursor: 'pointer' }}
                      onClick={() => toggle(c.id)}>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{c.numero_cheque}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13 }}>
                      <div>{tireur}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>{c.familles?.numero || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>{fmt(c.montant)}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>{c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.statut === 'prevu' ? '#475569' : '#065F46', background: c.statut === 'prevu' ? '#F1F5F9' : '#ECFDF5', padding: '3px 8px', borderRadius: 10, textTransform: 'uppercase' }}>
                        {c.statut}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748B', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.note || ''}>{c.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* PRINTABLE BORDEREAU */}
      <div className="print-card" style={{ background: '#fff', border: '2px solid #1E293B', borderRadius: 12, padding: 30, fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '2px solid #1E293B', paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: 0, letterSpacing: '-0.02em' }}>{ecole.nom}</h2>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Bordereau de remise de chèques</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#475569' }}>
            <div><strong>N° bordereau :</strong> {new Date().toISOString().slice(0, 10).replace(/-/g, '')}-{String(selectedCheques.length).padStart(3, '0')}</div>
            <div><strong>Date :</strong> {new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Remis à</div>
            <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{banque || '________________________'}</div>
            {ribDestinataire && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontFamily: 'monospace' }}>{ribDestinataire}</div>}
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Récap</div>
            <div style={{ fontSize: 13, color: '#1E293B' }}>
              <strong>{selectedCheques.length}</strong> chèque(s) — <strong>{fmt(total)}</strong>
            </div>
          </div>
        </div>

        {selectedCheques.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: 40 }}>
            Sélectionnez les chèques ci-dessus pour les inclure dans ce bordereau.
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1E293B', background: '#F1F5F9' }}>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>N° chèque</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Émetteur</th>
                  <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Famille</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {selectedCheques.map((c, i) => {
                  const tireur = c.familles?.parent1_nom
                    ? `${c.familles.parent1_prenom || ''} ${c.familles.parent1_nom}`.trim()
                    : '—'
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #E2E8F0', background: i % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                      <td style={{ padding: '7px 6px', fontFamily: 'monospace', fontWeight: 600 }}>{c.numero_cheque}</td>
                      <td style={{ padding: '7px 6px' }}>{tireur}</td>
                      <td style={{ padding: '7px 6px', color: '#64748B' }}>{c.familles?.nom || '—'} <span style={{ fontFamily: 'monospace', fontSize: 10 }}>({c.familles?.numero || '—'})</span></td>
                      <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700 }}>{fmt(c.montant)}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid #1E293B', background: '#1E293B' }}>
                  <td colSpan={3} style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#fff', fontSize: 13 }}>
                    TOTAL ({selectedCheques.length} chèque{selectedCheques.length > 1 ? 's' : ''})
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#fff', fontSize: 14 }}>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Cachet & signature école</div>
                <div style={{ height: 90, border: '1px dashed #94A3B8', borderRadius: 8 }}></div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Visa banque</div>
                <div style={{ height: 90, border: '1px dashed #94A3B8', borderRadius: 8 }}></div>
              </div>
            </div>

            <div style={{ marginTop: 20, fontSize: 10, color: '#94A3B8', textAlign: 'center', borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
              Document généré par TalmidApp le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
            </div>
          </>
        )}
      </div>
    </>
  )
}
