'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const NAV = [
  { href: '/admin/dashboard', icon: '◈', label: 'Vue d\'ensemble' },
  { href: '/admin/ecoles', icon: '🏫', label: 'Écoles' },
  { href: '/admin/logs', icon: '📋', label: 'Activité' },
]

export default function AdminSidebar({ email }: { email: string }) {
  const router = useRouter()
  const pathname = usePathname()

  async function logout() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: '#0A0F1E',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>T</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>TalmidApp</div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#818CF8',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>Super Admin</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '14px 10px', flex: 1, overflowY: 'auto' }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '4px 10px 10px',
        }}>Console</div>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                marginBottom: 2, fontSize: 13, textAlign: 'left',
                fontWeight: active ? 600 : 400,
                background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: active ? '#A5B4FC' : 'rgba(255,255,255,0.5)',
                transition: 'all 0.15s',
                borderLeft: active ? '3px solid #6366F1' : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>{email[0]?.toUpperCase()}</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
            <div style={{ fontSize: 10, color: '#6366F1', fontWeight: 600 }}>Super Admin</div>
          </div>
        </div>
        <button onClick={logout} style={{
          width: '100%', padding: '7px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 7, color: 'rgba(255,255,255,0.4)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
