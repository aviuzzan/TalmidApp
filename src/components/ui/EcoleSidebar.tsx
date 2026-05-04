'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function EcoleSidebar({ userEmail, role }: { userEmail: string; role: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const ecole = useEcole()
  const slug = ecole.slug

  const NAV = [
    { href: `/${slug}/dashboard`, icon: '◈', label: 'Tableau de bord' },
    { href: `/${slug}/familles`, icon: '👨‍👩‍👧', label: 'Familles' },
    { href: `/${slug}/finances`, icon: '💰', label: 'Finances' },
    { href: `/${slug}/gestion-n1`, icon: '📅', label: 'Gestion N+1' },
    { href: `/${slug}/comptes-parents`, icon: '👥', label: 'Comptes parents' },
    { href: `/${slug}/notifications`, icon: '📧', label: 'Notifications' },
    { href: `/${slug}/parametres`, icon: '⚙️', label: 'Paramètres' },
  ]

  async function logout() {
    await createClient().auth.signOut()
    router.push(`/${slug}/login`)
  }

  const primaryColor = ecole.couleur_primaire || '#2563EB'

  return (
    <div style={{
      width: 230, background: 'var(--sidebar-bg)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      position: 'sticky', top: 0, height: '100vh',
    }}>
      {/* Logo école */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `linear-gradient(135deg, ${primaryColor}, #60A5FA)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {ecole.nom[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', lineHeight: 1.3, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ecole.nom}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Administration</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px 8px',
        }}>Menu principal</div>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                marginBottom: 2, fontSize: 13, textAlign: 'left',
                fontWeight: active ? 600 : 400,
                background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                transition: 'all 0.15s',
                borderLeft: active ? '3px solid #60A5FA' : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer utilisateur */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        {role === 'super_admin' && (
          <div style={{
            background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
            borderRadius: 6, padding: '4px 10px', marginBottom: 8,
            fontSize: 10, color: '#FCD34D', fontWeight: 600,
            textAlign: 'center', letterSpacing: '0.05em',
          }}>
            ⭐ SUPER ADMIN
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: `linear-gradient(135deg, ${primaryColor}, #60A5FA)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>{userEmail[0]?.toUpperCase()}</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {role === 'super_admin' ? 'Super administrateur' : 'Administrateur'}
            </div>
          </div>
        </div>
        <button onClick={logout} style={{
          width: '100%', padding: '7px',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
