'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { loadPermissions, Niveau } from '@/lib/permissions'

type NavItem = { href: string; icon: string; label: string; module?: string }

export default function EcoleSidebar({ userEmail, role }: { userEmail: string; role: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const ecole = useEcole()
  const slug = ecole.slug
  const [isOpen, setIsOpen] = useState(false)
  const [perms, setPerms] = useState<Record<string, Niveau>>({})
  const [isAdminPrincipal, setIsAdminPrincipal] = useState(false)
  const [permsLoaded, setPermsLoaded] = useState(false)

  useEffect(() => {
    (async () => {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session || !ecole?.id) { setPermsLoaded(true); return }
      const p = await loadPermissions(s, session.user.id, ecole.id)
      setPerms(p.perms)
      setIsAdminPrincipal(p.isAdminPrincipal)
      setPermsLoaded(true)
    })()
  }, [ecole?.id])

  const NAV: NavItem[] = [
    { href: `/${slug}/dashboard`, icon: '◈', label: 'Tableau de bord', module: 'dashboard' },
    { href: `/${slug}/familles`, icon: '👨‍👩‍👧', label: 'Familles', module: 'administratif' },
    { href: `/${slug}/enfants`, icon: '🎓', label: 'Élèves', module: 'administratif' },
    { href: `/${slug}/finances`, icon: '💰', label: 'Finances', module: 'facturation' },
    { href: `/${slug}/gestion-n1`, icon: '📅', label: 'Gestion N+1', module: 'inscriptions' },
    { href: `/${slug}/comptes-parents`, icon: '👥', label: 'Comptes parents', module: 'administratif' },
    { href: `/${slug}/messages`, icon: '💬', label: 'Messagerie', module: 'messagerie' },
    { href: `/${slug}/professeurs`, icon: '👨‍🏫', label: 'Professeurs', module: 'professeurs' },
    { href: `/${slug}/notifications`, icon: '📧', label: 'Notifications', module: 'parametres' },
    { href: `/${slug}/inscriptions`, icon: '📝', label: 'Inscriptions N+1', module: 'inscriptions' },
    { href: `/${slug}/inscriptions/sepa`, icon: '🏦', label: 'Export SEPA', module: 'compta' },
    { href: `/${slug}/parametres`, icon: '⚙️', label: 'Paramètres', module: 'parametres' },
  ]

  const navFiltered = (() => {
    // super_admin et admin (rôle BDD legacy) voient tout — fallback de sécurité
    // pour ne pas casser l'accès tant que les permissions par module ne sont pas
    // configurées sur chaque admin école.
    if (role === 'super_admin' || role === 'admin') return NAV
    // Pendant le chargement des perms : afficher tout (évite le flash menu vide).
    if (!permsLoaded) return NAV
    // Admin principal détecté côté perms : tout aussi.
    if (isAdminPrincipal) return NAV
    // Sinon, filtrer par permissions.
    return NAV.filter(i => {
      if (!i.module) return true
      const n = perms[i.module] || 'aucun'
      return n !== 'aucun'
    })
  })()

  async function logout() {
    await createClient().auth.signOut()
    router.push(`/${slug}/login`)
  }

  function navigate(href: string) {
    router.push(href)
    setIsOpen(false)
  }

  const primaryColor = ecole.couleur_primaire || '#2563EB'

  return (
    <>
      <button
        aria-label="Ouvrir le menu"
        className="ecole-hamburger"
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 60,
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--sidebar-bg)', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 22,
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>
        {'☰'}
      </button>

      <div
        onClick={() => setIsOpen(false)}
        className={'ecole-backdrop' + (isOpen ? ' is-visible' : '')}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90 }}
      />

      <div
        className={'ecole-sidebar' + (isOpen ? ' is-open' : '')}
        style={{
          width: 230, background: 'var(--sidebar-bg)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'sticky', top: 0, height: '100vh', zIndex: 100,
        }}>
        <button
          aria-label="Fermer le menu"
          className="ecole-sidebar-close"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 5,
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(255,255,255,0.12)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 20,
            alignItems: 'center', justifyContent: 'center',
          }}>
          {'×'}
        </button>

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

        <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px 8px',
          }}>Menu principal</div>
          {navFiltered.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <button key={item.href} onClick={() => navigate(item.href)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '11px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  marginBottom: 2, fontSize: 14, textAlign: 'left',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  transition: 'all 0.15s',
                  borderLeft: active ? '3px solid #60A5FA' : '3px solid transparent',
                  minHeight: 44,
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
          {isAdminPrincipal && (
            <button onClick={() => navigate(`/${slug}/parametres/comptes-acces`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '11px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                marginTop: 10, fontSize: 13, textAlign: 'left', fontWeight: 500,
                background: pathname?.includes('comptes-acces') ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.75)',
                borderLeft: pathname?.includes('comptes-acces') ? '3px solid #60A5FA' : '3px solid transparent',
                minHeight: 40,
              }}>
              <span style={{ fontSize: 14 }}>{'🔐'}</span>
              Comptes &amp; accès
            </button>
          )}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {role === 'super_admin' && (
            <div style={{
              background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
              borderRadius: 6, padding: '4px 10px', marginBottom: 8,
              fontSize: 10, color: '#FCD34D', fontWeight: 600,
              textAlign: 'center', letterSpacing: '0.05em',
            }}>
              SUPER ADMIN
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
                {role === 'super_admin' ? 'Super administrateur' : (isAdminPrincipal ? 'Admin principal' : 'Administrateur')}
              </div>
            </div>
          </div>
          <button onClick={logout} style={{
            width: '100%', padding: '10px',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            minHeight: 40,
          }}>
            Se déconnecter
          </button>
        </div>
      </div>
    </>
  )
}
