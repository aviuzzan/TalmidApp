'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { CATEGORIES, hasCategoryAccess, loadPermissions, Niveau } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

type ModuleEntry = { nom: string; href: string; module: string }

const MODULES_BY_CATEGORY: Record<string, ModuleEntry[]> = {
  administration: [
    { nom: '📊 Tableau de bord direction', href: 'direction', module: 'administratif' },
    { nom: 'Familles', href: 'familles', module: 'administratif' },
    { nom: 'Élèves', href: 'enfants', module: 'administratif' },
    { nom: 'Passages de classe', href: 'passages-de-classe', module: 'administratif' },
    { nom: 'Comptes parents', href: 'comptes-parents', module: 'administratif' },
    { nom: 'Demandes de nouvelles inscriptions', href: 'demandes-inscription', module: 'inscriptions' },
    { nom: 'Inscriptions N+1', href: 'inscriptions', module: 'inscriptions' },
  ],
  finances: [
    { nom: 'Tableau de bord', href: 'finances/dashboard', module: 'facturation' },
    { nom: 'Factures', href: 'finances', module: 'facturation' },
    { nom: 'Relances impayés', href: 'finances/relances', module: 'facturation' },
    { nom: 'Bordereau chèques', href: 'finances/bordereau', module: 'facturation' },
    { nom: 'Rapprochement bancaire', href: 'finances/rapprochement', module: 'compta' },
    { nom: 'Compta analytique', href: 'finances/analytique', module: 'compta' },
    { nom: 'Export SEPA', href: 'inscriptions/sepa', module: 'compta' },
    { nom: 'Paie enseignants', href: 'paie', module: 'paye' },
  ],
  pedagogie: [
    { nom: 'Programmes', href: 'pedagogie', module: 'pedagogie' },
    { nom: 'Professeurs', href: 'professeurs', module: 'professeurs' },
    { nom: 'Emplois du temps', href: 'emplois-du-temps', module: 'emplois_du_temps' },
    { nom: 'Devoirs', href: 'devoirs', module: 'pedagogie' },
    { nom: 'Bulletins', href: 'bulletins', module: 'pedagogie' },
    { nom: 'Conseils de classe', href: 'conseils-de-classe', module: 'pedagogie' },
    { nom: 'Notes & évaluations', href: 'notes', module: 'pedagogie' },
    { nom: 'LSU (Livret Scolaire)', href: 'lsu', module: 'pedagogie' },
    { nom: 'Connecteurs EN', href: 'connecteurs-en', module: 'pedagogie' },
  ],
  vie_scolaire: [
    { nom: 'Présences / absences', href: 'presences', module: 'pedagogie' },
    { nom: 'Sanctions / discipline', href: 'sanctions', module: 'pedagogie' },
    { nom: 'Transport', href: 'transport', module: 'transport' },
    { nom: 'Cantine', href: 'cantine', module: 'cantine' },
    { nom: 'Casiers', href: 'casiers', module: 'administratif' },
    { nom: 'Prêts de matériel', href: 'prets', module: 'administratif' },
  ],
  communication: [
    { nom: 'Messagerie', href: 'messages', module: 'messagerie' },
    { nom: 'Documents école', href: 'documents', module: 'documents' },
    { nom: 'SMS', href: 'sms', module: 'messagerie' },
    { nom: 'Notifications push', href: 'notifications-push', module: 'messagerie' },
    { nom: 'Notifications', href: 'notifications', module: 'parametres' },
  ],
  configuration: [
    { nom: 'Paramètres école', href: 'parametres', module: 'parametres' },
    { nom: 'Infos & identifiants', href: 'parametres/ecole-infos', module: 'parametres' },
    { nom: 'Intégrations', href: 'parametres/integrations', module: 'parametres' },
    { nom: 'Comptes & accès', href: 'parametres/comptes-acces', module: 'parametres' },
    { nom: '📋 Journal d\'audit', href: 'parametres/audit', module: 'parametres' },
    { nom: 'Exports CSV', href: 'exports', module: 'parametres' },
    { nom: 'Importer des donnees', href: 'import', module: 'parametres' },
    { nom: '🎓 Aide & démarrage', href: 'aide', module: 'parametres' },
  ],
}

function findActiveCategory(pathname: string, slug: string): string | null {
  if (!pathname) return null
  for (const cat of CATEGORIES) {
    if (pathname === '/' + slug + '/' + cat.hrefHub || pathname.startsWith('/' + slug + '/' + cat.hrefHub + '/')) {
      return cat.code
    }
  }
  for (const catCode of Object.keys(MODULES_BY_CATEGORY)) {
    for (const m of MODULES_BY_CATEGORY[catCode]) {
      const fullPath = '/' + slug + '/' + m.href
      if (pathname === fullPath || pathname.startsWith(fullPath + '/')) {
        return catCode
      }
    }
  }
  return null
}

export default function EcoleSidebar({ userEmail, role }: { userEmail: string; role: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const ecole = useEcole()
  const slug = ecole.slug
  const { t } = useI18n()
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

  const activeCategory = findActiveCategory(pathname || '', slug)
  const isDashboardActive = pathname === '/' + slug + '/dashboard'

  function moduleHasAccess(m: ModuleEntry): boolean {
    if (m.href.includes('comptes-acces')) return isAdminPrincipal || role === 'super_admin'
    if (role === 'super_admin' || role === 'admin' || isAdminPrincipal) return true
    if (!permsLoaded) return true
    return (perms[m.module] || 'aucun') !== 'aucun'
  }

  async function logout() {
    await createClient().auth.signOut()
    router.push('/' + slug + '/login')
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
          <button onClick={() => navigate('/' + slug + '/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '11px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              marginBottom: 8, fontSize: 14, textAlign: 'left',
              fontWeight: isDashboardActive ? 600 : 400,
              background: isDashboardActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: isDashboardActive ? '#fff' : 'rgba(255,255,255,0.65)',
              borderLeft: isDashboardActive ? '3px solid #60A5FA' : '3px solid transparent',
              minHeight: 44,
            }}>
            <span style={{ fontSize: 16 }}>◈</span>
            {t('sidebar.dashboard', 'Tableau de bord')}
          </button>

          <div style={{
            fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 6px',
          }}>Catégories</div>

          {CATEGORIES.map(cat => {
            const accessible = hasCategoryAccess(cat, perms, role, isAdminPrincipal)
            const isCatActive = cat.code === activeCategory
            const modules = MODULES_BY_CATEGORY[cat.code] || []
            const visibleModules = modules.filter(moduleHasAccess)

            return (
              <div key={cat.code}>
                <button
                  onClick={() => accessible && navigate('/' + slug + '/' + cat.hrefHub)}
                  disabled={!accessible}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 12px', borderRadius: 8, border: 'none',
                    cursor: accessible ? 'pointer' : 'not-allowed',
                    marginBottom: 2, fontSize: 13, textAlign: 'left',
                    fontWeight: isCatActive ? 600 : 400,
                    background: isCatActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: accessible ? (isCatActive ? '#fff' : 'rgba(255,255,255,0.75)') : 'rgba(255,255,255,0.35)',
                    borderLeft: isCatActive ? `3px solid ${cat.couleur.border}` : '3px solid transparent',
                    minHeight: 40,
                  }}>
                  <span style={{ fontSize: 16 }}>{cat.icone}</span>
                  <span style={{ flex: 1 }}>{t('sidebar.' + cat.code, cat.nom)}</span>
                  {!accessible && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>🔒</span>}
                </button>

                {isCatActive && accessible && visibleModules.length > 0 && (
                  <div style={{ paddingLeft: 22, marginBottom: 6, marginTop: 2 }}>
                    {visibleModules.map(m => {
                      const fullPath = '/' + slug + '/' + m.href
                      const isModActive = pathname === fullPath
                      return (
                        <button key={m.href} onClick={() => navigate(fullPath)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '7px 11px', borderRadius: 6,
                            fontSize: 12, border: 'none', cursor: 'pointer',
                            marginBottom: 1,
                            background: isModActive ? 'rgba(96,165,250,0.18)' : 'transparent',
                            color: isModActive ? '#fff' : 'rgba(255,255,255,0.55)',
                            borderLeft: isModActive ? '2px solid #60A5FA' : '2px solid transparent',
                          }}>
                          {m.nom}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
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
