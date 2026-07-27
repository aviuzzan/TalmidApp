'use client'
// llll2 : page orpheline (reliee nulle part depuis la refonte inscriptions) —
// remplacee par une redirection vers Rentree a venir.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEcole } from '@/lib/ecole-context'

export default function GestionN1Redirect() {
  const router = useRouter()
  const ecole = useEcole()
  useEffect(() => {
    if (ecole?.slug) router.replace(`/${ecole.slug}/inscriptions`)
  }, [ecole?.slug, router])
  return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Redirection…</div>
}
