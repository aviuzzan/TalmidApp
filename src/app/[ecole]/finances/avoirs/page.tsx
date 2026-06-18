'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { useExercice } from '@/lib/exercice-context'
import ModalAvoir from '@/components/finances/ModalAvoir'

/**
 * Page liste des Avoirs (notes de crédit) — vue école.
 * Statuts BDD : actif | partiellement_utilise | utilise | expire | annule
 */
export default function AvoirsPage() {
  const router = useRouter()
  const ecole = useEcole()
  const { exerciceSelectionne } = useExercice()
  const [avoirs, setAvoirs] = useState<any[]>([])
  const [familles, setFamilles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filtre, setFiltre] = useState<'tous' | 'actif' | 'partiellement_utilise' | 'utilise' | 'expire' | 'annule'>('tous')
  const [recherche, setRecherche] = useState('')

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id, exerciceSelectionne?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    // On utilise la vue avoirs_solde qui expose montant_disponible
    const [{ data: av }, { data: fams }] = await Promise.all([
      s.from('avoirs_solde')
        .select('*, familles(nom, numero, parent1_prenom, parent1_nom)')
        .eq('ecole_id', ecole.id)
        .order('date_emission', { ascending: false }),
      s.from('familles').select('id, nom, numero, parent1_prenom, parent1_nom').eq('ecole_id', ecole.id).order('nom'),
    ])
    setAvoirs(av ?? [])
    setFamilles(fams ?? [])
    setLoading(false)
  }

  function statutBadge(s: string) {
    const map: Record<string, { label: string; bg: string; fg: string }> = {
      actif: { label: 'Actif', bg: '#ECFDF5', fg: '#065F46' },
      partiellement_utilise: { label: 'Partiel', bg: '#FEF3C7', fg: '#92400E' },
      utilise: { label: 'Utilisé', bg: '#F1F5F9', fg: '#475569' },
      expire: { label: 'Expiré', bg: '#FEE2E2', fg: '#991B1B' },
      annule: { label: 'Annulé', bg: '#FEE2E2', fg: '#991B1B' },
    }
    const m = map[s] || { label: s, bg: '#F1F5F9', fg: '#64748B' }
    return <span style={{ background: m.bg, color: m.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>{m.label}</span>
  }

  const filtres = avoirs.filter(a => {
    if (filtre !== 'tous' && a.statut !== filtre) return false
    if (recherche) {
      const q = recherche.toLowerCase()
      const nomFam = (a.familles?.nom || '').toLowerCase()
      const num = (a.numero || '').toLowerCase()
      const motif = (a.motif || '').toLowerCase()
      return nomFam.includes(q) || num.includes(q) || motif.includes(q)
    }
    return true
  })

  const totalDispo = avoirs
    .filter(a => a.statut === 'actif' || a.statut === 'partiellement_utilise')
    .reduce((s, a) => s + Number(a.montant_disponible || 0), 0)

  const stats = [
    { label: 'Total avoirs', value: avoirs.length, color: '#1E293B' },
    { label: 'Actifs', value: avoirs.filter(a => a.statut === 'actif').length, color: '#065F46' },
    { label: 'Utilisés', value: avoirs.filter(a => a.statut === 'utilise').length, color: '#475569' },
    { label: 'Disponible à imputer', value: `${totalDispo.toLocaleString('fr-FR')} €`, color: '#7C2D12' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🎁 Avoirs</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
            Notes de crédit émises aux familles. Utilisables sur une facture en cours ou remboursables.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Nouvel avoir
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher par numéro, famille, motif..."
          style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#fff' }} />
        {(['tous', 'actif', 'partiellement_utilise', 'utilise', 'annule'] as const).map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            style={{ padding: '8px 14px', border: filtre === f ? 'none' : '1px solid #E2E8F0', background: filtre === f ? '#1E293B' : '#fff', color: filtre === f ? '#fff' : '#475569', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {f === 'tous' ? 'Tous' : f === 'actif' ? 'Actifs' : f === 'partiellement_utilise' ? 'Partiels' : f === 'utilise' ? 'Utilisés' : 'Annulés'}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>
        ) : filtres.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            {avoirs.length === 0 ? 'Aucun avoir émis pour l\'instant.' : 'Aucun résultat pour ces filtres.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['N°', 'Date', 'Famille', 'Motif', 'Montant', 'Disponible', 'Statut', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtres.map((a, i) => {
                const dispo = Number(a.montant_disponible || 0)
                return (
                  <tr key={a.id} style={{ borderBottom: i < filtres.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{a.numero || a.id.substring(0, 8)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>
                      {a.date_emission ? new Date(a.date_emission).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{a.familles?.nom || '—'}</div>
                      {a.familles?.numero && <div style={{ fontSize: 11, color: '#94A3B8' }}>N° {a.familles.numero}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#1E293B', maxWidth: 220 }}>{a.motif || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{Number(a.montant).toLocaleString('fr-FR')} €</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: dispo > 0 ? '#059669' : '#94A3B8' }}>
                      {dispo.toLocaleString('fr-FR')} €
                    </td>
                    <td style={{ padding: '12px 14px' }}>{statutBadge(a.statut)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => router.push(`/${ecole.slug}/familles/${a.famille_id}/avoirs`)}
                        style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Détail →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ModalAvoir
          ecoleId={ecole.id}
          exerciceId={exerciceSelectionne?.id}
          familles={familles}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
