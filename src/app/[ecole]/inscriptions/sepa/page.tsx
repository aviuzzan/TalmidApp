'use client'
// FIX nav llll2 : la page Export SEPA vit désormais sous /finances/sepa
// (catégorie Finances + verrou acces_finances via finances/layout).
// Cette ancienne URL redirige pour ne pas casser les favoris.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEcole } from '@/lib/ecole-context'

export default function SepaRedirect() {
  const router = useRouter()
  const ecole = useEcole()
  useEffect(() => {
    if (ecole?.slug) router.replace(`/${ecole.slug}/finances/sepa`)
  }, [ecole?.slug, router])
  return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Redirection vers Finances → Export SEPA…</div>
}
