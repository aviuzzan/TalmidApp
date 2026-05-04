'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import EcoleSidebar from '@/components/ui/EcoleSidebar'
import { useEcole } from '@/lib/ecole-context'

export default function EcoleAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const ecole = useEcole()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(`/${ecole.slug}/login`)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
        // Parent ou non reconnu → portail
        router.push('/portail')
        return
      }

      setEmail(session.user.email ?? '')
      setRole(profile.role)
      setReady(true)
    }
    check()
  }, [router, ecole.slug])

  if (!ready) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#F0F4FA',
    }}>
      <div style={{ color: '#64748B', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4FA' }}>
      <EcoleSidebar userEmail={email} role={role} />
      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', maxWidth: '100%' }}>
        {children}
      </main>
    </div>
  )
}
