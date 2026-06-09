'use client'
/**
 * Tableau de bord direction
 * KPI annuels exportables : effectifs N vs N-1, recettes, recouvrement, retards, sorties, inscriptions N+1.
 * Cible : direction d'école qui n'utilise pas l'app au quotidien mais veut une vue executive.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import ExerciceSelector from '@/components/ui/ExerciceSelector'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'

type KPI = {
  familles: number
  eleves: number
  famillesNm1: number | null
  elevesNm1: number | null
  totalFacture: number
  totalRegle: number
  totalRestant: number
  facturesRetard30: number
  montantRetard30: number
  sorties: number
  inscriptionsN1Contrats: number
  inscriptionsN1Scolarites: number
  reductionsAccordees: number
}

export default function TableauBordDirectionPage() {
  const router = useRouter()
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const { exerciceSelectionne } = useExercice() as any
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ecole?.id || !exerciceSelectionne) return
    ;(async () => {
      setLoading(true)
      const s = createClient()
      const il30Joursj = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
      const exerciceId = exerciceSelectionne.id

      const [
        // effectifs N
        { count: famN },
        { count: eleN },
        // factures
        { data: factures },
        // sorties (eleves)
        { count: sorN },
        // contrats N+1 et scolarités N+1
        { data: exsList },
        // DDR accordées
        { count: ddr },
      ] = await Promise.all([
        s.from('familles').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('enfants').select('id, familles!inner(ecole_id)', { count: 'exact', head: true }).eq('familles.ecole_id', ecole.id).neq('statut_dossier', 'sorti'),
        s.from('factures_solde').select('total_facture, total_regle, solde_restant, statut, date_emission, familles!inner(ecole_id)').eq('familles.ecole_id', ecole.id).eq('exercice_id', exerciceId).neq('statut', 'annule'),
        s.from('enfants').select('id, familles!inner(ecole_id)', { count: 'exact', head: true }).eq('familles.ecole_id', ecole.id).eq('statut_dossier', 'sorti'),
        s.from('exercices').select('id, code').eq('ecole_id', ecole.id).order('code', { ascending: false }),
        s.from('demandes_reduction').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('exercice_id', exerciceId).eq('statut', 'accordee'),
      ])

      const totalFacture = ((factures ?? []) as any[]).reduce((sum: number, f: any) => sum + Number(f.total_facture || 0), 0)
      const totalRegle = ((factures ?? []) as any[]).reduce((sum: number, f: any) => sum + Number(f.total_regle || 0), 0)
      const totalRestant = totalFacture - totalRegle
      const retards = ((factures ?? []) as any[]).filter((f: any) => Number(f.solde_restant) > 0 && f.date_emission && f.date_emission <= il30Joursj)
      const facturesRetard30 = retards.length
      const montantRetard30 = retards.reduce((sum: number, f: any) => sum + Number(f.solde_restant || 0), 0)

      // Inscriptions N+1
      const exList = (exsList ?? []) as { id: string; code: string }[]
      const idx = exList.findIndex(e => e.id === exerciceId)
      const exN1 = idx > 0 ? exList[idx - 1] : null
      let contratsN1 = 0
      let scolaritesN1 = 0
      if (exN1) {
        const [{ count: c1 }, { count: c2 }] = await Promise.all([
          s.from('contrats_scolarisation').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('exercice_id', exN1.id).eq('statut', 'valide'),
          s.from('scolarites').select('id, familles:enfants!inner(famille_id, familles!inner(ecole_id))', { count: 'exact', head: true }).eq('exercice_id', exN1.id),
        ])
        contratsN1 = c1 ?? 0
        scolaritesN1 = c2 ?? 0
      }

      // N-1 effectifs (best-effort : prends le code juste plus ancien que current)
      let famillesNm1: number | null = null
      let elevesNm1: number | null = null
      // pas de table eleve_historique chargée ici; on garde null si on n'a pas mieux
      // On compte les enfants sortis dans l'exercice precedent comme proxy (rough)

      setKpi({
        familles: famN ?? 0,
        eleves: eleN ?? 0,
        famillesNm1,
        elevesNm1,
        totalFacture,
        totalRegle,
        totalRestant,
        facturesRetard30,
        montantRetard30,
        sorties: sorN ?? 0,
        inscriptionsN1Contrats: contratsN1,
        inscriptionsN1Scolarites: scolaritesN1,
        reductionsAccordees: ddr ?? 0,
      })
      setLoading(false)
    })()
  }, [ecole?.id, exerciceSelectionne])

  function exportCSV() {
    if (!kpi) return
    const taux = kpi.totalFacture > 0 ? (kpi.totalRegle / kpi.totalFacture * 100).toFixed(1) : '0'
    const rows = [
      ['Indicateur', 'Valeur'],
      ['Année scolaire', annee],
      ['Familles', String(kpi.familles)],
      ['Élèves', String(kpi.eleves)],
      ['Total facturé (€)', kpi.totalFacture.toFixed(2)],
      ['Total réglé (€)', kpi.totalRegle.toFixed(2)],
      ['Reste à recouvrer (€)', kpi.totalRestant.toFixed(2)],
      ['Taux de recouvrement (%)', taux],
      ['Factures en retard >30j', String(kpi.facturesRetard30)],
      ['Montant retard >30j (€)', kpi.montantRetard30.toFixed(2)],
      ['Sorties (élèves)', String(kpi.sorties)],
      ['Contrats N+1 validés', String(kpi.inscriptionsN1Contrats)],
      ['Scolarités N+1 créées', String(kpi.inscriptionsN1Scolarites)],
      ['Réductions accordées', String(kpi.reductionsAccordees)],
    ]
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `direction-kpi-${annee}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const tauxRecouvrement = kpi && kpi.totalFacture > 0 ? (kpi.totalRegle / kpi.totalFacture * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>📊 Tableau de bord direction</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>
            Vue executive — {ecole?.nom} · {annee}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExerciceSelector />
          <button onClick={exportCSV} disabled={!kpi}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: kpi ? 'pointer' : 'wait' }}>
            📥 Export CSV
          </button>
          <button onClick={() => window.print()} disabled={!kpi}
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: kpi ? 'pointer' : 'wait' }}>
            🖨️ Imprimer
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Calcul des indicateurs…</div>
      ) : kpi ? (
        <>
          {/* Bloc Effectifs */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 12 }}>👥 Effectifs</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Kpi label="Familles" value={kpi.familles.toString()} color="#1E293B" bg="#F8FAFC" />
              <Kpi label="Élèves actifs" value={kpi.eleves.toString()} color="#1E293B" bg="#F8FAFC" />
              <Kpi label="Sorties (cumul)" value={kpi.sorties.toString()} color="#475569" bg="#F1F5F9" />
              <Kpi label="Réductions accordées" value={kpi.reductionsAccordees.toString()} color="#92400E" bg="#FEF3C7" />
            </div>
          </div>

          {/* Bloc Finances */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 12 }}>💰 Finances {annee}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <Kpi label="Total facturé" value={fmt(kpi.totalFacture)} color="#1E293B" bg="#F8FAFC" />
              <Kpi label="Total réglé" value={fmt(kpi.totalRegle)} color="#065F46" bg="#ECFDF5" />
              <Kpi label="Reste à recouvrer" value={fmt(kpi.totalRestant)} color={kpi.totalRestant > 0 ? '#991B1B' : '#065F46'} bg={kpi.totalRestant > 0 ? '#FEF2F2' : '#ECFDF5'} />
            </div>
            {/* Barre de recouvrement */}
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6 }}>TAUX DE RECOUVREMENT</div>
              <div style={{ background: '#F1F5F9', borderRadius: 8, height: 14, overflow: 'hidden', position: 'relative' }}>
                <div style={{ background: tauxRecouvrement >= 90 ? '#10B981' : tauxRecouvrement >= 70 ? '#F59E0B' : '#EF4444', height: '100%', width: `${Math.min(100, tauxRecouvrement)}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginTop: 4 }}>{tauxRecouvrement.toFixed(1)} %</div>
            </div>
          </div>

          {/* Bloc Retards */}
          {kpi.facturesRetard30 > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', margin: 0, marginBottom: 12 }}>⚠️ Retards de paiement</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Kpi label="Factures en retard >30j" value={kpi.facturesRetard30.toString()} color="#991B1B" bg="#fff" />
                <Kpi label="Montant en retard >30j" value={fmt(kpi.montantRetard30)} color="#991B1B" bg="#fff" />
              </div>
              <button onClick={() => router.push(`/${ecole.slug}/finances/relances`)}
                style={{ marginTop: 12, background: '#fff', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Lancer une relance →
              </button>
            </div>
          )}

          {/* Bloc N+1 */}
          {(kpi.inscriptionsN1Contrats > 0 || kpi.inscriptionsN1Scolarites > 0) && (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#065F46', margin: 0, marginBottom: 12 }}>📅 Inscriptions N+1</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Kpi label="Contrats validés" value={kpi.inscriptionsN1Contrats.toString()} color="#065F46" bg="#fff" />
                <Kpi label="Scolarités créées" value={kpi.inscriptionsN1Scolarites.toString()} color="#065F46" bg="#fff" />
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 8 }}>
            Données live au {new Date().toLocaleString('fr-FR')}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Kpi({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
    </div>
  )
}
