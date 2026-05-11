'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { CATEGORIES, hasCategoryAccess, loadPermissions, Niveau, Categorie } from '@/lib/permissions'

type Stats = {
  familles: number
  eleves: number
  incomplets: number
  attente: number
  msgNonLus: number
}

export default function DashboardPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('')
  const [perms, setPerms] = useState<Record<string, Niveau>>({})
  const [isAdminPrincipal, setIsAdminPrincipal] = useState(false)
  const [stats, setStats] = useState<Stats>({ familles: 0, eleves: 0, incomplets: 0, attente: 0, msgNonLus: 0 })
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => { if (ecole?.id) load() }, [ecole?.id])

  async function load() {
    setLoading(true)
    const s = createClient()
    const { data: { session } } = await s.auth.getSession()
    if (!session) { router.push(`/${ecole.slug}/login`); return }

    const { data: profile } = await s.from('profiles').select('role').eq('id', session.user.id).single()
    setRole(profile?.role || '')

    const p = await loadPermissions(s, session.user.id, ecole.id)
    setPerms(p.perms)
    setIsAdminPrincipal(p.isAdminPrincipal)

    const userRole = profile?.role || ''
    const accessAdmin = userRole === 'super_admin' || userRole === 'admin' || p.isAdminPrincipal ||
      ['administratif', 'inscriptions'].some(m => (p.perms[m] || 'aucun') !== 'aucun')
    const accessMsg = userRole === 'super_admin' || userRole === 'admin' || p.isAdminPrincipal ||
      ['messagerie', 'documents'].some(m => (p.perms[m] || 'aucun') !== 'aucun')

    const now = new Date().toISOString().split('T')[0]
    const promises: Promise<any>[] = []
    if (accessAdmin) {
      promises.push(s.from('familles').select('*', { count: 'exact', head: true }))
      promises.push(s.from('enfants').select('*', { count: 'exact', head: true })
        .or(`date_entree.is.null,date_entree.lte.${now}`)
        .or(`date_sortie.is.null,date_sortie.gte.${now}`))
      promises.push(s.from('familles').select('*', { count: 'exact', head: true }).eq('statut_dossier', 'incomplet'))
      promises.push(s.from('enfants').select('*', { count: 'exact', head: true }).eq('statut_inscription', 'en_attente'))
    }
    if (accessMsg) {
      promises.push(s.from('messages').select('*', { count: 'exact', head: true }).eq('lu', false).eq('destinataire_type', 'agent'))
    }
    const results = await Promise.all(promises)
    let idx = 0
    const newStats: Stats = { familles: 0, eleves: 0, incomplets: 0, attente: 0, msgNonLus: 0 }
    if (accessAdmin) {
      newStats.familles = results[idx++]?.count ?? 0
      newStats.eleves = results[idx++]?.count ?? 0
      newStats.incomplets = results[idx++]?.count ?? 0
      newStats.attente = results[idx++]?.count ?? 0
    }
    if (accessMsg) {
      newStats.msgNonLus = results[idx++]?.count ?? 0
    }
    setStats(newStats)
    setLoading(false)
  }

  function categoryBadge(cat: Categorie): { text: string; tone: 'normal' | 'warn' | 'alert' } | null {
    if (cat.code === 'administration') {
      if (stats.incomplets > 0) return { text: `${stats.incomplets} dossier${stats.incomplets > 1 ? 's' : ''} incomplet${stats.incomplets > 1 ? 's' : ''}`, tone: 'warn' }
      if (stats.attente > 0) return { text: `${stats.attente} inscription${stats.attente > 1 ? 's' : ''} en attente`, tone: 'warn' }
      if (stats.familles > 0) return { text: `${stats.familles} famille${stats.familles > 1 ? 's' : ''}`, tone: 'normal' }
    }
    if (cat.code === 'communication') {
      if (stats.msgNonLus > 0) return { text: `${stats.msgNonLus} message${stats.msgNonLus > 1 ? 's' : ''} non lu${stats.msgNonLus > 1 ? 's' : ''}`, tone: 'alert' }
    }
    if (cat.code === 'pedagogie') return { text: 'Programmes & emplois du temps', tone: 'normal' }
    if (cat.code === 'finances') return { text: 'Factures & règlements', tone: 'normal' }
    if (cat.code === 'vie_scolaire') return { text: 'Bientôt disponible', tone: 'normal' }
    if (cat.code === 'configuration') {
      if (isAdminPrincipal) return { text: 'Admin principal', tone: 'normal' }
      return { text: 'Paramètres école', tone: 'normal' }
    }
    return null
  }

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  }

  const userName = role === 'super_admin' ? 'Super admin' : (isAdminPrincipal ? 'Admin principal' : 'Administrateur')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: 0 }}>Tableau de bord</h1>
          <p style={{ color: '#64748B', fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>
            {ecole.nom} · {today} · {userName}
          </p>
        </div>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
          📅 2026 / 2027
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
        {CATEGORIES.map(cat => {
          const accessible = hasCategoryAccess(cat, perms, role, isAdminPrincipal)
          const badge = accessible ? categoryBadge(cat) : null
          const onClick = accessible ? () => router.push(`/${ecole.slug}/${cat.hrefHub}`) : undefined

          return (
            <div key={cat.code} onClick={onClick}
              style={{
                background: accessible ? '#fff' : '#F8FAFC',
                border: `1px solid ${accessible ? '#E2E8F0' : '#E2E8F0'}`,
                borderRadius: 14,
                padding: 22,
                cursor: accessible ? 'pointer' : 'not-allowed',
                opacity: accessible ? 1 : 0.55,
                minHeight: 165,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { if (accessible) { (e.currentTarget as HTMLElement).style.borderColor = cat.couleur.border; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 18px rgba(15,23,42,0.06)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>

              <div>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: accessible ? cat.couleur.bg : '#F1F5F9',
                  color: accessible ? cat.couleur.fg : '#94A3B8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, marginBottom: 14,
                }}>{cat.icone}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: accessible ? '#1E293B' : '#64748B', marginBottom: 4 }}>
                  {cat.nom}
                </div>
                <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4 }}>
                  {cat.description}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                {accessible ? (
                  badge ? (
                    <span style={{
                      display: 'inline-block',
                      background: badge.tone === 'alert' ? '#FEE2E2' : badge.tone === 'warn' ? '#FEF3C7' : '#F1F5F9',
                      color: badge.tone === 'alert' ? '#991B1B' : badge.tone === 'warn' ? '#92400E' : '#475569',
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                    }}>{badge.text}</span>
                  ) : null
                ) : (
                  <span style={{
                    display: 'inline-block', color: '#94A3B8', fontSize: 11, fontStyle: 'italic',
                  }}>🔒 Accès non accordé</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
