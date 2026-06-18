'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EcoleAppLayout from '@/components/ui/EcoleAppLayout'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Layout finances avec verrou d'acces.
 * Si profile.acces_finances = false et role != super_admin, on redirige vers le dashboard.
 * Ca empeche l'acces par URL directe (ex: /eschel/finances/dashboard) pour un admin sans acces finances.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const ecole = useEcole()
  const [autorise, setAutorise] = useState<boolean | null>(null)

  useEffect(() => {
    async function check() {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setAutorise(false); return }
      const { data: p } = await s.from('profiles')
        .select('role, acces_finances')
        .eq('id', session.user.id)
        .single()
      if (p?.role === 'super_admin') { setAutorise(true); return }
      setAutorise(p?.acces_finances !== false)
    }
    check()
  }, [])

  useEffect(() => {
    if (autorise === false && ecole?.slug) {
      router.replace(`/${ecole.slug}/dashboard`)
    }
  }, [autorise, ecole?.slug, router])

  if (autorise === null) {
    return <EcoleAppLayout><div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div></EcoleAppLayout>
  }
  if (autorise === false) {
    return <EcoleAppLayout>
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 36 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginTop: 12 }}>Accès finances non accordé</h2>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Redirection vers le tableau de bord…</p>
      </div>
    </EcoleAppLayout>
  }
  return <EcoleAppLayout>{children}</EcoleAppLayout>
}
