'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { EcoleProvider, type Ecole } from '@/lib/ecole-context'

export default function EcoleLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const ecoleSlug = params.ecole as string
  const [ecole, setEcole] = useState<Ecole | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await createClient()
        .from('ecoles')
        .select('id, slug, nom, couleur_primaire, logo_url')
        .eq('slug', ecoleSlug)
        .eq('actif', true)
        .single()
      if (!data) setErreur(true)
      else setEcole(data)
      setLoading(false)
    }
    load()
  }, [ecoleSlug])

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#F0F4FA',
    }}>
      <div style={{ color: '#64748B', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  if (erreur) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#F0F4FA',
      flexDirection: 'column', gap: 12, fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ fontSize: 48 }}>🏫</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1E293B' }}>École introuvable</div>
      <div style={{ color: '#64748B', fontSize: 14, textAlign: 'center', maxWidth: 360 }}>
        L'espace « {ecoleSlug} » n'existe pas ou n'est pas encore actif.
      </div>
      <a href="/" style={{
        marginTop: 8, color: '#2563EB', fontSize: 13, textDecoration: 'none',
        background: '#EFF6FF', border: '1px solid #BFDBFE',
        padding: '8px 16px', borderRadius: 8, fontWeight: 500,
      }}>
        ← Retour à talmidapp.fr
      </a>
    </div>
  )

  return <EcoleProvider ecole={ecole!}>{children}</EcoleProvider>
}
