'use client'
/**
 * AlertesUrgentes — widget dashboard école.
 *
 * Affiche une bannière unique avec les actions prioritaires que l'admin
 * a oubliées ou doit traiter. Calcul live depuis Supabase :
 *  - Demandes de réduction soumises, sur l'année d'INSCRIPTION (comme /a-traiter)
 *  - Contrats de scolarisation N+1 soumis non validés, même année (comme /a-traiter)
 *  - Demandes d'inscription externes en attente
 *  - Familles DISTINCTES en retard REEL (du a date > 0 : echeances echues non
 *    couvertes) — dédupliquées par famille_id, jamais un comptage de factures
 *  - Chèques prévus à encaisser ce mois (date_echeance dans le mois courant)
 *
 * Si rien d'urgent, affiche un message positif "Tout est à jour".
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { calcDuADateBatch } from '@/lib/du-a-date'
import { getExerciceInscription } from '@/lib/annee-inscription'

type Alerte = {
  icon: string
  label: string
  count: number
  href: string
  couleur: 'rouge' | 'orange' | 'bleu'
}

export default function AlertesUrgentes({ ecoleId, ecoleSlug }: { ecoleId: string; ecoleSlug: string }) {
  const router = useRouter()
  const [alertes, setAlertes] = useState<Alerte[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ecoleId) return
    ;(async () => {
      const s = createClient()
      const now = new Date()
      const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const moisFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      // FIX audit 28/07 : DDR et contrats sont filtrés sur l'ANNÉE D'INSCRIPTION,
      // exactement comme l'inbox /a-traiter (a-traiter/page.tsx:42-47, même helper).
      // Sans ce filtre, cette bannière comptait aussi les objets des années
      // précédentes et affichait des nombres différents de /a-traiter.
      const { code: anneeInscription } = await getExerciceInscription(s, ecoleId)

      const [
        { count: ddrCount },
        { count: contratCount },
        { count: demandesCount },
        { data: factAvecSolde },
        { count: chequesCount },
      ] = await Promise.all([
        // FIX audit 27/07 : le portail ecrit 'soumis' (masculin) -> l'alerte ne se
        // declenchait jamais avec ['soumise','en_attente']. Couvre les deux + en_etude.
        // La liste de statuts reste volontairement un SUR-ENSEMBLE de celle de
        // /a-traiter (['soumis','en_etude']) : mieux vaut sur-alerter que masquer
        // une demande jamais traitée écrite avec l'ancienne orthographe.
        s.from('demandes_reduction').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecoleId).eq('annee_scolaire', anneeInscription)
          .in('statut', ['soumis', 'soumise', 'en_attente', 'en_etude']),
        s.from('contrats_scolarisation').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecoleId).eq('annee_scolaire', anneeInscription).eq('statut', 'soumis'),
        s.from('demandes_inscription').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecoleId).eq('statut', 'en_attente'),
        // Candidats retard : factures avec solde. Le VRAI retard est calcule ensuite
        // via du-a-date (echeances echues non couvertes), pas date_emission + 30j
        // qui marquait "en retard" toute facture annuelle emise 30j avant.
        // `famille_id` est nécessaire pour dédupliquer par FAMILLE (cf. plus bas).
        s.from('factures_solde').select('id, famille_id, familles!inner(ecole_id)')
          .eq('familles.ecole_id', ecoleId)
          .gt('solde_restant', 0)
          .neq('statut', 'annule'),
        // Alerte "chèques à encaisser ce mois" -> uniquement les vrais chèques (l'action
        // pointe vers le bordereau de remise qui n'accepte que des chèques physiques).
        s.from('cheques_prevus').select('id, familles!inner(ecole_id)', { count: 'exact', head: true })
          .eq('familles.ecole_id', ecoleId)
          .eq('statut', 'prevu')
          .in('mode_paiement', ['cheque', 'cheque_caution'])
          .gte('date_echeance', moisDebut).lte('date_echeance', moisFin),
      ])

      // Vrai retard : du a date > 0 uniquement.
      // FIX audit 28/07 : `duMap` est indexée PAR FACTURE — on comptait donc des
      // factures en les libellant « familles » (une famille avec 3 factures était
      // comptée 3 fois). On déduplique par `famille_id`, comme
      // finances/dashboard/page.tsx.
      const factures = (factAvecSolde ?? []) as any[]
      const familleParFacture: Record<string, string> = {}
      for (const f of factures) {
        if (f.id && f.famille_id) familleParFacture[f.id] = f.famille_id
      }
      const famillesEnRetard = new Set<string>()
      const idsAvecSolde = factures.map(f => f.id).filter(Boolean)
      if (idsAvecSolde.length > 0) {
        const duMap = await calcDuADateBatch(s, idsAvecSolde)
        for (const [factureId, r] of Object.entries(duMap)) {
          if (!r.enRetard) continue
          const fid = familleParFacture[factureId]
          if (fid) famillesEnRetard.add(fid)
        }
      }
      const famillesEnRetardCount = famillesEnRetard.size

      const list: Alerte[] = []
      if ((ddrCount ?? 0) > 0) list.push({ icon: '🧾', label: 'demande(s) de réduction à traiter', count: ddrCount!, href: `/${ecoleSlug}/inscriptions?onglet=ddr`, couleur: 'orange' })
      if ((contratCount ?? 0) > 0) list.push({ icon: '📝', label: 'contrat(s) N+1 à valider', count: contratCount!, href: `/${ecoleSlug}/inscriptions?onglet=contrats`, couleur: 'orange' })
      if ((demandesCount ?? 0) > 0) list.push({ icon: '📨', label: 'demande(s) d\'inscription externe en attente', count: demandesCount!, href: `/${ecoleSlug}/demandes-inscription`, couleur: 'bleu' })
      if (famillesEnRetardCount > 0) list.push({ icon: '💰', label: 'famille(s) en retard sur échéance', count: famillesEnRetardCount, href: `/${ecoleSlug}/finances/relances`, couleur: 'rouge' })
      if ((chequesCount ?? 0) > 0) list.push({ icon: '✉️', label: 'chèque(s) à encaisser ce mois', count: chequesCount!, href: `/${ecoleSlug}/finances/bordereau`, couleur: 'bleu' })

      setAlertes(list)
      setLoading(false)
    })()
  }, [ecoleId, ecoleSlug])

  if (loading) return null
  if (alertes.length === 0) {
    return (
      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 18 }}>✓</span>
        <div style={{ fontSize: 13, color: '#065F46' }}>
          <strong>Tout est à jour.</strong> Aucune action urgente à traiter aujourd'hui.
        </div>
      </div>
    )
  }

  const palette = {
    rouge: { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B', accent: '#DC2626' },
    orange: { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E', accent: '#D97706' },
    bleu: { bg: '#EFF6FF', border: '#BFDBFE', fg: '#1E40AF', accent: '#2563EB' },
  } as const

  // Couleur dominante = la plus grave présente
  const dominante = alertes.find(a => a.couleur === 'rouge') ? 'rouge' : alertes.find(a => a.couleur === 'orange') ? 'orange' : 'bleu'
  const p = palette[dominante]

  return (
    <div style={{ background: p.bg, border: '1px solid', borderColor: p.border, borderRadius: 12, padding: '14px 18px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: p.fg, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🔔</span>
          <span>Actions prioritaires ({alertes.reduce((s, a) => s + a.count, 0)})</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alertes.map((a, i) => {
          const ap = palette[a.couleur]
          return (
            <button key={i} onClick={() => router.push(a.href)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid', borderColor: ap.border, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 16 }}>{a.icon}</span>
              <span style={{ fontSize: 13, color: ap.fg, fontWeight: 600 }}>{a.count}</span>
              <span style={{ fontSize: 13, color: '#475569', flex: 1 }}>{a.label}</span>
              <span style={{ fontSize: 12, color: ap.accent }}>→</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
