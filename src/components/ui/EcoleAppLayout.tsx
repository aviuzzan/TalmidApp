'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import EcoleSidebar from '@/components/ui/EcoleSidebar'
import ChatbotWidget from '@/components/ui/ChatbotWidget'
import GlobalSearch from '@/components/ui/GlobalSearch'
import ExerciceSelector from '@/components/ui/ExerciceSelector'
import { useEcole } from '@/lib/ecole-context'
import { AccesFinancesProvider } from '@/lib/acces-finances'

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
    <AccesFinancesProvider>
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4FA' }}>
      <EcoleSidebar userEmail={email} role={role} />
      <main className="ecole-main" style={{ flex: 1, overflowY: 'auto', maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Barre header globale avec sélecteur d'exercice, présent partout */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: 'rgba(240,244,250,0.94)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #E2E8F0',
          padding: '10px 28px',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        }}>
          <ExerciceSelector />
        </div>
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </main>
      <GlobalSearch />
      <ChatbotWidget />
    </div>
    </AccesFinancesProvider>
  )
}
