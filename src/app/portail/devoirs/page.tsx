'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Devoir = {
  id: string
  classe_id: string
  matiere_nom: string | null
  titre: string
  contenu: string | null
  date_demande: string
  date_pour: string
  duree_estimee_min: number | null
}

type Enfant = { id: string; prenom: string; nom: string; classe_id: string | null }

export default function PortailDevoirsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [enfants, setEnfants] = useState<Enfant[]>([])
  const [devoirsParEnfant, setDevoirsParEnfant] = useState<Record<string, Devoir[]>>({})
  const [filtre, setFiltre] = useState<'semaine' | 'tous'>('semaine')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await s.from('profiles').select('famille_id').eq('id', session.user.id).single()
    if (!profile?.famille_id) { setLoading(false); return }

    const { data: enf } = await s.from('enfants')
      .select('id, prenom, nom, classe_id')
      .eq('famille_id', profile.famille_id)
      .not('classe_id', 'is', null)
      .order('prenom')
    setEnfants((enf ?? []) as Enfant[])

    const classeIds = (enf ?? []).map((e: any) => e.classe_id).filter(Boolean)
    if (classeIds.length === 0) { setLoading(false); return }

    const todayIso = new Date().toISOString().slice(0, 10)
    const { data: dev } = await s.from('devoirs')
      .select('id, classe_id, matiere_nom, titre, contenu, date_demande, date_pour, duree_estimee_min')
      .in('classe_id', classeIds)
      .gte('date_pour', todayIso)
      .order('date_pour')

    const map: Record<string, Devoir[]> = {}
    for (const e of (enf ?? []) as Enfant[]) {
      map[e.id] = (dev ?? []).filter((d: any) => d.classe_id === e.classe_id)
    }
    setDevoirsParEnfant(map)
    setLoading(false)
  }

  function filtrerDevoirs(devs: Devoir[]): Devoir[] {
    if (filtre === 'tous') return devs
    const dans7j = new Date()
    dans7j.setDate(dans7j.getDate() + 7)
    return devs.filter(d => new Date(d.date_pour) <= dans7j)
  }

  function joursAvant(dateStr: string): string {
    const d = new Date(dateStr)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
    if (diff === 0) return 'Aujourd\'hui'
    if (diff === 1) return 'Demain'
    if (diff < 7) return 'Dans ' + diff + ' j'
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Chargement...</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 48px' }}>
      <a href="/portail/enfants" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 13, textDecoration: 'none', width: 'fit-content' }}>← Mes enfants</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>📓 Devoirs</h1>
          <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>Cahier de textes en ligne</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 4 }}>
          <button onClick={() => setFiltre('semaine')}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filtre === 'semaine' ? '#fff' : 'transparent',
              color: filtre === 'semaine' ? '#1E293B' : '#64748B' }}>
            Cette semaine
          </button>
          <button onClick={() => setFiltre('tous')}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filtre === 'tous' ? '#fff' : 'transparent',
              color: filtre === 'tous' ? '#1E293B' : '#64748B' }}>
            À venir
          </button>
        </div>
      </div>

      {enfants.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', color: '#94A3B8', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          Aucun enfant rattaché à une classe.
        </div>
      ) : enfants.map(e => {
        const devs = filtrerDevoirs(devoirsParEnfant[e.id] || [])
        return (
          <div key={e.id} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#DBEAFE', color: '#1E40AF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                {e.prenom[0]}
              </span>
              {e.prenom} {e.nom}
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 400 }}>· {devs.length} devoir{devs.length > 1 ? 's' : ''}</span>
            </h2>
            {devs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13, background: '#F8FAFC', borderRadius: 10 }}>
                🎉 Aucun devoir {filtre === 'semaine' ? 'cette semaine' : 'à venir'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {devs.map(d => {
                  const isUrgent = (new Date(d.date_pour).getTime() - new Date().getTime()) < 86400000 * 2
                  return (
                    <div key={d.id} style={{ background: '#fff', border: '1px solid ' + (isUrgent ? '#FCA5A5' : '#E2E8F0'), borderLeft: '3px solid ' + (isUrgent ? '#DC2626' : '#2563EB'), borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {d.matiere_nom && <span style={{ background: '#FFFBEB', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{d.matiere_nom}</span>}
                          {d.duree_estimee_min && <span style={{ fontSize: 11, color: '#64748B' }}>⏱ ~{d.duree_estimee_min} min</span>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: isUrgent ? '#DC2626' : '#1E40AF', whiteSpace: 'nowrap' }}>
                          📅 {joursAvant(d.date_pour)}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>{d.titre}</div>
                      {d.contenu && <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap', marginTop: 4 }}>{d.contenu}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
