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
import { getExerciceInscription } from '@/lib/annee-inscription'

type Bilan = {
  demandesAujourdhui: number
  demandesAccepteesAujourdhui: number
  contratsAujourdhui: number
  ddrAujourdhui: number
  // Avancement rentrée (année d'inscription en cours)
  contratsSignes: number
  enfantsAvecContrat: number
  contratsManquants: number
  enfantsSansContrat: number
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
  const [anneeInscription, setAnneeInscription] = useState<string>('')

  // Résolution de l'année d'inscription (prochaine rentrée) pour les KPIs dédiés
  useEffect(() => {
    if (!ecole?.id) return
    getExerciceInscription(createClient(), ecole.id).then(r => setAnneeInscription(r.code))
  }, [ecole?.id])

  const charger = useCallback(async () => {
    if (!ecole?.id || !exerciceSelectionne) return
    if (!anneeInscription) return
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
        { data: contratsRentree },
        { count: enfantsContratRentree },
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
        // Avancement rentrée — contrats signés (statuts soumis/valide/accepte) sur l'année d'inscription
        s.from('contrats_scolarisation')
          .select('id, famille_id')
          .eq('ecole_id', ecole.id)
          .eq('annee_scolaire', anneeInscription)
          .in('statut', ['soumis', 'valide', 'accepte']),
        // Enfants liés à un contrat signé (count via jointure inner)
        s.from('contrat_enfants')
          .select('id, contrats_scolarisation!inner(ecole_id, annee_scolaire, statut)', { count: 'exact', head: true })
          .eq('contrats_scolarisation.ecole_id', ecole.id)
          .eq('contrats_scolarisation.annee_scolaire', anneeInscription)
          .in('contrats_scolarisation.statut', ['soumis', 'valide', 'accepte']),
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

      // Avancement rentrée — agrégations JS (cf. page principale)
      const contratsR = (contratsRentree ?? []) as any[]
      const contratsSignes = contratsR.length
      const enfantsAvecContrat = enfantsContratRentree ?? 0
      const famillesAvecContratSigne = new Set(contratsR.map(c => c.famille_id).filter(Boolean)).size
      const totalFam = famN ?? 0
      const totalEle = eleN ?? 0
      const contratsManquants = Math.max(0, totalFam - famillesAvecContratSigne)
      const enfantsSansContrat = Math.max(0, totalEle - enfantsAvecContrat)

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
        contratsSignes,
        enfantsAvecContrat,
        contratsManquants,
        enfantsSansContrat,
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
  }, [ecole?.id, exerciceSelectionne, anneeInscription])

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
        @page { size: A4; margin: 8mm 10mm }
        body { background: #F1F5F9; margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1E293B }
        .wrap { max-width: 780px; margin: 24px auto; background: #fff; padding: 14px 18px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border-radius: 4px }
        .toolbar { max-width: 780px; margin: 0 auto 8px; display: flex; gap: 10px; padding: 0 8px }
        .toolbar button { background: #2563EB; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer }
        .toolbar a { color: #64748B; text-decoration: none; padding: 10px 18px; font-size: 13px; align-self: center }
        @media print {
          html, body { height: 100%; background: #fff }
          .wrap {
            box-shadow: none; padding: 0; max-width: 100%; margin: 0; border-radius: 0;
            max-height: 273mm; overflow: hidden;
          }
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
        {/* Header compact — école + titre + date (sans bande pleine couleur) */}
        <div className="header-bar" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 6, gap: 10, paddingBottom: 6,
          borderBottom: '2px solid #2563EB',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ecole?.logo_url && (
              <img src={ecole.logo_url} alt="" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 4 }} />
            )}
            <div>
              <div style={{ fontSize: 8, color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.2 }}>{ecole?.nom}</div>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '0.02em', color: '#1E40AF', lineHeight: 1.15 }}>
                BILAN DU JOUR
              </h1>
              <div style={{ fontSize: 9, color: '#475569', marginTop: 1, textTransform: 'capitalize', lineHeight: 1.2 }}>{fmtDateLongue(genereLe)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 8, color: '#64748B', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600 }}>Exercice {annee}</div>
            <div>Édité le {fmtDateHeure(genereLe)}</div>
          </div>
        </div>

        {/* Ligne 1 : Inscriptions + Avancement rentrée — côte à côte 50/50 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {/* Section 1 — Inscriptions */}
          <Section titre="Inscriptions du jour" couleur="#2563EB" bg="#EFF6FF" border="#BFDBFE">
            <KpiGrid cols={2}>
              <Kpi label="Demandes reçues" value={fmtNum(bilan.demandesAujourdhui)} color="#2563EB" />
              <Kpi label="Demandes acceptées" value={fmtNum(bilan.demandesAccepteesAujourdhui)} color="#059669" />
              <Kpi label="Contrats signés" value={fmtNum(bilan.contratsAujourdhui)} color="#2563EB" />
              <Kpi label="DDR soumises" value={fmtNum(bilan.ddrAujourdhui)} color="#7C3AED" />
            </KpiGrid>
          </Section>

          {/* Section 2 — Avancement rentrée */}
          <Section titre={`Avancement rentrée ${anneeInscription || ''}`} couleur="#1E40AF" bg="#EFF6FF" border="#BFDBFE">
            <KpiGrid cols={2}>
              <Kpi label="Contrats signés" value={fmtNum(bilan.contratsSignes)} color="#065F46" />
              <Kpi label="Enfants ✓" value={fmtNum(bilan.enfantsAvecContrat)} color="#065F46" />
              <Kpi label="Contrats à signer" value={fmtNum(bilan.contratsManquants)}
                color={bilan.contratsManquants > 0 ? '#92400E' : '#065F46'} />
              <Kpi label="Enfants restants" value={fmtNum(bilan.enfantsSansContrat)}
                color={bilan.enfantsSansContrat > 0 ? '#92400E' : '#065F46'} />
            </KpiGrid>
            <div style={{ marginTop: 4, fontSize: 9, color: '#1E3A8A', lineHeight: 1.3 }}>
              <strong>{bilan.contratsSignes}</strong> signés / <strong>{bilan.enfantsAvecContrat}</strong> enfants —
              reste <strong>{bilan.contratsManquants}</strong> contrats / <strong>{bilan.enfantsSansContrat}</strong> enfants.
            </div>
          </Section>
        </div>

        {/* Section — Paiements & finances (pleine largeur) */}
        <div style={{ marginBottom: 6 }}>
          <Section titre="Paiements & finances" couleur="#059669" bg="#ECFDF5" border="#A7F3D0">
            <KpiGrid cols={4}>
              <Kpi label="Encaissé aujourd'hui" value={fmtEur(bilan.encaisseAujourdhui)} color="#065F46" />
              <Kpi label="Paiements reçus" value={fmtNum(bilan.nbPaiementsAujourdhui)} color="#065F46" />
              <Kpi label={`Avoirs imputés (${bilan.nbAvoirsImputesAujourdhui})`}
                value={fmtEur(bilan.avoirsImputesAujourdhui)} color="#7C3AED" />
              <Kpi label="Reste à encaisser" value={fmtEur(bilan.resteAEncaisser)}
                color={bilan.resteAEncaisser > 0 ? '#991B1B' : '#065F46'} />
              <Kpi label={`Impayés >30j (${bilan.facturesRetard30Count})`}
                value={fmtEur(bilan.facturesRetard30Montant)}
                color={bilan.facturesRetard30Count > 0 ? '#991B1B' : '#065F46'} />
              <Kpi label={`Échéances 7j (${bilan.echeancesSemaineCount})`}
                value={fmtEur(bilan.echeancesSemaineMontant)} color="#1E40AF" />
              <Kpi label={`Échéances en retard (${bilan.echeancesRetardCount})`}
                value={fmtEur(bilan.echeancesRetardMontant)}
                color={bilan.echeancesRetardCount > 0 ? '#991B1B' : '#065F46'} />
              <Kpi label="Total échéances à venir" value={fmtEur(bilan.echeancesSemaineMontant + bilan.echeancesRetardMontant)} color="#1E40AF" />
            </KpiGrid>
          </Section>
        </div>

        {/* Ligne 3 : Messages + Alertes — côte à côte 50/50 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {/* Section — Messages parents */}
          <Section titre="Messages parents" couleur="#7C3AED" bg="#F5F3FF" border="#DDD6FE">
            <KpiGrid cols={2}>
              <Kpi label="Conversations ouvertes" value={fmtNum(bilan.conversationsOuvertes)} color="#5B21B6" />
              <Kpi label="Sans réponse +24h" value={fmtNum(bilan.conversationsSansReponse24h)}
                color={bilan.conversationsSansReponse24h > 0 ? '#991B1B' : '#5B21B6'} />
            </KpiGrid>
          </Section>

          {/* Section — Alertes urgentes */}
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

        {/* Section — Vue d'ensemble (pleine largeur, 5 col) */}
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

        {/* Footer compact */}
        <div style={{
          marginTop: 6, paddingTop: 4, borderTop: '1px solid #E2E8F0',
          fontSize: 7, color: '#94A3B8', textAlign: 'center', lineHeight: 1.3,
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
      borderRadius: 5, padding: '5px 7px',
    }}>
      <h2 style={{
        fontSize: 9, fontWeight: 700, color: couleur, margin: 0, marginBottom: 4,
        textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.1,
      }}>{titre}</h2>
      {children}
    </div>
  )
}

function KpiGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
      {children}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  // Adapter la taille de police à la longueur de la valeur (montants en € prennent plus de place)
  const valStr = String(value)
  const fontSize = valStr.length > 12 ? 11 : valStr.length > 9 ? 13 : 15
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '4px 5px' }}>
      <div style={{ fontSize, fontWeight: 800, color, lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontSize: 7, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em', marginTop: 1, lineHeight: 1.15 }}>
        {label}
      </div>
    </div>
  )
}
