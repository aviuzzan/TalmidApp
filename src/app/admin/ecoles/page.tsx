'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Ecole = {
  id: string
  slug: string
  nom: string
  ville: string | null
  email_contact: string | null
  telephone: string | null
  actif: boolean
  created_at: string
  nb_familles?: number
  nb_enfants?: number
}

export default function AdminEcolesListPage() {
  const router = useRouter()
  const [ecoles, setEcoles] = useState<Ecole[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const s = createClient()
    const { data: e } = await s.from('ecoles').select('*').order('nom')
    if (!e) { setLoading(false); return }
    // Compteurs par école
    const ecolesAvecStats: Ecole[] = []
    for (const ec of e) {
      const [{ count: fc }, { count: enc }] = await Promise.all([
        s.from('familles').select('*', { count: 'exact', head: true }).eq('ecole_id', ec.id),
        s.from('enfants').select('*', { count: 'exact', head: true }).eq('ecole_id', ec.id),
      ])
      ecolesAvecStats.push({ ...ec, nb_familles: fc || 0, nb_enfants: enc || 0 })
    }
    setEcoles(ecolesAvecStats)
    setLoading(false)
  }

  const filtered = ecoles.filter(e =>
    !search ||
    e.nom.toLowerCase().includes(search.toLowerCase()) ||
    e.slug.toLowerCase().includes(search.toLowerCase()) ||
    (e.ville || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement des écoles…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>🏫 Écoles</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>{ecoles.length} écoles configurées sur la plateforme.</p>
        </div>
        <button onClick={() => router.push('/admin/ecoles/new')}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Nouvelle école
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une école (nom, slug, ville)…"
        style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14, background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0' }}>
            {search ? 'Aucune école ne correspond.' : 'Aucune école. Créez-en une pour commencer.'}
          </div>
        ) : filtered.map(e => (
          <div key={e.id} onClick={() => router.push(`/admin/ecoles/${e.id}`)}
            style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.borderColor = '#2563EB'; (ev.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(37,99,235,0.12)' }}
            onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (ev.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>{e.nom}</h3>
                <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2 }}>/{e.slug}</div>
                {e.ville && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>📍 {e.ville}</div>}
              </div>
              {!e.actif && <span style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '3px 8px', borderRadius: 10, textTransform: 'uppercase' }}>Inactive</span>}
            </div>
            {(e.email_contact || e.telephone) && (
              <div style={{ fontSize: 11, color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8, marginTop: 8 }}>
                {e.email_contact && <div>✉ {e.email_contact}</div>}
                {e.telephone && <div>☎ {e.telephone}</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{e.nb_familles}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' }}>Familles</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>{e.nb_enfants}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' }}>Élèves</div>
              </div>
              <a href={`/${e.slug}/dashboard`} onClick={ev => ev.stopPropagation()}
                style={{ marginLeft: 'auto', alignSelf: 'flex-end', color: '#2563EB', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                Ouvrir →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
