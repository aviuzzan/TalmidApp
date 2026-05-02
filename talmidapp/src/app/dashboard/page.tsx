'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function StatCard({ icon, label, value, color, bg, sub }: any) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({ familles: 0, eleves: 0, incomplets: 0, attente: 0 })
  const [loading, setLoading] = useState(true)
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const now = new Date().toISOString().split('T')[0]
      const [{ count: f }, { count: e }, { count: i }, { count: a }] = await Promise.all([
        supabase.from('familles').select('*', { count: 'exact', head: true }),
        supabase.from('enfants').select('*', { count: 'exact', head: true })
          .or(`date_entree.is.null,date_entree.lte.${now}`)
          .or(`date_sortie.is.null,date_sortie.gte.${now}`),
        supabase.from('familles').select('*', { count: 'exact', head: true }).eq('statut_dossier', 'incomplet'),
        supabase.from('enfants').select('*', { count: 'exact', head: true }).eq('statut_inscription', 'en_attente'),
      ])
      setStats({ familles: f ?? 0, eleves: e ?? 0, incomplets: i ?? 0, attente: a ?? 0 })
      setLoading(false)
    }
    load()
  }, [])

  const v = (n: number) => loading ? '...' : n.toString()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Tableau de bord</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>{today}</p>
        </div>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
          📅 2025 / 2026
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard icon="👨‍👩‍👧" label="Familles inscrites" value={v(stats.familles)} color="#2563EB" bg="#EFF6FF" />
        <StatCard icon="🎓" label="Élèves actifs" value={v(stats.eleves)} color="#059669" bg="#ECFDF5" />
        <StatCard icon="📋" label="Dossiers incomplets" value={v(stats.incomplets)} color="#D97706" bg="#FFFBEB" sub="À compléter" />
        <StatCard icon="⏳" label="En attente" value={v(stats.attente)} color="#DC2626" bg="#FEF2F2" sub="Inscriptions N+1" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Raccourcis rapides</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: '👨‍👩‍👧 Ajouter une famille', href: '/familles', color: '#2563EB', bg: '#EFF6FF' },
              { label: '📅 Gérer les inscriptions N+1', href: '/gestion-n1', color: '#059669', bg: '#ECFDF5' },
              { label: '⚙️ Configurer les paramètres', href: '/parametres', color: '#64748B', bg: '#F8FAFC' },
            ].map(a => (
              <button key={a.label} onClick={() => router.push(a.href)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 8, border: `1px solid ${a.bg}`, background: a.bg, color: a.color, fontWeight: 500, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>À venir</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Module finances & scolarité', 'Portail parents', 'Génération de documents PDF', 'Paiements GoCardless'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, color: '#94A3B8', fontSize: 13 }}>
                <span style={{ fontSize: 10 }}>🔜</span> {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
