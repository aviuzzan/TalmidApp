'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function PortailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [famille, setFamille] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [nonLus, setNonLus] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, famille_id, familles(nom, numero)')
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
      if (!profile?.famille_id) {
        // Compte parent pas encore lié à une famille
        setEmail(session.user.email ?? '')
        setReady(true)
        return
      }

      setEmail(session.user.email ?? '')
      setFamille((profile as any).familles)
      setReady(true)
    }
    check()
  }, [router])
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      const myId = session.user.id
      const { data: threads } = await supabase
        .from('message_threads')
        .select('id, last_message_at, thread_participants(profile_id, last_read_at), messages(auteur_profile_id, created_at)')
      if (cancelled) return
      let n = 0
      for (const t of threads || []) {
        const msgs = (t as any).messages || []
        const lastMsg = [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        if (!lastMsg || lastMsg.auteur_profile_id === myId) continue
        const tp = ((t as any).thread_participants || []).find((p: any) => p.profile_id === myId)
        if (!tp?.last_read_at || new Date((t as any).last_message_at).getTime() > new Date(tp.last_read_at).getTime()) n++
      }
      setNonLus(n)
    })()
    return () => { cancelled = true }
  }, [ready, pathname])


  async function logout() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F0F4FA' }}>
      <div style={{ color: '#64748B' }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FA', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="portail-header" style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0',
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#fff',
          }}>T</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>TalmidApp</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Espace Famille</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {famille && (
            <div className="portail-header-info" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>Famille {famille.nom}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{famille.numero}</div>
            </div>
          )}
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #60A5FA)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
            {email[0]?.toUpperCase()}
          </div>
          <button onClick={logout} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: '#475569', fontWeight: 500 }}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className="portail-nav" style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {[
          { href: '/portail', label: '🏠 Accueil' },
          { href: '/portail/enfants', label: '🎓 Mes enfants' },
          { href: '/portail/factures', label: '💰 Mes factures' },
          { href: '/portail/messages', label: '💬 Messagerie' },
          { href: '/portail/inscriptions', label: '📝 Année N+1' },
          { href: '/portail/documents', label: '📄 Documents' },
        ].map(item => (
          <a key={item.href} href={item.href}
            style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#64748B', textDecoration: 'none', borderBottom: '2px solid transparent', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#2563EB')}
            onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}>
            {item.label}
            {item.href === '/portail/messages' && nonLus > 0 && (
              <span style={{ background: '#F97316', color: '#fff', fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 700, lineHeight: '14px' }}>{nonLus}</span>
            )}
          </a>
        ))}
      </nav>

      {/* Content */}
      <main className="portail-main" style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        {children}
      </main>
    </div>
  )
}
