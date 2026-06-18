'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Page Contact du portail famille : reprend les coordonnees de l'ecole.
 */
export default function PortailContactPage() {
  const [ecole, setEcole] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setLoading(false); return }
      const { data: profile } = await s.from('profiles').select('ecole_id').eq('id', session.user.id).single()
      if (profile?.ecole_id) {
        const { data } = await s.from('ecoles')
          .select('nom, adresse, code_postal, ville, telephone, email_contact, logo_url, couleur_primaire')
          .eq('id', profile.ecole_id).single()
        setEcole(data)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (!ecole) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>Coordonnées indisponibles. Contactez votre établissement.</div>

  const primary = ecole.couleur_primaire || '#2563EB'
  const adresseComplete = [ecole.adresse, [ecole.code_postal, ecole.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  const lignes: { label: string; value: string | null; href?: string }[] = [
    { label: 'Établissement', value: ecole.nom || null },
    { label: 'Adresse', value: adresseComplete || null },
    { label: 'Téléphone', value: ecole.telephone || null, href: ecole.telephone ? `tel:${String(ecole.telephone).replace(/\s/g, '')}` : undefined },
    { label: 'E-mail', value: ecole.email_contact || null, href: ecole.email_contact ? `mailto:${ecole.email_contact}` : undefined },
  ]
  const visibles = lignes.filter(l => l.value)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'Inter, sans-serif' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Contacter l&apos;administration</h1>
        <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Les coordonnées de votre établissement.</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '6px 22px' }}>
        {visibles.length === 0 ? (
          <div style={{ padding: '20px 0', color: '#94A3B8', fontSize: 13 }}>Aucune coordonnée renseignée.</div>
        ) : visibles.map((l, i) => (
          <div key={l.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '14px 0', borderBottom: i < visibles.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
            <div style={{ minWidth: 110, flex: '0 0 auto', fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 2 }}>{l.label}</div>
            <div style={{ fontSize: 14, color: '#1E293B', fontWeight: 500 }}>
              {l.href ? <a href={l.href} style={{ color: primary, textDecoration: 'none' }}>{l.value}</a> : l.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 12, color: '#1E40AF' }}>
        Pour un échange écrit, vous pouvez aussi utiliser la <a href="/portail/messages" style={{ color: '#1E40AF', fontWeight: 600 }}>messagerie</a> de votre espace famille.
      </div>
    </div>
  )
}
