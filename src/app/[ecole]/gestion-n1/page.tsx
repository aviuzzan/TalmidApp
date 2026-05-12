'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEcole } from '@/lib/ecole-context'

// Page conservée pour rétrocompat : redirige vers /inscriptions
// (la "gestion N+1" est fusionnée avec la campagne d'inscriptions)
export default function GestionN1Redirect() {
  const router = useRouter()
  const ecole = useEcole()
  useEffect(() => {
    if (ecole?.slug) router.replace(`/${ecole.slug}/inscriptions`)
  }, [ecole?.slug, router])
  return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Redirection vers les inscriptions...</div>
}
