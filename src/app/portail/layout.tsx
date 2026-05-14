'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import LangSwitcher from '@/components/LangSwitcher'
import { useI18n } from '@/lib/i18n'
import { getExerciceInscription } from '@/lib/annee-inscription'
import { InscriptionContext } from '@/lib/inscription-context'

export default function PortailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t, dir } = useI18n()
  const [email, setEmail] = useState('')
  const [famille, setFamille] = useState<any>(null)
  const [profileId, setProfileId] = useState<string>('')
  const [ready, setReady] = useState(false)
  const [nonLus, setNonLus] = useState(0)
  const [inscriptionCtx, setInscriptionCtx] = useState<{ anneeInscription: string; exerciceInscriptionId: string | null }>({ anneeInscription: '', exerciceInscriptionId: null })

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, famille_id, ecole_id, familles(nom, numero)')
        .eq('id', session.user.id)
        .single()

      if (profile?.role === 'admin' || profile?.role === 'super_admin') {
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('ecoles(slug)')
          .eq('id', session.user.id)
          .single()
        const slug = (adminProfile as any)?.ecoles?.slug || 'hederloubavitch'
        router.push(`/${slug}/dashboard`)
        return
      }

      if (profile?.ecole_id) {
        const insc = await getExerciceInscription(supabase, profile.ecole_id)
        setInscriptionCtx({ anneeInscription: insc.code, exerciceInscriptionId: insc.exercice_id })
      }

      if (!profile?.famille_id) {
        setEmail(session.user.email ?? '')
        setProfileId(session.user.id)
        setReady(true)
        return
      }

      setEmail(session.user.email ?? '')
      setFamille((profile as any).familles)
      setProfileId(session.user.id)
      setReady(true)
    }
    check()
  }, [router])

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: threads } = await supabase
        .from('message_threads')
        .select('id, last_message_at, thread_participants(profile_id, last_read_at), messages(auteur_profile_id, created_at)')
      if (cancelled) return
      let n = 0
      for (const th of threads || []) {
        const msgs = (th as any).messages || []
        const lastMsg = [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        if (!lastMsg || lastMsg.auteur_profile_id === profileId) continue
        const tp = ((th as any).thread_participants || []).find((p: any) => p.profile_id === profileId)
        if (!tp?.last_read_at || new Date((th as any).last_message_at).getTime() > new Date(tp.last_read_at).getTime()) n++
      }
      setNonLus(n)
    })()
    return () => { cancelled = true }
  }, [profileId, pathname])

  async function logout() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F0F4FA' }}>
      <div style={{ color: '#64748B' }}>{t('common.loading')}</div>
    </div>
  )

  const navItems = [
    { href: '/portail', icon: '🏠', label: t('portail.nav.home') },
    { href: '/portail/enfants', icon: '🎓', label: t('portail.nav.children') },
    { href: '/portail/bulletins', icon: '📊', label: t('portail.nav.bulletins') },
    { href: '/portail/devoirs', icon: '📚', label: t('portail.nav.devoirs') },
    { href: '/portail/sante', icon: '🏥', label: t('portail.nav.health') },
    { href: '/portail/factures', icon: '💰', label: t('portail.nav.invoices') },
    { href: '/portail/messages', icon: '💬', label: t('portail.nav.messaging') },
    { href: '/portail/inscriptions', icon: '📝', label: t('portail.nav.next_year') },
    { href: '/portail/documents', icon: '📄', label: t('portail.nav.documents') },
    { href: '/portail/mon-compte', icon: '👤', label: t('portail.nav.account') },
  ]

  return (
    <div dir={dir} style={{ minHeight: '100vh', background: '#F0F4FA', fontFamily: 'Inter, sans-serif' }}>
      <ServiceWorkerRegister />
      <header className="portail-header" style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0',
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo-icon.png" alt="TalmidApp" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B', letterSpacing: '-0.01em' }}>TalmidApp</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{t('portail.nav.family_space')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {famille && (
            <div className="portail-header-info" style={{ textAlign: dir === 'rtl' ? 'left' : 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{famille.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{famille.numero}</div>
            </div>
          )}
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {email[0]?.toUpperCase()}
          </div>
          <LangSwitcher compact />
          <button onClick={logout} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: '#475569', fontWeight: 500 }}>
            {t('portail.logout')}
          </button>
        </div>
      </header>

      <nav className="portail-nav" style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {navItems.map(item => (
          <a key={item.href} href={item.href}
            style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#64748B', textDecoration: 'none', borderBottom: '2px solid transparent', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#2563EB')}
            onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}>
            <span>{item.icon}</span> {item.label}
            {item.href === '/portail/messages' && nonLus > 0 && (
              <span style={{ background: '#F97316', color: '#fff', fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 700, lineHeight: '14px' }}>{nonLus}</span>
            )}
          </a>
        ))}
      </nav>

      <main className="portail-main" style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        <InscriptionContext.Provider value={inscriptionCtx}>
          {children}
        </InscriptionContext.Provider>
      </main>
    </div>
  )
}
