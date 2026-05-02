'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function PortailEnfantsPage() {
  const [enfants, setEnfants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles').select('famille_id').eq('id', session.user.id).single()
      if (!profile?.famille_id) { setLoading(false); return }

      const { data } = await supabase
        .from('enfants').select('*')
        .eq('famille_id', profile.famille_id)
        .order('nom')

      setEnfants(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const REGIME: any = { demi_pension: 'Demi-pension', externe: 'Externe', interne: 'Interne' }

  if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: 40 }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>Mes enfants</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>{enfants.length} élève{enfants.length > 1 ? 's' : ''} enregistré{enfants.length > 1 ? 's' : ''}</p>
      </div>

      {enfants.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#94A3B8' }}>
          Aucun élève enregistré
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {enfants.map(e => (
            <div key={e.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                    {e.genre === 'M' ? '👦' : e.genre === 'F' ? '👧' : '🧒'}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>
                      {e.prenom} {e.deuxieme_prenom ? `(${e.deuxieme_prenom})` : ''} {e.nom}
                    </h2>
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {e.date_naissance && <span style={{ marginRight: 12 }}>🎂 {new Date(e.date_naissance).toLocaleDateString('fr-FR')}</span>}
                      {e.lieu_naissance && <span>📍 {e.lieu_naissance}</span>}
                    </div>
                  </div>
                </div>
                <span style={{
                  background: e.statut_inscription === 'inscrit' ? '#ECFDF5' : '#FFFBEB',
                  color: e.statut_inscription === 'inscrit' ? '#059669' : '#D97706',
                  borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                }}>
                  {e.statut_inscription === 'inscrit' ? '✓ Inscrit' : '⏳ En attente'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
                {[
                  ['📚 Classe', e.classe ?? '—'],
                  ['🍽 Régime', REGIME[e.regime] ?? e.regime ?? '—'],
                  ['📅 Année', e.annee_scolaire ?? '—'],
                  ['📅 Entrée', e.date_entree ? new Date(e.date_entree).toLocaleDateString('fr-FR') : '—'],
                  ['🚌 Transport', e.transport ?? 'Aucun'],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
