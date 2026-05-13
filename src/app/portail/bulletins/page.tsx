'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const TRIMESTRES = ['', '1er trimestre', '2e trimestre', '3e trimestre']

type Bulletin = {
  id: string
  enfant_id: string
  trimestre: number
  moyenne_generale: number | null
  created_at: string
  enfants?: any
  exercices?: any
}

export default function PortailBulletinsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [bulletins, setBulletins] = useState<Bulletin[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }

    const { data: enfants } = await s.from('enfants').select('id').eq('famille_id', profile.famille_id)
    const enfantIds = (enfants ?? []).map((e: any) => e.id)
    if (enfantIds.length === 0) { setLoading(false); return }

    const { data: bul } = await s.from('bulletins')
      .select('id, enfant_id, trimestre, moyenne_generale, created_at, enfants(prenom, nom), exercices(code)')
      .in('enfant_id', enfantIds)
      .eq('visible_famille', true)
      .order('created_at', { ascending: false })

    setBulletins((bul ?? []) as unknown as Bulletin[])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  // Group bulletins par enfant
  const parEnfant: Record<string, { nom: string; bulletins: Bulletin[] }> = {}
  for (const b of bulletins) {
    const key = b.enfant_id
    const nom = b.enfants ? b.enfants.prenom + ' ' + b.enfants.nom : 'Élève'
    if (!parEnfant[key]) parEnfant[key] = { nom, bulletins: [] }
    parEnfant[key].bulletins.push(b)
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 48px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>📋 Bulletins scolaires</h1>
        <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>Les bulletins de vos enfants, par trimestre</p>
      </div>

      {Object.keys(parEnfant).length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          Aucun bulletin disponible pour le moment.
        </div>
      ) : Object.entries(parEnfant).map(([enfantId, { nom, bulletins: bs }]) => (
        <div key={enfantId} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#DBEAFE', color: '#1E40AF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
              {nom[0]}
            </span>
            {nom}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bs.map(b => (
              <div key={b.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: '#EFF6FF', color: '#1E40AF', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                      {TRIMESTRES[b.trimestre] || 'Trim. ?'}
                    </span>
                    {b.exercices?.code && (
                      <span style={{ fontSize: 11, color: '#64748B' }}>📅 {b.exercices.code}</span>
                    )}
                  </div>
                  {b.moyenne_generale != null && (
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      Moyenne générale :{' '}
                      <strong style={{ color: b.moyenne_generale >= 10 ? '#059669' : '#DC2626', fontSize: 16 }}>
                        {Number(b.moyenne_generale).toFixed(2)} / 20
                      </strong>
                    </div>
                  )}
                </div>
                <button onClick={() => router.push('/portail/bulletins/' + b.id)} className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }}>
                  📄 Voir le bulletin
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
