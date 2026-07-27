'use client'
/**
 * FinanceGuard (llll2) — garde d'acces financier SANS shell.
 * A poser dans le layout.tsx d'un dossier dont le parent fournit deja EcoleAppLayout
 * (ex: familles/[id]/compte, inscriptions/contrat). Pour un dossier sans shell,
 * l'envelopper soi-meme : <EcoleAppLayout><FinanceGuard>{children}</FinanceGuard></EcoleAppLayout>.
 *
 * Regle identique au layout finances : super_admin toujours OK, sinon
 * profiles.acces_finances !== false. Redirige vers le dashboard sinon.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function FinanceGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const ecole = useEcole()
  const [autorise, setAutorise] = useState<boolean | null>(null)

  useEffect(() => {
    ;(async () => {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setAutorise(false); return }
      const { data: p } = await s.from('profiles')
        .select('role, acces_finances')
        .eq('id', session.user.id)
        .single()
      if (p?.role === 'super_admin') { setAutorise(true); return }
      setAutorise(p?.acces_finances !== false)
    })()
  }, [])

  useEffect(() => {
    if (autorise === false && ecole?.slug) router.replace(`/${ecole.slug}/dashboard`)
  }, [autorise, ecole?.slug, router])

  if (autorise === null) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (autorise === false) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 36 }}>🔒</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginTop: 12 }}>Accès finances non accordé</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Redirection vers le tableau de bord…</p>
    </div>
  )
  return <>{children}</>
}
