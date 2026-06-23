'use client'
/**
 * Bilan du jour — vue journalière condensée pour l'admin principal.
 *
 * Différence avec /direction : cette page-ci est OPÉRATIONNELLE (aujourd'hui /
 * urgences / délais), pas exécutive annuelle. Objectif : ouvrir cette page le
 * matin et savoir en 30 secondes ce qu'il s'est passé et ce qui doit être traité.
 *
 * Sections :
 *  1. Inscriptions du jour
 *  2. Paiements & finances (encaissé aujourd'hui + soldes + échéances)
 *  3. Messages parents
 *  4. Alertes urgentes (action requise)
 *  5. Vue d'ensemble de l'année (KPI globaux)
 *
 * Verrou : géré dans layout.tsx (acces_finances ou super_admin).
 */
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useAnneeScolaireActive, useExercice } from '@/lib/exercice-context'

type Bilan = {
  // Section 1
  demandesAujourdhui: number
  demandesAccepteesAujourdhui: number
  contratsAujourdhui: number
  ddrAujourdhui: number
  // Section 2
  encaisseAujourdhui: number
  nbPaiementsAujourdhui: number
  resteAEncaisser: number
  facturesRetard30Count: number
  facturesRetard30Montant: number
  echeancesSemaineCount: number
  echeancesSemaineMontant: number
  echeancesRetardCount: number
  echeancesRetardMontant: number
  // Section 3
  conversationsOuvertes: number
  conversationsSansReponse24h: number
  // Section 4
  ddrEnAttente: number
  contratsAValider: number
  inscriptionsPedaAValider: number
  demandesEnAttenteVieux: number
  // Section 5
  totalFamilles: number
  totalEleves: number
  totalFacture: number
  totalRegle: number
  totalRestant: number
}

export default function BilanQuotidienPage() {
  const router = useRouter()
  const ecole = useEcole()
  const annee = useAnneeScolaireActive()
  const { exerciceSelectionne } = useExercice() as any
  const [bilan, setBilan] = useState<Bilan | null>(null)
  const [loading, setLoading] = useState(true)
  const [derniereMaj, setDerniereMaj] = useState<Date>(new Date())

  const charger = useCallback(async () => {
    if (!ecole?.id || !exerciceSelectionne) return
    setLoading(true)
    const s = createClient()
    const aujourdhui = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const ilYa30Jours = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10)
    const ilYa24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const ilYa3jours = new Date(Date.now() - 3 * 86400 * 1000).toISOString()
    const dansUneSemaine = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10)
    const exerciceId = exerciceSelectionne.id

    // Bornes "aujourd'hui" pour les colonnes timestamptz (soumis_le, traite_le)
    const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0)
    const finJour = new Date(); finJour.setHours(23, 59, 59, 999)
    const debutJourIso = debutJour.toISOString()
    const finJourIso = finJour.toISOString()

    try {
      const [
        // S1 — Inscriptions du jour
        { count: demJour },
        { count: demAccepteesJour },
        { count: contratsJour },
        { count: ddrJour },
        // S2 — Paiements & finances
        { data: reglementsJour },
        { data: facturesAll },
        { data: echeancesSemaine },
        { data: echeancesRetard },
        // S3 — Messages
        { data: threadsOuverts },
        // S4 — Alertes
        { count: ddrEnAttente },
        { count: contratsSoumis },
        { count: pedaSoumis },
        { count: demandesVieilles },
        // S5 — Vue d'ensemble
        { count: famN },
        { count: eleN },
        { data: facturesExercice },
      ] = await Promise.all([
        // S1
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
        // S2 — encaissé aujourd'hui (date_reglement = today, scopé école via facture→famille)
        s.from('reglements').select('montant, factures!inner(famille_id, familles!inner(ecole_id))')
          .eq('factures.familles.ecole_id', ecole.id)
          .eq('date_reglement', aujourdhui),
        // Toutes les factures de l'école (vue factures_solde) — sert au "reste à encaisser" et aux retards
        s.from('factures_solde').select('solde_restant, date_emission, statut, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id)
          .neq('statut', 'annule'),
        // Échéances cette semaine
        s.from('cheques_prevus').select('montant, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id).eq('statut', 'prevu')
          .gte('date_echeance', aujourdhui).lte('date_echeance', dansUneSemaine),
        // Échéances en retard
        s.from('cheques_prevus').select('montant, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id).eq('statut', 'prevu')
          .lt('date_echeance', aujourdhui),
        // S3 — threads ouverts + leurs derniers messages pour calc 24h
        s.from('message_threads')
          .select('id, last_message_at, messages(created_at, auteur_profile_id)')
          .eq('ecole_id', ecole.id).eq('statut', 'ouvert'),
        // S4 — alertes
        s.from('demandes_reduction').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).in('statut', ['soumise', 'en_attente', 'soumis', 'en_etude']),
        s.from('contrats_scolarisation').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'soumis'),
        s.from('inscriptions_pedagogiques').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'soumis'),
        s.from('demandes_inscription').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id).eq('statut', 'en_attente')
          .lt('soumis_le', ilYa3jours),
        // S5 — vue d'ensemble
        s.from('familles').select('id', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('enfants').select('id, familles!inner(ecole_id)', { count: 'exact', head: true })
          .eq('familles.ecole_id', ecole.id).neq('statut_inscription', 'sorti'),
        s.from('factures_solde').select('total_facture, total_regle, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecole.id).eq('exercice_id', exerciceId).neq('statut', 'annule'),
      ])

      // S2 — calculs
      const regs = (reglementsJour ?? []) as any[]
      const encaisseAujourdhui = regs.reduce((sum, r) => sum + Number(r.montant || 0), 0)
      const factAll = (facturesAll ?? []) as any[]
      const resteAEncaisser = factAll.reduce((sum, f) => sum + Number(f.solde_restant || 0), 0)
      const retards30 = factAll.filter(f => Number(f.solde_restant) > 0 && f.date_emission && f.date_emission <= ilYa30Jours)
      const echSem = (echeancesSemaine ?? []) as any[]
      const echRetard = (echeancesRetard ?? []) as any[]

      // S3 — messages
      const threads = (threadsOuverts ?? []) as any[]
      let sansReponse24h = 0
      for (const t of threads) {
        if (!t.last_message_at) continue
        if (new Date(t.last_message_at).getTime() < new Date(ilYa24h).getTime()) sansReponse24h++
      }

      // S5 — finances année
      const factEx = (facturesExercice ?? []) as any[]
      const totalFacture = factEx.reduce((sum, f) => sum + Number(f.total_facture || 0), 0)
      const totalRegle = factEx.reduce((sum, f) => sum + Number(f.total_regle || 0), 0)

      setBilan({
        demandesAujourdhui: demJour ?? 0,
        demandesAccepteesAujourdhui: demAccepteesJour ?? 0,
        contratsAujourdhui: contratsJour ?? 0,
        ddrAujourdhui: ddrJour ?? 0,
        encaisseAujourdhui,
        nbPaiementsAujourdhui: regs.length,
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
        totalRestant: totalFacture - totalRegle,
      })
      setDerniereMaj(new Date())
    } finally {
      setLoading(false)
    }
  }, [ecole?.id, exerciceSelectionne])

  useEffect(() => { charger() }, [charger])

  const fmtEur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const fmtDateLongue = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const fmtHeure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  const slug = ecole?.slug || ''
  const go = (href: string) => router.push(`/${slug}/${href}`)

  if (loading && !bilan) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Calcul du bilan…</div>
  }
  if (!bilan) return null

  // Tests "rien à signaler" par section
  const s1Vide = bilan.demandesAujourdhui === 0 && bilan.demandesAccepteesAujourdhui === 0 && bilan.contratsAujourdhui === 0 && bilan.ddrAujourdhui === 0
  const s2Vide = bilan.encaisseAujourdhui === 0 && bilan.nbPaiementsAujourdhui === 0 && bilan.facturesRetard30Count === 0 && bilan.echeancesSemaineCount === 0 && bilan.echeancesRetardCount === 0
  const s3Vide = bilan.conversationsOuvertes === 0 && bilan.conversationsSansReponse24h === 0
  const s4Vide = bilan.ddrEnAttente === 0 && bilan.contratsAValider === 0 && bilan.inscriptionsPedaAValider === 0 && bilan.demandesEnAttenteVieux === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Hero */}
      <div className="bilan-hero" style={{
        background: 'linear-gradient(135deg, #2563EB, #1E40AF)', color: '#fff',
        borderRadius: 14, padding: '20px 22px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>📊 Bilan du jour</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4, textTransform: 'capitalize' }}>
            {fmtDateLongue(derniereMaj)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            {ecole?.nom} · dernière mise à jour {fmtHeure(derniereMaj)}
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={charger} disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
              padding: '9px 16px', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}>
            ↻ Actualiser
          </button>
          <button onClick={() => window.print()}
            style={{
              background: '#fff', color: '#1E40AF',
              border: 'none', borderRadius: 8,
              padding: '9px 16px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
            }}>
            📥 PDF / Imprimer
          </button>
        </div>
      </div>

      {/* Styles d'impression : masque sidebar/header admin pour un PDF propre 1 page */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm 12mm }
          body { background: #fff !important }
          .no-print, aside, nav, header, [class*="EcoleSidebar"], [class*="sidebar"] { display: none !important }
          main { padding: 0 !important; margin: 0 !important; max-width: 100% !important }
          .bilan-section { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border: 1px solid #E2E8F0 !important }
          .bilan-hero { background: #1E40AF !important; -webkit-print-color-adjust: exact; print-color-adjust: exact }
        }
      `}</style>

      {/* Section 1 — Inscriptions du jour */}
      <Section titre="📝 Inscriptions du jour" couleur="#2563EB" vide={s1Vide}>
        <KpiGrid>
          <Kpi label="Demandes reçues" value={bilan.demandesAujourdhui} color="#2563EB" onClick={() => go('demandes-inscription')} />
          <Kpi label="Demandes acceptées" value={bilan.demandesAccepteesAujourdhui} color="#059669" onClick={() => go('demandes-inscription')} />
          <Kpi label="Contrats signés" value={bilan.contratsAujourdhui} color="#2563EB" onClick={() => go('inscriptions')} />
          <Kpi label="DDR soumises" value={bilan.ddrAujourdhui} color="#7C3AED" onClick={() => go('inscriptions?onglet=ddr')} />
        </KpiGrid>
      </Section>

      {/* Section 2 — Paiements & finances */}
      <Section titre="💰 Paiements & finances" couleur="#059669" vide={s2Vide}>
        <KpiGrid>
          <Kpi label="Encaissé aujourd'hui" value={fmtEur(bilan.encaisseAujourdhui)}
            color="#065F46" big onClick={() => go('finances')} />
          <Kpi label="Paiements reçus" value={bilan.nbPaiementsAujourdhui}
            color="#065F46" onClick={() => go('finances')} />
          <Kpi label="Reste à encaisser (année)" value={fmtEur(bilan.resteAEncaisser)}
            color={bilan.resteAEncaisser > 0 ? '#991B1B' : '#065F46'} onClick={() => go('finances')} />
        </KpiGrid>
        <div style={{ height: 12 }} />
        <KpiGrid>
          <Kpi label="Factures impayées >30j"
            value={`${bilan.facturesRetard30Count} · ${fmtEur(bilan.facturesRetard30Montant)}`}
            color={bilan.facturesRetard30Count > 0 ? '#991B1B' : '#065F46'}
            onClick={() => go('finances/relances')} />
          <Kpi label="Échéances cette semaine"
            value={`${bilan.echeancesSemaineCount} · ${fmtEur(bilan.echeancesSemaineMontant)}`}
            color="#1E40AF" onClick={() => go('finances/bordereau')} />
          <Kpi label="Échéances en retard"
            value={`${bilan.echeancesRetardCount} · ${fmtEur(bilan.echeancesRetardMontant)}`}
            color={bilan.echeancesRetardCount > 0 ? '#991B1B' : '#065F46'}
            onClick={() => go('finances/bordereau')} />
        </KpiGrid>
      </Section>

      {/* Section 3 — Messages parents */}
      <Section titre="💬 Messages parents" couleur="#7C3AED" vide={s3Vide}>
        <KpiGrid>
          <Kpi label="Conversations ouvertes" value={bilan.conversationsOuvertes}
            color="#5B21B6" onClick={() => go('messages')} />
          <Kpi label="Sans réponse depuis +24h" value={bilan.conversationsSansReponse24h}
            color={bilan.conversationsSansReponse24h > 0 ? '#991B1B' : '#5B21B6'}
            onClick={() => go('messages')} />
        </KpiGrid>
      </Section>

      {/* Section 4 — Alertes urgentes */}
      <Section titre="🔔 Alertes urgentes (action requise)" couleur="#D97706" vide={s4Vide}
        bg={s4Vide ? undefined : '#FFFBEB'} border={s4Vide ? undefined : '#FDE68A'}>
        <KpiGrid>
          <Kpi label="DDR à traiter" value={bilan.ddrEnAttente}
            color={bilan.ddrEnAttente > 0 ? '#92400E' : '#059669'}
            onClick={() => go('inscriptions?onglet=ddr')} />
          <Kpi label="Contrats à valider" value={bilan.contratsAValider}
            color={bilan.contratsAValider > 0 ? '#92400E' : '#059669'}
            onClick={() => go('inscriptions?onglet=contrats')} />
          <Kpi label="Fiches pédago à valider" value={bilan.inscriptionsPedaAValider}
            color={bilan.inscriptionsPedaAValider > 0 ? '#92400E' : '#059669'}
            onClick={() => go('inscriptions?onglet=pedagogique')} />
          <Kpi label="Demandes en attente >3j" value={bilan.demandesEnAttenteVieux}
            color={bilan.demandesEnAttenteVieux > 0 ? '#991B1B' : '#059669'}
            onClick={() => go('demandes-inscription')} />
        </KpiGrid>
      </Section>

      {/* Section 5 — Vue d'ensemble année */}
      <Section titre={`📅 Vue d'ensemble — ${annee}`} couleur="#475569">
        <KpiGrid>
          <Kpi label="Familles actives" value={bilan.totalFamilles}
            color="#1E293B" onClick={() => go('familles')} />
          <Kpi label="Élèves inscrits" value={bilan.totalEleves}
            color="#1E293B" onClick={() => go('enfants')} />
        </KpiGrid>
        <div style={{ height: 12 }} />
        <KpiGrid>
          <Kpi label="Total facturé" value={fmtEur(bilan.totalFacture)}
            color="#1E293B" onClick={() => go('finances')} />
          <Kpi label="Total réglé" value={fmtEur(bilan.totalRegle)}
            color="#065F46" onClick={() => go('finances')} />
          <Kpi label="Reste à encaisser" value={fmtEur(bilan.totalRestant)}
            color={bilan.totalRestant > 0 ? '#991B1B' : '#065F46'}
            onClick={() => go('finances/relances')} />
        </KpiGrid>
      </Section>

      <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
        Données live au {derniereMaj.toLocaleString('fr-FR')}
      </div>
    </div>
  )
}

// — composants internes —

function Section({
  titre, couleur, children, vide, bg, border,
}: {
  titre: string; couleur: string; children: React.ReactNode; vide?: boolean
  bg?: string; border?: string
}) {
  return (
    <div className="bilan-section" style={{
      background: bg || '#fff',
      border: `1px solid ${border || '#E2E8F0'}`,
      borderRadius: 12, padding: 18,
    }}>
      <h2 style={{
        fontSize: 14, fontWeight: 700, color: couleur, margin: 0, marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span>{titre}</span>
      </h2>
      {vide ? (
        <div style={{ fontSize: 13, color: '#94A3B8', padding: '8px 4px' }}>
          Rien à signaler ✓
        </div>
      ) : children}
    </div>
  )
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      {children}
    </div>
  )
}

function Kpi({
  label, value, color, onClick, big,
}: {
  label: string; value: number | string; color: string; onClick?: () => void; big?: boolean
}) {
  const inner = (
    <>
      <div style={{
        fontSize: big ? 28 : 22, fontWeight: 800, color, lineHeight: 1.1,
      }}>{value}</div>
      <div style={{
        fontSize: 12, color: '#64748B', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6,
      }}>{label}</div>
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10,
        padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0' }}
      >
        {inner}
      </button>
    )
  }
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '14px 16px' }}>
      {inner}
    </div>
  )
}
