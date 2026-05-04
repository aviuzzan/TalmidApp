'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const PLAN_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  starter:    { label: 'Starter',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  pro:        { label: 'Pro',        color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
  enterprise: { label: 'Enterprise', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [ecoles, setEcoles] = useState<any[]>([])
  const [stats, setStats] = useState({ ecoles: 0, familles: 0, eleves: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const s = createClient()
      const [{ data: ecolesData }, { count: familles }, { count: eleves }] = await Promise.all([
        s.from('ecoles').select('*').order('created_at', { ascending: false }),
        s.from('familles').select('*', { count: 'exact', head: true }),
        s.from('enfants').select('*', { count: 'exact', head: true }),
      ])
      setEcoles(ecolesData ?? [])
      setStats({
        ecoles: ecolesData?.length ?? 0,
        familles: familles ?? 0,
        eleves: eleves ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [])

  const card = (icon: string, label: string, value: number | string, color: string, bg: string) => (
    <div style={{
      background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{loading ? '—' : value}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>Vue d'ensemble</h1>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 }}>
            Console d'administration TalmidApp
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/ecoles/new')}
          style={{
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            border: 'none', borderRadius: 10, padding: '10px 20px',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          + Nouvelle école
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {card('🏫', 'Écoles actives', stats.ecoles, '#A5B4FC', 'rgba(99,102,241,0.15)')}
        {card('👨‍👩‍👧', 'Familles total', stats.familles, '#34D399', 'rgba(16,185,129,0.12)')}
        {card('🎓', 'Élèves total', stats.eleves, '#60A5FA', 'rgba(37,99,235,0.15)')}
      </div>

      {/* Tableau des écoles */}
      <div style={{ background: '#0D1526', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#F1F5F9' }}>Écoles ({stats.ecoles})</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Chargement...</div>
        ) : ecoles.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Aucune école pour l'instant</div>
            <button onClick={() => router.push('/admin/ecoles/new')}
              style={{ marginTop: 16, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, padding: '8px 18px', color: '#A5B4FC', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              Créer la première école
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['École', 'Slug', 'Plan', 'Contact', 'Statut', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ecoles.map((e, i) => {
                const badge = PLAN_BADGE[e.plan] ?? PLAN_BADGE.starter
                return (
                  <tr key={e.id} style={{ borderBottom: i < ecoles.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: `linear-gradient(135deg, ${e.couleur_primaire || '#2563EB'}, #60A5FA)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, color: '#fff',
                        }}>{e.nom[0]?.toUpperCase()}</div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#F1F5F9' }}>{e.nom}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <code style={{ fontSize: 12, color: '#64748B', background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: 5 }}>/{e.slug}</code>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: 20 }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                      {e.email_contact || '—'}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: e.actif ? '#34D399' : '#F87171',
                        background: e.actif ? 'rgba(16,185,129,0.1)' : 'rgba(248,113,113,0.1)',
                        padding: '3px 10px', borderRadius: 20,
                      }}>{e.actif ? 'Active' : 'Suspendue'}</span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => router.push(`/admin/ecoles/${e.id}`)}
                          style={{ fontSize: 12, color: '#A5B4FC', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 500 }}>
                          Gérer
                        </button>
                        <button
                          onClick={() => router.push(`/${e.slug}/dashboard`)}
                          style={{ fontSize: 12, color: '#60A5FA', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 500 }}>
                          Accéder →
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
