'use client'
/**
 * AlertesUrgentes — widget dashboard école.
 *
 * Affiche une bannière unique avec les actions prioritaires que l'admin
 * a oubliées ou doit traiter. Calcul live depuis Supabase :
 *  - Demandes de réduction soumises (statut = 'soumise' / 'en_attente')
 *  - Contrats de scolarisation N+1 soumis non validés
 *  - Demandes d'inscription externes en attente
 *  - Factures en retard (date d'émission > 30j et solde_restant > 0)
 *  - Chèques prévus à encaisser ce mois (date_echeance dans le mois courant)
 *
 * Si rien d'urgent, affiche un message positif "Tout est à jour".
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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
      const il30Joursj = new Date(now.getTime() - 30 * 86400 * 1000).toISOString().slice(0, 10)
      const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const moisFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

      const [
        { count: ddrCount },
        { count: contratCount },
        { count: demandesCount },
        { count: factCount },
        { count: chequesCount },
      ] = await Promise.all([
        s.from('demandes_reduction').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecoleId).in('statut', ['soumise', 'en_attente']),
        s.from('contrats_scolarisation').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecoleId).eq('statut', 'soumis'),
        s.from('demandes_inscription').select('id', { count: 'exact', head: true })
          .eq('ecole_id', ecoleId).eq('statut', 'en_attente'),
        s.from('factures_solde').select('id, familles!inner(ecole_id)', { count: 'exact', head: true })
          .eq('familles.ecole_id', ecoleId)
          .gt('solde_restant', 0)
          .lte('date_emission', il30Joursj)
          .neq('statut', 'annule'),
        s.from('cheques_prevus').select('id, familles!inner(ecole_id)', { count: 'exact', head: true })
          .eq('familles.ecole_id', ecoleId)
          .eq('statut', 'prevu')
          .gte('date_echeance', moisDebut).lte('date_echeance', moisFin),
      ])

      const list: Alerte[] = []
      if ((ddrCount ?? 0) > 0) list.push({ icon: '🧾', label: 'demande(s) de réduction à traiter', count: ddrCount!, href: `/${ecoleSlug}/inscriptions?onglet=ddr`, couleur: 'orange' })
      if ((contratCount ?? 0) > 0) list.push({ icon: '📝', label: 'contrat(s) N+1 à valider', count: contratCount!, href: `/${ecoleSlug}/inscriptions?onglet=contrats`, couleur: 'orange' })
      if ((demandesCount ?? 0) > 0) list.push({ icon: '📨', label: 'demande(s) d\'inscription externe en attente', count: demandesCount!, href: `/${ecoleSlug}/demandes-inscription`, couleur: 'bleu' })
      if ((factCount ?? 0) > 0) list.push({ icon: '💰', label: 'facture(s) en retard > 30 jours', count: factCount!, href: `/${ecoleSlug}/finances/relances`, couleur: 'rouge' })
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
