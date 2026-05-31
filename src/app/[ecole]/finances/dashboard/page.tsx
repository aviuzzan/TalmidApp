'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'
import { labelStatutFacture } from '@/lib/statuts'

type Kpi = {
  ca_facture: number
  ca_encaisse: number
  solde_restant: number
  nb_factures: number
  nb_factures_payees: number
  nb_factures_partiel: number
  nb_factures_attente: number
  nb_familles_a_jour: number
  nb_familles_en_retard: number
  top_debiteurs: Array<{ famille_id: string; nom: string; solde: number; numero: string }>
  encaissements_par_mois: Array<{ mois: string; total: number }>
  factures_recentes: Array<{ id: string; numero: string; famille_nom: string; date_emission: string; total: number; solde: number; statut: string }>
}

export default function FinancesDashboardPage() {
  const router = useRouter()
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const { exercices, exerciceSelectionne, selectExercice } = useExercice()
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<Kpi | null>(null)

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, annee])

  async function load() {
    setLoading(true)
    const s = createClient()

    // Factures + lignes + règlements pour l'exercice
    const { data: factures } = await s
      .from('factures_solde')
      .select('*, familles(id, nom, numero)')
      .eq('annee_scolaire', annee)

    const f = factures || []
    const ca_facture = f.reduce((sum, x: any) => sum + Number(x.total_facture || 0), 0)
    const ca_encaisse = f.reduce((sum, x: any) => sum + Number(x.total_regle || 0), 0)
    const solde_restant = f.reduce((sum, x: any) => sum + Number(x.solde_restant || 0), 0)

    const nb_factures = f.length
    const nb_factures_payees = f.filter((x: any) => x.statut === 'paye').length
    const nb_factures_partiel = f.filter((x: any) => x.statut === 'partiel').length
    const nb_factures_attente = f.filter((x: any) => Number(x.solde_restant || 0) > 0 && x.statut !== 'annule').length

    // Top débiteurs
    const dette_par_famille: Record<string, { nom: string; numero: string; solde: number }> = {}
    for (const x of f as any[]) {
      const fid = x.familles?.id
      if (!fid) continue
      const sr = Number(x.solde_restant || 0)
      if (sr <= 0) continue
      if (!dette_par_famille[fid]) dette_par_famille[fid] = { nom: x.familles.nom, numero: x.familles.numero, solde: 0 }
      dette_par_famille[fid].solde += sr
    }
    const top_debiteurs = Object.entries(dette_par_famille)
      .map(([famille_id, v]) => ({ famille_id, ...v }))
      .sort((a, b) => b.solde - a.solde)
      .slice(0, 10)

    const nb_familles_a_jour = Object.keys(dette_par_famille).length === 0 ? 0 :
      new Set(f.filter((x: any) => Number(x.solde_restant || 0) <= 0).map((x: any) => x.famille_id)).size
    const nb_familles_en_retard = Object.keys(dette_par_famille).length

    // Encaissements par mois (12 derniers mois)
    const debut = new Date()
    debut.setMonth(debut.getMonth() - 11)
    debut.setDate(1)
    const { data: regs } = await s
      .from('reglements')
      .select('montant, date_reglement, factures!inner(annee_scolaire)')
      .eq('factures.annee_scolaire', annee)
      .gte('date_reglement', debut.toISOString().split('T')[0])

    const par_mois: Record<string, number> = {}
    for (let i = 0; i < 12; i++) {
      const d = new Date(debut)
      d.setMonth(d.getMonth() + i)
      const key = d.toISOString().substring(0, 7)
      par_mois[key] = 0
    }
    for (const r of regs || []) {
      const key = (r.date_reglement || '').substring(0, 7)
      if (par_mois[key] !== undefined) par_mois[key] += Number(r.montant || 0)
    }
    const encaissements_par_mois = Object.entries(par_mois).map(([mois, total]) => ({ mois, total }))

    // Factures récentes
    const factures_recentes = f
      .sort((a: any, b: any) => (b.date_emission || '').localeCompare(a.date_emission || ''))
      .slice(0, 8)
      .map((x: any) => ({
        id: x.id, numero: x.numero,
        famille_nom: x.familles?.nom || '—',
        date_emission: x.date_emission,
        total: Number(x.total_facture || 0),
        solde: Number(x.solde_restant || 0),
        statut: x.statut,
      }))

    setKpi({
      ca_facture, ca_encaisse, solde_restant,
      nb_factures, nb_factures_payees, nb_factures_partiel, nb_factures_attente,
      nb_familles_a_jour, nb_familles_en_retard,
      top_debiteurs, encaissements_par_mois, factures_recentes,
    })
    setLoading(false)
  }

  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
  const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0
  const moisLabel = (m: string) => {
    const [y, mm] = m.split('-')
    const noms = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    return noms[parseInt(mm) - 1] + ' ' + y.substring(2)
  }

  if (loading || !kpi) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement du tableau de bord…</div>

  const max_enc = Math.max(...kpi.encaissements_par_mois.map(e => e.total), 1)

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18 }
  const cardLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }
  const cardValue: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: '#1E293B', lineHeight: 1.1 }
  const cardSub: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 4 }

  const STATUT_COLOR: Record<string, { bg: string; fg: string }> = {
    paye: { bg: '#ECFDF5', fg: '#065F46' },
    partiel: { bg: '#FEF3C7', fg: '#92400E' },
    en_attente: { bg: '#F1F5F9', fg: '#475569' },
    annule: { bg: '#FEF2F2', fg: '#991B1B' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Tableau de bord financier</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Vue d&apos;ensemble — exercice {annee}</p>
        </div>
        <select value={exerciceSelectionne?.id || ''} onChange={e => selectExercice(e.target.value)}
          style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
          {exercices.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.code}</option>
          ))}
        </select>
      </div>

      {/* KPI principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ ...card, background: 'linear-gradient(135deg, #1E40AF, #2563EB)', color: '#fff', border: 'none' }}>
          <div style={{ ...cardLabel, color: 'rgba(255,255,255,0.7)' }}>CA facturé</div>
          <div style={{ ...cardValue, color: '#fff' }}>{fmt(kpi.ca_facture)}</div>
          <div style={{ ...cardSub, color: 'rgba(255,255,255,0.6)' }}>{kpi.nb_factures} factures émises</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>CA encaissé</div>
          <div style={{ ...cardValue, color: '#10B981' }}>{fmt(kpi.ca_encaisse)}</div>
          <div style={cardSub}>{pct(kpi.ca_encaisse, kpi.ca_facture)}% du facturé</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Solde restant</div>
          <div style={{ ...cardValue, color: kpi.solde_restant > 0 ? '#F59E0B' : '#10B981' }}>{fmt(kpi.solde_restant)}</div>
          <div style={cardSub}>{kpi.nb_factures_attente} factures en attente</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Familles en retard</div>
          <div style={{ ...cardValue, color: kpi.nb_familles_en_retard > 0 ? '#EF4444' : '#10B981' }}>{kpi.nb_familles_en_retard}</div>
          <div style={cardSub}>Solde non réglé &gt; 0 €</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }} className="finances-dashboard-grid">
        {/* Encaissements par mois — barres */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Encaissements mensuels</h3>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>12 derniers mois</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, paddingTop: 10 }}>
            {kpi.encaissements_par_mois.map(e => {
              const h = max_enc > 0 ? (e.total / max_enc) * 100 : 0
              return (
                <div key={e.mois} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, height: 12 }}>
                    {e.total > 0 ? (e.total >= 1000 ? Math.round(e.total / 1000) + 'k' : Math.round(e.total)) : ''}
                  </div>
                  <div style={{
                    width: '100%', height: `${h}%`, minHeight: 4,
                    background: h > 70 ? 'linear-gradient(180deg, #10B981, #059669)' : h > 30 ? 'linear-gradient(180deg, #60A5FA, #2563EB)' : '#E2E8F0',
                    borderRadius: '4px 4px 0 0', transition: 'all 0.2s',
                  }} />
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{moisLabel(e.mois)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Statuts factures - donut */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 16px' }}>Statut des factures</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Payées', count: kpi.nb_factures_payees, color: '#10B981' },
              { label: 'Partielles', count: kpi.nb_factures_partiel, color: '#F59E0B' },
              { label: 'En attente', count: kpi.nb_factures_attente, color: '#EF4444' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{s.label}</span>
                  <span style={{ color: '#1E293B', fontWeight: 700 }}>{s.count}</span>
                </div>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: kpi.nb_factures > 0 ? `${(s.count / kpi.nb_factures) * 100}%` : '0%',
                    height: '100%', background: s.color, borderRadius: 4, transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top débiteurs */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>Top 10 débiteurs</h3>
          <button onClick={() => router.push(`/${ecole.slug}/finances/relances`)}
            style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            📨 Relancer →
          </button>
        </div>
        {kpi.top_debiteurs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>
            🎉 Aucun impayé sur cet exercice — toutes les familles sont à jour !
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kpi.top_debiteurs.map((d, i) => (
              <div key={d.famille_id}
                onClick={() => router.push(`/${ecole.slug}/familles/${d.famille_id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#F8FAFC')}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FEE2E2', color: '#991B1B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Famille {d.nom}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>{d.numero}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#991B1B' }}>{fmt(d.solde)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Factures récentes */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Factures récentes</h3>
        {kpi.factures_recentes.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13, padding: '12px 0' }}>Aucune facture sur cet exercice.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['N°', 'Famille', 'Émise', 'Total', 'Solde', 'Statut'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpi.factures_recentes.map(f => {
                const sc = STATUT_COLOR[f.statut] || STATUT_COLOR.en_attente
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
                    <td style={{ padding: '10px', fontSize: 12, fontFamily: 'monospace', color: '#475569' }}>{f.numero}</td>
                    <td style={{ padding: '10px', fontSize: 13, fontWeight: 500 }}>{f.famille_nom}</td>
                    <td style={{ padding: '10px', fontSize: 12, color: '#64748B' }}>{f.date_emission ? new Date(f.date_emission).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '10px', fontSize: 13, fontWeight: 600 }}>{fmt(f.total)}</td>
                    <td style={{ padding: '10px', fontSize: 13, fontWeight: 600, color: f.solde > 0 ? '#F59E0B' : '#10B981' }}>{fmt(f.solde)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: sc.fg, background: sc.bg, padding: '3px 9px', borderRadius: 10 }}>
                        {labelStatutFacture(f.statut)}
                      </span>
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
