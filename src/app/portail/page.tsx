'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function PortailPage() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('famille_id, familles(*)')
        .eq('id', session.user.id)
        .single()

      if (!profile?.famille_id) { setLoading(false); return }

      const familleId = profile.famille_id
      const now = new Date().toISOString().split('T')[0]

      const [{ count: enfants }, { data: facture }] = await Promise.all([
        supabase.from('enfants').select('*', { count: 'exact', head: true })
          .eq('famille_id', familleId)
          .or(`date_entree.is.null,date_entree.lte.${now}`)
          .or(`date_sortie.is.null,date_sortie.gte.${now}`),
        supabase.from('factures_solde').select('*')
          .eq('famille_id', familleId)
          .eq('annee_scolaire', '2025/2026')
          .single(),
      ])

      setData({
        famille: (profile as any).familles,
        nbEnfants: enfants ?? 0,
        facture: facture ?? null,
      })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: 40 }}>Chargement...</div>

  if (!data?.famille) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>Bienvenue sur TalmidApp</h2>
      <p style={{ color: '#64748B', fontSize: 14 }}>Votre compte n'est pas encore lié à une famille. Contactez l'administration.</p>
    </div>
  )

  const solde = data.facture ? Number(data.facture.solde_restant) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome */}
      <div style={{
        background: 'linear-gradient(135deg, #1A3A6B, #2563EB)',
        borderRadius: 16, padding: '28px 32px', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            Bonjour, famille {data.famille.nom} 👋
          </h1>
          <p style={{ opacity: 0.8, fontSize: 14 }}>Année scolaire 2025 / 2026</p>
        </div>
        <div style={{ fontSize: 48, opacity: 0.3 }}>🏫</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { icon: '🎓', label: 'Élèves inscrits', value: data.nbEnfants, color: '#2563EB', bg: '#EFF6FF', action: () => router.push('/portail/enfants') },
          { icon: '📄', label: 'Facture 2025/2026', value: data.facture ? `${Number(data.facture.total_facture).toLocaleString('fr-FR')} €` : '—', color: '#059669', bg: '#ECFDF5', action: () => router.push('/portail/factures') },
          { icon: '💳', label: 'Solde restant', value: data.facture ? `${solde.toLocaleString('fr-FR')} €` : '—', color: solde > 0 ? '#DC2626' : '#059669', bg: solde > 0 ? '#FEF2F2' : '#ECFDF5', action: () => router.push('/portail/factures') },
        ].map(s => (
          <div key={s.label} onClick={s.action} style={{
            background: s.bg, borderRadius: 12, padding: '20px 24px', cursor: 'pointer',
            border: `1px solid ${s.bg}`, transition: 'transform 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { icon: '🎓', title: 'Mes enfants', desc: 'Consulter les informations de vos enfants', href: '/portail/enfants' },
          { icon: '💰', title: 'Mes factures', desc: 'Voir vos factures et règlements', href: '/portail/factures' },
          { icon: '📝', title: 'Inscriptions N+1', desc: 'Gérer les inscriptions 2026/2027', href: '/portail/inscriptions' },
          { icon: '📄', title: 'Documents', desc: 'Envoyer et consulter vos documents', href: '/portail/documents' },
          { icon: '📞', title: 'Contact', desc: 'Contacter l\'administration', href: 'mailto:admin@talmid.fr' },
        ].map(item => (
          <a key={item.title} href={item.href}
            style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '20px 24px', textDecoration: 'none', display: 'flex',
              alignItems: 'center', gap: 16, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563EB'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(37,99,235,0.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{item.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#94A3B8', fontSize: 18 }}>→</div>
          </a>
        ))}
      </div>
    </div>
  )
}
