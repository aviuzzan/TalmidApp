'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/ui/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Vérifier que c'est bien un admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        // Ce n'est pas un admin → rediriger vers le portail parent
        router.push('/portail')
        return
      }

      setEmail(session.user.email ?? '')
      setReady(true)
    }
    check()
  }, [router])

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F0F4FA' }}>
      <div style={{ color: '#64748B' }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4FA' }}>
      <Sidebar userEmail={email} />
      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', maxWidth: '100%' }}>
        {children}
      </main>
    </div>
  )
}
