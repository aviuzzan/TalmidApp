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
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'
import { calcDuADateBatch } from '@/lib/du-a-date'
import { compterEffectifs, compterSorties } from '@/lib/effectifs'
import AidePage from '@/components/ui/AidePage'

type KPI = {
  // Effectifs — TOUJOURS via `scolarites` + exercice (cf. lib/effectifs.ts),
  // pour que le ratio avec les montants (eux filtrés par exercice) ait un sens.
  familles: number
  eleves: number
  famillesNm1: number | null   // null = pas d'exercice précédent (1re année)
  elevesNm1: number | null
  codeExerciceNm1: string | null
  // Finances (exercice sélectionné)
  totalFacture: number
  totalRegle: number
  totalRestant: number
  // Recouvrement « dû à date » (échéances réellement échues)
  duADate: number              // Sigma des échéances échues (= ce qui était exigible)
  resteDuADate: number         // Sigma des `duAdate` (part exigible non encaissée)
  famillesEnRetard: number     // familles DISTINCTES avec du_a_date > 0
  facturesEnRetard: number
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
      const exerciceId = exerciceSelectionne.id

      const [
        // effectifs N — via `scolarites` (source de vérité de l'affectation par
        // année). FIX audit 28/07 : on comptait `familles`/`enfants` SANS filtre
        // d'exercice, alors que les montants sont filtrés par exercice → le ratio
        // « facturé par élève » était structurellement faux.
        effectifsN,
        // factures
        { data: factures },
        // sorties de l'exercice
        sorN,
        // contrats N+1 et scolarités N+1
        { data: exsList },
        // DDR accordées
        { count: ddr },
      ] = await Promise.all([
        compterEffectifs(s, ecole.id, exerciceId),
        s.from('factures_solde').select('id, famille_id, total_facture, total_regle, solde_restant, statut, familles!inner(ecole_id)').eq('familles.ecole_id', ecole.id).eq('exercice_id', exerciceId).neq('statut', 'annule'),
        compterSorties(s, ecole.id, exerciceId),
        s.from('exercices').select('id, code, date_debut').eq('ecole_id', ecole.id).order('date_debut', { ascending: false }),
        // FIX audit 27/07 : la BDD ecrit 'accepte' (jamais 'accordee') -> le KPI valait toujours 0
        s.from('demandes_reduction').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('exercice_id', exerciceId).eq('statut', 'accepte'),
      ])

      // NOTE : depuis la refonte de la vue, `total_regle` EXCLUT les avoirs imputés
      // (= vrais paiements uniquement). Le "Total réglé" affiché est donc un vrai recouvrement
      // monétaire ; les avoirs ne gonflent plus artificiellement le KPI. Pour le reste à
      // recouvrer on utilise `solde_restant` (mathématiquement correct, inchangé).
      const listeFactures = (factures ?? []) as any[]
      const totalFacture = listeFactures.reduce((sum: number, f: any) => sum + Number(f.total_facture || 0), 0)
      const totalRegle = listeFactures.reduce((sum: number, f: any) => sum + Number(f.total_regle || 0), 0)
      const totalRestant = listeFactures.reduce((sum: number, f: any) => sum + Number(f.solde_restant || 0), 0)

      // ── RECOUVREMENT « DÛ À DATE » (FIX audit 28/07) ────────────────────────
      // Une facture annuelle est émise en totalité (souvent en juillet) puis payée
      // en 10 échéances de septembre à juin : `total_regle / total_facture` est
      // donc mécaniquement bas en cours d'année et ne mesure PAS le recouvrement.
      // Le vrai recouvrement se calcule sur ce qui était EXIGIBLE à ce jour.
      //
      // `calcDuADateBatch` renvoie, par facture :
      //   totalEcheancesEchues = Sigma des échéances dont date_echeance <= aujourd'hui
      //   duAdate              = max(0, totalEcheancesEchues - totalRegle)  [= reste dû à date]
      //   echeancierExiste     = false s'il n'y a aucune échéance générée ; dans ce
      //                          cas le helper considère TOUT dû (fallback), on aligne
      //                          donc l'exigible sur `totalFacture` pour rester cohérent.
      // Le helper ne fournit pas directement le couple (exigible, reste dû) agrégé :
      //   exigible à date  = Sigma (echeancierExiste ? totalEcheancesEchues : totalFacture)
      //   reste dû à date  = Sigma duAdate
      //   encaissé exigible = exigible - reste dû   (borné par construction : duAdate est
      //                       clampé à 0, donc une famille en avance ne fait pas dépasser 100 %)
      // IMPORTANT : on lance le batch sur TOUTES les factures de l'exercice, pas
      // seulement celles avec un solde > 0 : une facture soldée a bien eu des
      // échéances exigibles encaissées, elle doit peser dans le dénominateur.
      let duADate = 0
      let resteDuADate = 0
      let facturesEnRetard = 0
      const famillesEnRetard = new Set<string>()
      const familleParFacture: Record<string, string> = {}
      for (const f of listeFactures) {
        if (f.id && f.famille_id) familleParFacture[f.id] = f.famille_id
      }
      const idsFactures = listeFactures.map((f: any) => f.id).filter(Boolean)
      if (idsFactures.length > 0) {
        const duMap = await calcDuADateBatch(s, idsFactures)
        for (const [factureId, r] of Object.entries(duMap)) {
          duADate += r.echeancierExiste ? r.totalEcheancesEchues : r.totalFacture
          resteDuADate += r.duAdate
          if (r.enRetard) {
            facturesEnRetard++
            // Déduplication par famille : une famille avec 3 factures en retard
            // ne doit compter que pour UNE famille en retard.
            const fid = familleParFacture[factureId]
            if (fid) famillesEnRetard.add(fid)
          }
        }
      }

      // Exercices de l'école, triés du plus récent au plus ancien (date_debut DESC).
      const exList = (exsList ?? []) as { id: string; code: string; date_debut: string | null }[]
      const idx = exList.findIndex(e => e.id === exerciceId)
      const exN1 = idx > 0 ? exList[idx - 1] : null                                  // exercice SUIVANT (N+1)
      const exNm1 = idx >= 0 && idx + 1 < exList.length ? exList[idx + 1] : null      // exercice PRÉCÉDENT (N-1)

      // Inscriptions N+1 + effectifs N-1 (comparaison annoncée dans l'en-tête).
      // FIX audit 28/07 : `famillesNm1`/`elevesNm1` étaient déclarés et jamais calculés.
      const [contratsN1Res, scolaritesN1Res, effectifsNm1] = await Promise.all([
        exN1
          ? s.from('contrats_scolarisation').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('exercice_id', exN1.id).eq('statut', 'valide')
          : Promise.resolve({ count: 0 }),
        // FIX audit 28/07 : filtre `ecole_id` EXPLICITE (la requête ne reposait que
        // sur la RLS pour le cloisonnement inter-écoles).
        exN1
          ? s.from('scolarites').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('exercice_id', exN1.id)
          : Promise.resolve({ count: 0 }),
        exNm1 ? compterEffectifs(s, ecole.id, exNm1.id) : Promise.resolve(null),
      ])
      const contratsN1 = contratsN1Res.count ?? 0
      const scolaritesN1 = scolaritesN1Res.count ?? 0

      setKpi({
        familles: effectifsN.familles,
        eleves: effectifsN.eleves,
        famillesNm1: effectifsNm1 ? effectifsNm1.familles : null,
        elevesNm1: effectifsNm1 ? effectifsNm1.eleves : null,
        codeExerciceNm1: exNm1 ? exNm1.code : null,
        totalFacture,
        totalRegle,
        totalRestant,
        duADate,
        resteDuADate,
        famillesEnRetard: famillesEnRetard.size,
        facturesEnRetard,
        sorties: sorN,
        inscriptionsN1Contrats: contratsN1,
        inscriptionsN1Scolarites: scolaritesN1,
        reductionsAccordees: ddr ?? 0,
      })
      setLoading(false)
    })()
  }, [ecole?.id, exerciceSelectionne])

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  // ── Les deux indicateurs à NE PAS confondre ───────────────────────────────
  // 1) Avancement de l'encaissement sur l'année = réglé / facturé.
  //    Purement informatif : la facture annuelle est émise en une fois puis payée
  //    en 10 échéances → ce ratio est bas en début d'année SANS aucun impayé.
  //    Jamais coloré en rouge.
  const avancementEncaissement: number | null =
    kpi && kpi.totalFacture > 0 ? (kpi.totalRegle / kpi.totalFacture) * 100 : null
  // 2) Taux de recouvrement = (dû à date − reste dû à date) / dû à date.
  //    = part de ce qui était EXIGIBLE à ce jour qui a bien été encaissée.
  //    null quand aucune échéance n'est encore échue (division par zéro) → « — ».
  const tauxRecouvrement: number | null =
    kpi && kpi.duADate > 0 ? ((kpi.duADate - kpi.resteDuADate) / kpi.duADate) * 100 : null
  const couleurRecouvrement =
    tauxRecouvrement === null ? '#94A3B8'
      : tauxRecouvrement >= 95 ? '#10B981'
        : tauxRecouvrement >= 85 ? '#F59E0B'
          : '#EF4444'

  const deltaEleves = kpi && kpi.elevesNm1 !== null ? kpi.eleves - kpi.elevesNm1 : null
  const deltaFamilles = kpi && kpi.famillesNm1 !== null ? kpi.familles - kpi.famillesNm1 : null
  const fmtDelta = (d: number | null) => d === null ? '—' : (d > 0 ? `+${d}` : String(d))

  const exportCSV = () => {
    if (!kpi) return
    const rows = [
      ['Indicateur', 'Valeur'],
      ['Année scolaire', annee],
      ['Familles actives (exercice)', String(kpi.familles)],
      ['Élèves actifs (exercice)', String(kpi.eleves)],
      ['Familles N-1' + (kpi.codeExerciceNm1 ? ` (${kpi.codeExerciceNm1})` : ''), kpi.famillesNm1 === null ? '—' : String(kpi.famillesNm1)],
      ['Élèves N-1' + (kpi.codeExerciceNm1 ? ` (${kpi.codeExerciceNm1})` : ''), kpi.elevesNm1 === null ? '—' : String(kpi.elevesNm1)],
      ['Évolution élèves N vs N-1', fmtDelta(deltaEleves)],
      ['Évolution familles N vs N-1', fmtDelta(deltaFamilles)],
      ['Total facturé (€)', kpi.totalFacture.toFixed(2)],
      ['Total réglé (€)', kpi.totalRegle.toFixed(2)],
      ['Reste à encaisser sur l\'année (€)', kpi.totalRestant.toFixed(2)],
      ['Avancement de l\'encaissement sur l\'année (%)', avancementEncaissement === null ? '—' : avancementEncaissement.toFixed(1)],
      ['Dû à date — échéances échues (€)', kpi.duADate.toFixed(2)],
      ['Reste dû à date (€)', kpi.resteDuADate.toFixed(2)],
      ['Taux de recouvrement (%)', tauxRecouvrement === null ? '—' : tauxRecouvrement.toFixed(1)],
      ['Familles en retard (échéances échues)', String(kpi.famillesEnRetard)],
      ['Factures concernées', String(kpi.facturesEnRetard)],
      ['Sorties sur l\'exercice (élèves)', String(kpi.sorties)],
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

      <AidePage route="direction" />

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Calcul des indicateurs…</div>
      ) : kpi ? (
        <>
          {/* Bloc Effectifs */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 12 }}>👥 Effectifs {annee}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Kpi label="Familles actives" value={kpi.familles.toString()} color="#1E293B" bg="#F8FAFC" />
              <Kpi label="Élèves actifs" value={kpi.eleves.toString()} color="#1E293B" bg="#F8FAFC" />
              <Kpi label={"Sorties sur l'exercice"} value={kpi.sorties.toString()} color="#475569" bg="#F1F5F9" />
              <Kpi label="Réductions accordées" value={kpi.reductionsAccordees.toString()} color="#92400E" bg="#FEF3C7" />
            </div>
            {/* Comparaison N vs N-1 — « — » s'il n'existe pas d'exercice précédent */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
              <Kpi
                label={`Élèves ${kpi.codeExerciceNm1 ?? 'N-1'}`}
                value={kpi.elevesNm1 === null ? '—' : kpi.elevesNm1.toString()}
                color="#475569" bg="#F8FAFC" />
              <Kpi
                label="Évolution élèves"
                value={deltaEleves === null ? '—' : fmtDelta(deltaEleves)}
                color={deltaEleves === null ? '#94A3B8' : deltaEleves > 0 ? '#065F46' : deltaEleves < 0 ? '#991B1B' : '#475569'}
                bg={deltaEleves === null ? '#F8FAFC' : deltaEleves > 0 ? '#ECFDF5' : deltaEleves < 0 ? '#FEF2F2' : '#F8FAFC'} />
              <Kpi
                label={`Familles ${kpi.codeExerciceNm1 ?? 'N-1'}`}
                value={kpi.famillesNm1 === null ? '—' : kpi.famillesNm1.toString()}
                color="#475569" bg="#F8FAFC" />
              <Kpi
                label="Évolution familles"
                value={deltaFamilles === null ? '—' : fmtDelta(deltaFamilles)}
                color={deltaFamilles === null ? '#94A3B8' : deltaFamilles > 0 ? '#065F46' : deltaFamilles < 0 ? '#991B1B' : '#475569'}
                bg={deltaFamilles === null ? '#F8FAFC' : deltaFamilles > 0 ? '#ECFDF5' : deltaFamilles < 0 ? '#FEF2F2' : '#F8FAFC'} />
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 10, lineHeight: 1.5 }}>
              {kpi.codeExerciceNm1
                ? <>Effectifs comptés sur les scolarités de l&apos;exercice (même définition que la liste des élèves). Comparaison avec {kpi.codeExerciceNm1}.</>
                : <>Effectifs comptés sur les scolarités de l&apos;exercice (même définition que la liste des élèves). Aucun exercice précédent : pas de comparaison N-1.</>}
            </div>
          </div>

          {/* Bloc Finances */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0, marginBottom: 12 }}>💰 Finances {annee}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <Kpi label="Total facturé" value={fmt(kpi.totalFacture)} color="#1E293B" bg="#F8FAFC" />
              <Kpi label="Total réglé" value={fmt(kpi.totalRegle)} color="#065F46" bg="#ECFDF5" />
              <Kpi label={"Reste à encaisser sur l'année"} value={fmt(kpi.totalRestant)} color="#1E293B" bg="#F8FAFC" />
            </div>

            {/* 1) Avancement de l'encaissement — INFORMATIF, jamais rouge */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avancement de l&apos;encaissement sur l&apos;année
              </div>
              <div style={{ background: '#F1F5F9', borderRadius: 8, height: 14, overflow: 'hidden', position: 'relative' }}>
                <div style={{ background: '#64748B', height: '100%', width: `${Math.min(100, avancementEncaissement ?? 0)}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginTop: 4 }}>
                {avancementEncaissement === null ? '—' : `${avancementEncaissement.toFixed(1)} %`}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, lineHeight: 1.5 }}>
                Réglé / facturé. Indicateur informatif : les factures annuelles sont émises en totalité
                puis payées en échéances de septembre à juin — il est donc normal que ce pourcentage soit
                faible en début d&apos;année. Ce n&apos;est PAS un indicateur d&apos;impayés.
              </div>
            </div>

            {/* 2) Taux de recouvrement — sur le dû à date, c'est CE chiffre qui alerte */}
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Taux de recouvrement (échéances échues)
              </div>
              <div style={{ background: '#F1F5F9', borderRadius: 8, height: 14, overflow: 'hidden', position: 'relative' }}>
                <div style={{ background: couleurRecouvrement, height: '100%', width: `${Math.min(100, tauxRecouvrement ?? 0)}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: tauxRecouvrement === null ? '#94A3B8' : '#1E293B', marginTop: 4 }}>
                {tauxRecouvrement === null ? '—' : `${tauxRecouvrement.toFixed(1)} %`}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, lineHeight: 1.5 }}>
                {tauxRecouvrement === null ? (
                  <>Aucune échéance échue à ce jour : le taux de recouvrement n&apos;est pas encore calculable.</>
                ) : (
                  <>Part de ce qui était exigible à ce jour et qui a été encaissé — {fmt(kpi.duADate - kpi.resteDuADate)} encaissés
                    sur {fmt(kpi.duADate)} exigibles (échéances échues). Reste dû à date : {fmt(kpi.resteDuADate)}.</>
                )}
              </div>
            </div>
          </div>

          {/* Bloc Retards */}
          {kpi.famillesEnRetard > 0 && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 18 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', margin: 0, marginBottom: 12 }}>⚠️ Retards de paiement</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {/* Dédupliqué par famille : une famille avec 3 factures ne compte qu'une fois. */}
                <Kpi label="Familles en retard sur échéance" value={kpi.famillesEnRetard.toString()} color="#991B1B" bg="#fff" />
                <Kpi label="Factures concernées" value={kpi.facturesEnRetard.toString()} color="#991B1B" bg="#fff" />
                <Kpi label="Montant dû à ce jour" value={fmt(kpi.resteDuADate)} color="#991B1B" bg="#fff" />
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
