'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive } from '@/lib/exercice-context'

type Repartition = {
  centre_cout: string
  total_facture: number
  total_encaisse: number
  nb_lignes: number
}

const LABELS: Record<string, { label: string; couleur: string; bg: string }> = {
  scolarite:         { label: 'Scolarité',         couleur: '#2563EB', bg: '#DBEAFE' },
  transport:         { label: 'Transport',         couleur: '#D97706', bg: '#FED7AA' },
  cantine:           { label: 'Cantine',           couleur: '#059669', bg: '#A7F3D0' },
  navette:           { label: 'Navette',           couleur: '#7C3AED', bg: '#DDD6FE' },
  frais_inscription: { label: 'Frais inscription', couleur: '#DC2626', bg: '#FECACA' },
  assurance:         { label: 'Assurance',         couleur: '#0891B2', bg: '#A5F3FC' },
  autre:             { label: 'Autre',             couleur: '#64748B', bg: '#E2E8F0' },
}

function fmt(n: number): string {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export default function AnalytiquePage() {
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const [loading, setLoading] = useState(true)
  const [repartition, setRepartition] = useState<Repartition[]>([])
  const [totalFacture, setTotalFacture] = useState(0)
  const [totalEncaisse, setTotalEncaisse] = useState(0)

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, annee])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: factures } = await s
      .from('factures_solde')
      .select('id, total_facture, total_regle, annee_scolaire, famille_id, familles!inner(ecole_id)')
      .eq('annee_scolaire', annee)
      .eq('familles.ecole_id', ecole.id)
      .neq('statut', 'annule')

    const facIds = (factures || []).map((f: any) => f.id)
    if (facIds.length === 0) {
      setRepartition([]); setTotalFacture(0); setTotalEncaisse(0); setLoading(false); return
    }

    const { data: lignes } = await s
      .from('facture_lignes')
      .select('facture_id, centre_cout, montant')
      .in('facture_id', facIds)

    const facMap: Record<string, { tf: number; te: number }> = {}
    let tf = 0, te = 0
    for (const f of (factures || []) as any[]) {
      facMap[f.id] = { tf: Number(f.total_facture || 0), te: Number(f.total_regle || 0) }
      tf += facMap[f.id].tf
      te += facMap[f.id].te
    }

    const agg: Record<string, Repartition> = {}
    for (const l of (lignes || []) as any[]) {
      const cc = l.centre_cout || 'autre'
      if (!agg[cc]) agg[cc] = { centre_cout: cc, total_facture: 0, total_encaisse: 0, nb_lignes: 0 }
      const montant = Number(l.montant || 0)
      agg[cc].total_facture += montant
      agg[cc].nb_lignes += 1
      const fac = facMap[l.facture_id]
      if (fac && fac.tf > 0) {
        agg[cc].total_encaisse += (montant / fac.tf) * fac.te
      }
    }

    const sorted = Object.values(agg).sort((a, b) => b.total_facture - a.total_facture)
    setRepartition(sorted)
    setTotalFacture(tf)
    setTotalEncaisse(te)
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Compta analytique</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Ventilation des recettes par centre de coût — exercice {annee}</p>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
      ) : repartition.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          Aucune ligne de facture sur cet exercice.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ background: 'linear-gradient(135deg,#1E40AF,#2563EB)', color: '#fff', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase' }}>CA facturé</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{fmt(totalFacture)}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase' }}>CA encaissé</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: '#10B981' }}>{fmt(totalEncaisse)}</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                {totalFacture > 0 ? Math.round((totalEncaisse / totalFacture) * 100) : 0}% du facturé
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: '0 0 14px' }}>Répartition du chiffre d&apos;affaires</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {repartition.map(r => {
                const meta = LABELS[r.centre_cout] || LABELS.autre
                const pct = totalFacture > 0 ? (r.total_facture / totalFacture) * 100 : 0
                return (
                  <div key={r.centre_cout}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: meta.couleur }}>{meta.label}</span>
                      <span style={{ color: '#64748B' }}>
                        <strong style={{ color: '#1E293B' }}>{fmt(r.total_facture)}</strong> · {pct.toFixed(1)}% · {r.nb_lignes} ligne{r.nb_lignes > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ background: '#F1F5F9', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                      <div style={{ background: meta.couleur, height: '100%', width: pct + '%', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Centre</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Facturé</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Encaissé</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>% enc.</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Lignes</th>
                </tr>
              </thead>
              <tbody>
                {repartition.map((r, i) => {
                  const meta = LABELS[r.centre_cout] || LABELS.autre
                  const pctEnc = r.total_facture > 0 ? (r.total_encaisse / r.total_facture) * 100 : 0
                  return (
                    <tr key={r.centre_cout} style={{ borderBottom: i < repartition.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: meta.bg, color: meta.couleur, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#1E293B' }}>{fmt(r.total_facture)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{fmt(r.total_encaisse)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B' }}>{pctEnc.toFixed(0)}%</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B' }}>{r.nb_lignes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
