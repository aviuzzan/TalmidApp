'use client'
/**
 * Bilan du jour — page d'impression dédiée (PDF propre A4, 1 page).
 *
 * Reprend les MÊMES requêtes que la page principale (`../page.tsx`) et les affiche
 * dans un layout compact A4 (header pleine largeur + 5 sections en grille 2 cols).
 * Auto-print 500ms après chargement. Verrou `acces_finances` géré par le layout parent.
 */
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'

type Bilan = {
  demandesAujourdhui: number
  demandesAccepteesAujourdhui: number
  contratsAujourdhui: number
  ddrAujourdhui: number
  encaisseAujourdhui: number
  nbPaiementsAujourdhui: number
  avoirsImputesAujourdhui: number
  nbAvoirsImputesAujourdhui: number
  resteAEncaisser: number
  facturesRetard30Count: number
  facturesRetard30Montant: number
  echeancesSemaineCount: number
  echeancesSemaineMontant: number
  echeancesRetardCount: number
  echeancesRetardMontant: number
  conversationsOuvertes: number
  conversationsSansReponse24h: number
  ddrEnAttente: number
  contratsAValider: number
  inscriptionsPedaAValider: number
  demandesEnAttenteVieux: number
  totalFamilles: number
  totalEleves: number
  totalFacture: number
  totalRegle: number
  totalRestant: number
}

export default function BilanPrintPage() {
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const { exerciceSelectionne } = useExercice() as any
  const [bilan, setBilan] = useState<Bilan | null>(null)
  const [loading, setLoading] = useState(true)
  const [genereLe] = useState<Date>(new Date())

  const charger = useCallback(async () => {
    if (!ecole?.id || !exerciceSelectionne) return
    setLoading(true)
    const s = createClient()
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const ilYa30Jours = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
    const ilYa24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const ilYa3jours = new Date(Date.now() - 3 * 86400 * 1000).toISOString()
    const dansUneSemaine = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10)
    const exerciceId = exerciceSelectionne.id

    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0)
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999)
    const debutJourIso = debutJour.toISOString()
    const finJourIso = finJour.toISOString()

    try {
      const [
        { count: demJour },
        { count: demAccepteesJour },
        { count: contratsJour },
        { count: ddrJour },
        { data: reglementsJour },
        { data: facturesAll },
        { data: echeancesSemaine },
        { data: echeancesRetard },
        { data: threadsOuverts },
        { count: ddrEnAttente },
        { count: contratsSoumis },
        { count: pedaSoumis },
        { count: demandesVieilles },
        { count: famN },
        { count: eleN },
        { data: facturesExercice },
      ] = await Promise.all([
        s.from('demandes_inscription').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id)
          .gte('soumis_le', debutJourIso).lte('soumis_le', finJourIso),
        s.from('demandes_inscription').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'accepte')
          .gte('traite_le', debutJourIso).lte('traite_le', finJourIso),
        s.from('contrats_scolarisation').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id)
          .in('statut', ['soumis', 'valide'])
          .gte('soumis_le', debutJourIso).lte('soumis_le', finJourIso),
        s.from('demandes_reduction').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id)
          .gte('soumis_le', debutJourIso).lte('soumis_le', finJourIso),
        // On récupère aussi mode_paiement pour distinguer vrais paiements et avoirs imputés.
        s.from('reglements').select('montant, mode_paiement, factures!inner(famille_id, familles!inner(ecole_id))')
          .eq('factures.familles.ecole_id', ecole.id)
          .eq('date_reglement', aujourdhui),
        s.from('factures_solde').select('solde_restant, date_emission, statut, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id)
          .neq('statut', 'annule'),
        s.from('cheques_prevus').select('montant, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id).eq('statut', 'prevu')
          .gte('date_echeance', aujourdhui).lte('date_echeance', dansUneSemaine),
        s.from('cheques_prevus').select('montant, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id).eq('statut', 'prevu')
          .lt('date_echeance', aujourdhui),
        s.from('message_threads')
          .select('id, last_message_at, messages(created_at, auteur_profile_id)')
          .eq('ecole_id', ecole.id).eq('statut', 'ouvert'),
        s.from('demandes_reduction').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).in('statut', ['soumise', 'en_attente', 'soumis', 'en_etude']),
        s.from('contrats_scolarisation').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'soumis'),
        s.from('inscriptions_pedagogiques').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'soumis'),
        s.from('demandes_inscription').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'en_attente')
          .lt('soumis_le', ilYa3jours),
        s.from('familles').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('enfants').select('id, familles!inner(ecole_id)', { count: 'exact', head: true })
          .eq('familles.ecole_id', ecole.id).neq('statut_inscription', 'sorti'),
        s.from('factures_solde').select('total_facture, total_regle, solde_restant, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id).eq('exercice_id', exerciceId).neq('statut', 'annule'),
      ])

      const regs = (reglementsJour ?? []) as any[]
      const paiementsReels = regs.filter(r => r.mode_paiement !== 'avoir')
      const avoirsImputes = regs.filter(r => r.mode_paiement === 'avoir')
      const encaisseAujourdhui = paiementsReels.reduce((sum, r) => sum + Number(r.montant || 0), 0)
      const avoirsImputesAujourdhui = avoirsImputes.reduce((sum, r) => sum + Number(r.montant || 0), 0)
      const factAll = (facturesAll ?? []) as any[]
      const resteAEncaisser = factAll.reduce((sum, f) => sum + Number(f.solde_restant || 0), 0)
      const retards30 = factAll.filter(f => Number(f.solde_restant) > 0 && f.date_emission && f.date_emission <= ilYa30Jours)
      const echSem = (echeancesSemaine ?? []) as any[]
      const echRetard = (echeancesRetard ?? []) as any[]

      const threads = (threadsOuverts ?? []) as any[]
      let sansReponse24h = 0
      for (const t of threads) {
        if (!t.last_message_at) continue
        if (new Date(t.last_message_at).getTime() < new Date(ilYa24h).getTime()) sansReponse24h++
      }

      // NOTE : `total_regle` exclut désormais les avoirs imputés. On utilise `solde_restant`
      // pour le reste à encaisser (mathématiquement correct).
      const factEx = (facturesExercice ?? []) as any[]
      const totalFacture = factEx.reduce((sum, f) => sum + Number(f.total_facture || 0), 0)
      const totalRegle = factEx.reduce((sum, f) => sum + Number(f.total_regle || 0), 0)
      const totalRestantS5 = factEx.reduce((sum, f) => sum + Number(f.solde_restant || 0), 0)

      setBilan({
        demandesAujourdhui: demJour ?? 0,
        demandesAccepteesAujourdhui: demAccepteesJour ?? 0,
        contratsAujourdhui: contratsJour ?? 0,
        ddrAujourdhui: ddrJour ?? 0,
        encaisseAujourdhui,
        nbPaiementsAujourdhui: paiementsReels.length,
        avoirsImputesAujourdhui,
        nbAvoirsImputesAujourdhui: avoirsImputes.length,
        resteAEncaisser,
        facturesRetard30Count: retards30.length,
        facturesRetard30Montant: retards30.reduce((s, f) => s + Number(f.solde_restant || 0), 0),
        echeancesSemaineCount: echSem.length,
        echeancesSemaineMontant: echSem.reduce((s, c) => s + Number(c.montant || 0), 0),
        echeancesRetardCount: echRetard.length,
        echeancesRetardMontant: echRetard.reduce((s, c) => s + Number(c.montant || 0), 0),
        conversationsOuvertes: threads.length,
        conversationsSansReponse24h: sansReponse24h,
        ddrEnAttente: ddrEnAttente ?? 0,
        contratsAValider: contratsSoumis ?? 0,
        inscriptionsPedaAValider: pedaSoumis ?? 0,
        demandesEnAttenteVieux: demandesVieilles ?? 0,
        totalFamilles: famN ?? 0,
        totalEleves: eleN ?? 0,
        totalFacture,
        totalRegle,
        totalRestant: totalRestantS5,
      })
    } finally {
      setLoading(false)
    }
  }, [ecole?.id, exerciceSelectionne])

  useEffect(() => { charger() }, [charger])

  // Auto-print 500ms après chargement
  useEffect(() => {
    if (bilan) {
      const t = setTimeout(() => window.print(), 500)
      return () => clearTimeout(t)
    }
  }, [bilan])

  const fmtNum = (n: number) => n.toLocaleString('fr-FR')
  const fmtEur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const fmtDateLongue = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const fmtDateHeure = (d: Date) => d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (loading && !bilan) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#64748B', fontFamily: 'Inter, system-ui, sans-serif' }}>Chargement du bilan…</div>
  }
  if (!bilan) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#DC2626', fontFamily: 'Inter, system-ui, sans-serif' }}>Erreur de chargement</div>
  }

  const ecoleSlug = ecole?.slug || ''

  return (
    <>
      <style jsx global>{`
        @page { size: A4; margin: 10mm 12mm }
        body { background: #F1F5F9; margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1E293B }
        .wrap { max-width: 780px; margin: 24px auto; background: #fff; padding: 22px 28px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border-radius: 4px }
        .toolbar { max-width: 780px; margin: 0 auto 8px; display: flex; gap: 10px; padding: 0 8px }
        .toolbar button { background: #2563EB; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer }
        .toolbar a { color: #64748B; text-decoration: none; padding: 10px 18px; font-size: 13px; align-self: center }
        @media print {
          body { background: #fff }
          .wrap { box-shadow: none; padding: 0; max-width: 100%; margin: 0; border-radius: 0 }
          .toolbar { display: none !important }
          aside, nav, header, [class*="EcoleSidebar"], [class*="sidebar"] { display: none !important }
          main { padding: 0 !important; margin: 0 !important; max-width: 100% !important }
          .section { break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact }
          .header-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact }
        }
      `}</style>

      <div className="toolbar no-print">
        <button onClick={() => window.print()}>🖨️ Imprimer / Enregistrer en PDF</button>
        <a href={`/${ecoleSlug}/bilan-quotidien`}>← Retour au bilan</a>
      </div>

      <div className="wrap" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Header pleine largeur — école + titre + date */}
        <div className="header-bar" style={{
          background: 'linear-gradient(135deg, #2563EB, #1E40AF)',
          color: '#fff', borderRadius: 8, padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {ecole?.logo_url && (
              <img src={ecole.logo_url} alt="" style={{ width: 42, height: 42, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 3 }} />
            )}
            <div>
              <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{ecole?.nom}</div>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '0.03em' }}>
                BILAN DU JOUR
              </h1>
              <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2, textTransform: 'capitalize' }}>{fmtDateLongue(genereLe)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 9, opacity: 0.85 }}>
            <div>Exercice {annee}</div>
            <div style={{ marginTop: 2 }}>Édité le {fmtDateHeure(genereLe)}</div>
          </div>
        </div>

        {/* Grille 2 colonnes — sections 1 à 4 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          {/* Section 1 — Inscriptions */}
          <Section titre="Inscriptions du jour" couleur="#2563EB" bg="#EFF6FF" border="#BFDBFE">
            <KpiGrid cols={2}>
              <Kpi label="Nouvelles demandes reçues" value={fmtNum(bilan.demandesAujourdhui)} color="#2563EB" />
              <Kpi label="Nouvelles demandes acceptées" value={fmtNum(bilan.demandesAccepteesAujourdhui)} color="#059669" />
              <Kpi label="Contrats signés" value={fmtNum(bilan.contratsAujourdhui)} color="#2563EB" />
              <Kpi label="DDR soumises" value={fmtNum(bilan.ddrAujourdhui)} color="#7C3AED" />
            </KpiGrid>
          </Section>

          {/* Section 2 — Paiements & finances */}
          <Section titre="Paiements & finances" couleur="#059669" bg="#ECFDF5" border="#A7F3D0">
            <KpiGrid cols={2}>
              <Kpi label="Encaissé aujourd'hui" value={fmtEur(bilan.encaisseAujourdhui)} color="#065F46" />
              <Kpi label="Paiements reçus" value={fmtNum(bilan.nbPaiementsAujourdhui)} color="#065F46" />
              <Kpi label={`Avoirs imputés (${bilan.nbAvoirsImputesAujourdhui})`}
                value={fmtEur(bilan.avoirsImputesAujourdhui)} color="#7C3AED" />
              <Kpi label={`Impayés >30j (${bilan.facturesRetard30Count})`}
                value={fmtEur(bilan.facturesRetard30Montant)}
                color={bilan.facturesRetard30Count > 0 ? '#991B1B' : '#065F46'} />
              <Kpi label={`Échéances 7j (${bilan.echeancesSemaineCount})`}
                value={fmtEur(bilan.echeancesSemaineMontant)} color="#1E40AF" />
            </KpiGrid>
          </Section>

          {/* Section 3 — Messages parents */}
          <Section titre="Messages parents" couleur="#7C3AED" bg="#F5F3FF" border="#DDD6FE">
            <KpiGrid cols={2}>
              <Kpi label="Conversations ouvertes" value={fmtNum(bilan.conversationsOuvertes)} color="#5B21B6" />
              <Kpi label="Sans réponse +24h" value={fmtNum(bilan.conversationsSansReponse24h)}
                color={bilan.conversationsSansReponse24h > 0 ? '#991B1B' : '#5B21B6'} />
            </KpiGrid>
          </Section>

          {/* Section 4 — Alertes urgentes */}
          <Section titre="Alertes urgentes" couleur="#D97706" bg="#FFFBEB" border="#FDE68A">
            <KpiGrid cols={2}>
              <Kpi label="DDR à traiter" value={fmtNum(bilan.ddrEnAttente)}
                color={bilan.ddrEnAttente > 0 ? '#92400E' : '#059669'} />
              <Kpi label="Contrats à valider" value={fmtNum(bilan.contratsAValider)}
                color={bilan.contratsAValider > 0 ? '#92400E' : '#059669'} />
              <Kpi label="Fiches pédago à valider" value={fmtNum(bilan.inscriptionsPedaAValider)}
                color={bilan.inscriptionsPedaAValider > 0 ? '#92400E' : '#059669'} />
              <Kpi label="Demandes >3j" value={fmtNum(bilan.demandesEnAttenteVieux)}
                color={bilan.demandesEnAttenteVieux > 0 ? '#991B1B' : '#059669'} />
            </KpiGrid>
          </Section>
        </div>

        {/* Section 5 — Vue d'ensemble (pleine largeur) */}
        <Section titre={`Vue d'ensemble — Exercice ${annee}`} couleur="#475569" bg="#F8FAFC" border="#E2E8F0">
          <KpiGrid cols={5}>
            <Kpi label="Familles actives" value={fmtNum(bilan.totalFamilles)} color="#1E293B" />
            <Kpi label="Élèves inscrits" value={fmtNum(bilan.totalEleves)} color="#1E293B" />
            <Kpi label="Total facturé" value={fmtEur(bilan.totalFacture)} color="#1E293B" />
            <Kpi label="Total réglé" value={fmtEur(bilan.totalRegle)} color="#065F46" />
            <Kpi label="Reste à encaisser" value={fmtEur(bilan.totalRestant)}
              color={bilan.totalRestant > 0 ? '#991B1B' : '#065F46'} />
          </KpiGrid>
        </Section>

        {/* Footer */}
        <div style={{
          marginTop: 14, paddingTop: 8, borderTop: '1px solid #E2E8F0',
          fontSize: 9, color: '#94A3B8', textAlign: 'center', lineHeight: 1.4,
        }}>
          Document généré le {fmtDateHeure(genereLe)} — TalmidApp
        </div>
      </div>
    </>
  )
}

// — composants internes —

function Section({
  titre, couleur, children, bg, border,
}: {
  titre: string; couleur: string; children: React.ReactNode; bg?: string; border?: string
}) {
  return (
    <div className="section" style={{
      background: bg || '#fff',
      border: `1px solid ${border || '#E2E8F0'}`,
      borderRadius: 8, padding: '10px 12px',
    }}>
      <h2 style={{
        fontSize: 10, fontWeight: 700, color: couleur, margin: 0, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{titre}</h2>
      {children}
    </div>
  )
}

function KpiGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
      {children}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: 3, lineHeight: 1.2 }}>
        {label}
      </div>
    </div>
  )
}
