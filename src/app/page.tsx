'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import LandingPage from '@/components/LandingPage'

export default function Home() {
  const router = useRouter()
  const [showLanding, setShowLanding] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setShowLanding(true); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()

      if (profile?.role === 'super_admin' || profile?.role === 'admin') {
        router.push('/dashboard')
      } else if (profile?.role === 'teacher') {
        router.push('/teacher')
      } else {
        router.push('/portail')
      }
    }
    check()
  }, [router])

  if (showLanding) return <LandingPage />

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#050A14' }}>
      <div style={{ color: '#64748B' }}>Chargement...</div>
    </div>
  )
}
