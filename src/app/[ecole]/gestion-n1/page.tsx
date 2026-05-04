'use client'
import { useEffect, useState } from 'react'
import { useEcole } from '@/lib/ecole-context'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function GestionN1Page() {
  const router = useRouter()
  const ecole = useEcole()
  const [enfants, setEnfants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient().from('enfants')
      .select('*, familles(nom, numero)')
      .eq('annee_scolaire', '2026/2027')
      .order('nom')
      .then(({ data }) => { setEnfants(data ?? []); setLoading(false) })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Gestion N+1</h1>
          <p style={{ color: '#64748B', fontSize: 13 }}>Inscriptions pour l'année 2026/2027</p>
        </div>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
          📅 2026 / 2027
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['Élève', 'Classe', 'Famille', 'Statut', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</td></tr>
            ) : enfants.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ color: '#CBD5E1', fontSize: 14 }}>Aucune inscription N+1 pour l'instant</div>
                  <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 6 }}>
                    Pour inscrire un élève en N+1, allez dans la fiche famille → onglet Élèves → choisir "2026/2027"
                  </div>
                </td>
              </tr>
            ) : enfants.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: i < enfants.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <td style={{ padding: '13px 16px', fontWeight: 600 }}>{e.prenom} {e.nom}</td>
                <td style={{ padding: '13px 16px', color: '#475569' }}>{e.classe ?? '—'}</td>
                <td style={{ padding: '13px 16px' }}>
                  <button onClick={() => router.push(`/${ecole.slug}/familles/${e.famille_id}`)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', fontSize: 13, fontWeight: 500 }}>
                    {e.familles?.nom} ({e.familles?.numero})
                  </button>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    background: e.statut_inscription === 'inscrit' ? '#ECFDF5' : '#FFFBEB',
                    color: e.statut_inscription === 'inscrit' ? '#059669' : '#D97706',
                    borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  }}>
                    {e.statut_inscription === 'inscrit' ? '✓ Inscrit' : '⏳ En attente'}
                  </span>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <button onClick={() => router.push(`/${ecole.slug}/familles/${e.famille_id}`)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}>
                    Voir fiche →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
