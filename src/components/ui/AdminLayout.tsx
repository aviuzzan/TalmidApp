'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import AdminSidebar from '@/components/ui/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (profile?.role !== 'super_admin') {
        // Pas super admin → renvoyer sur son espace
        router.push('/login')
        return
      }

      setEmail(session.user.email ?? '')
      setReady(true)
    }
    check()
  }, [router])

  if (!ready) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#060B18',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#060B18', fontFamily: 'Inter, sans-serif' }}>
      <AdminSidebar email={email} />
      <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', color: '#E2E8F0' }}>
        {children}
      </main>
    </div>
  )
}
