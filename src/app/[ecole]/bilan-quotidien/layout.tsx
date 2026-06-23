'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EcoleAppLayout from '@/components/ui/EcoleAppLayout'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

/**
 * Layout Bilan quotidien avec verrou d'acces finances.
 * La page affiche des KPI financiers journaliers (encaissements, soldes, etc.).
 * Si profile.acces_finances = false et role != super_admin, on bloque l'acces.
 * Reprend exactement le pattern de finances/layout.tsx et direction/layout.tsx.
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
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginTop: 12 }}>Accès refusé</h2>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 6, maxWidth: 480, margin: '6px auto 0' }}>
          Cette page contient des données financières. Demandez l'accès à votre administrateur.
        </p>
      </div>
    </EcoleAppLayout>
  }
  return <EcoleAppLayout>{children}</EcoleAppLayout>
}
