'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * Bouton "Réinscrire pour année N+1" — à placer dans la fiche famille.
 * Au clic, ouvre un mini-modal pour choisir l'exercice cible puis appelle l'API.
 */
export default function BoutonReinscription({ familleId, ecoleSlug, exercicesDisponibles }: {
  familleId: string
  ecoleSlug: string
  exercicesDisponibles: { code: string; libelle?: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [exerciceCible, setExerciceCible] = useState('')
  const [working, setWorking] = useState(false)
  const [msg, setMsg] = useState('')

  // Année suivante par défaut
  function anneeSuivante(): string {
    const now = new Date()
    const yStart = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()
    return `${yStart}-${yStart + 1}`
  }

  async function reinscrire() {
    if (!exerciceCible) { setMsg('Sélectionnez une année cible'); return }
    setWorking(true); setMsg('')
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { setWorking(false); setMsg('Session expirée'); return }

    const res = await fetch('/api/admin/reinscrire-famille', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ familleId, exerciceCible }),
    })
    const data = await res.json()
    setWorking(false)

    if (!res.ok) {
      setMsg('Erreur : ' + (data.error || 'inconnue'))
      if (data.existingContratId) {
        setTimeout(() => router.push(`/${ecoleSlug}/familles/${familleId}/contrat?id=${data.existingContratId}`), 2000)
      }
      return
    }

    setMsg(`✓ ${data.message}`)
    setTimeout(() => {
      setOpen(false)
      router.push(`/${ecoleSlug}/familles/${familleId}`)
    }, 1500)
  }

  function ouvrir() {
    const suivante = anneeSuivante()
    const dispo = exercicesDisponibles.find(e => e.code === suivante)
    setExerciceCible(dispo?.code || exercicesDisponibles[0]?.code || '')
    setMsg('')
    setOpen(true)
  }

  return (
    <>
      <button onClick={ouvrir}
        style={{
          background: '#7C3AED', color: '#fff', border: 'none',
          borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
        🔄 Réinscrire pour N+1
      </button>

      {open && (
        <div onClick={() => !working && setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 6 }}>🔄 Réinscription</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0, marginBottom: 16 }}>
              Crée un nouveau contrat brouillon pour l&apos;année cible. Les enfants du contrat précédent sont automatiquement repris, ainsi que les choix de base (mode règlement, nb échéances, assurance).
            </p>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Année scolaire cible</label>
            <select value={exerciceCible} onChange={e => setExerciceCible(e.target.value)} disabled={working}
              style={{ width: '100%', padding: '10px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
              <option value="">— Sélectionner —</option>
              {exercicesDisponibles.map(e => (
                <option key={e.code} value={e.code}>{e.libelle || e.code}</option>
              ))}
            </select>

            {msg && (
              <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, background: msg.startsWith('✓') ? '#ECFDF5' : '#FEF2F2', color: msg.startsWith('✓') ? '#065F46' : '#991B1B' }}>{msg}</div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} disabled={working}
                style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={reinscrire} disabled={working || !exerciceCible} className="btn-primary">
                {working ? 'Création...' : 'Créer la réinscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
