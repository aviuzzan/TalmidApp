'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import { CATEGORIES, hasCategoryAccess, loadPermissions, Niveau, Categorie } from '@/lib/permissions'
import ExerciceSelector from '@/components/ui/ExerciceSelector'

type Stats = {
  familles: number
  eleves: number
  incomplets: number
  attente: number
  msgNonLus: number
  factures_impayees: number
  montant_impayes: number
  professeurs: number
  classes: number
}

export default function DashboardPage() {
  const router = useRouter()
  const ecole = useEcole()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string>('')
  const [perms, setPerms] = useState<Record<string, Niveau>>({})
  const [isAdminPrincipal, setIsAdminPrincipal] = useState(false)
  const [stats, setStats] = useState<Stats>({ familles: 0, eleves: 0, incomplets: 0, attente: 0, msgNonLus: 0, factures_impayees: 0, montant_impayes: 0, professeurs: 0, classes: 0 })
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
    const newStats: Stats = { familles: 0, eleves: 0, incomplets: 0, attente: 0, msgNonLus: 0, factures_impayees: 0, montant_impayes: 0, professeurs: 0, classes: 0 }

    if (accessAdmin) {
      const [famR, enfR, incR, attR, factR, profR, clsR] = await Promise.all([
        s.from('familles').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('enfants').select('*', { count: 'exact', head: true })
          .eq('ecole_id', ecole.id)
          .or(`date_entree.is.null,date_entree.lte.${now}`)
          .or(`date_sortie.is.null,date_sortie.gte.${now}`),
        s.from('familles').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('statut_dossier', 'incomplet'),
        s.from('enfants').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id).eq('statut_inscription', 'en_attente'),
        // Factures impayées (solde > 0, non annulées) via vue + jointure famille
        s.from('factures_solde').select('id, solde_restant, familles!inner(ecole_id)')
          .gt('solde_restant', 0).neq('statut', 'annule')
          .eq('familles.ecole_id', ecole.id),
        s.from('professeurs').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
        s.from('classes').select('*', { count: 'exact', head: true }).eq('ecole_id', ecole.id),
      ])
      newStats.familles = famR?.count ?? 0
      newStats.eleves = enfR?.count ?? 0
      newStats.incomplets = incR?.count ?? 0
      newStats.attente = attR?.count ?? 0
      newStats.factures_impayees = (factR.data || []).length
      newStats.montant_impayes = (factR.data || []).reduce((sum: number, f: any) => sum + Number(f.solde_restant || 0), 0)
      newStats.professeurs = profR?.count ?? 0
      newStats.classes = clsR?.count ?? 0
    }
    setStats(newStats)
    setLoading(false)
  }

  function categoryBadge(cat: Categorie): { text: string; tone: 'normal' | 'warn' | 'alert' } | null {
    if (cat.code === 'administration') {
      // Priorité : alertes > stats
      if (stats.incomplets > 0) return { text: `⚠ ${stats.incomplets} dossier${stats.incomplets > 1 ? 's' : ''} incomplet${stats.incomplets > 1 ? 's' : ''}`, tone: 'warn' }
      if (stats.attente > 0) return { text: `⏳ ${stats.attente} inscription${stats.attente > 1 ? 's' : ''} en attente`, tone: 'warn' }
      const parts = []
      if (stats.familles > 0) parts.push(`${stats.familles} famille${stats.familles > 1 ? 's' : ''}`)
      if (stats.eleves > 0) parts.push(`${stats.eleves} élève${stats.eleves > 1 ? 's' : ''}`)
      if (parts.length > 0) return { text: parts.join(' · '), tone: 'normal' }
      return { text: 'Aucune famille', tone: 'normal' }
    }
    if (cat.code === 'finances') {
      if (stats.montant_impayes > 0) {
        const montant = Math.round(stats.montant_impayes).toLocaleString('fr-FR')
        return { text: `💰 ${stats.factures_impayees} impayée${stats.factures_impayees > 1 ? 's' : ''} · ${montant} €`, tone: 'alert' }
      }
      return { text: '✓ Tous les comptes à jour', tone: 'normal' }
    }
    if (cat.code === 'pedagogie') {
      const parts = []
      if (stats.professeurs > 0) parts.push(`${stats.professeurs} prof${stats.professeurs > 1 ? 's' : ''}`)
      if (stats.classes > 0) parts.push(`${stats.classes} classe${stats.classes > 1 ? 's' : ''}`)
      if (parts.length > 0) return { text: parts.join(' · '), tone: 'normal' }
      return { text: 'Programmes & emplois du temps', tone: 'normal' }
    }
    if (cat.code === 'communication') {
      if (stats.msgNonLus > 0) return { text: `${stats.msgNonLus} message${stats.msgNonLus > 1 ? 's' : ''} non lu${stats.msgNonLus > 1 ? 's' : ''}`, tone: 'alert' }
      return { text: 'Messagerie & documents', tone: 'normal' }
    }
    if (cat.code === 'vie_scolaire') return { text: 'Présences · transport · cantine', tone: 'normal' }
    if (cat.code === 'configuration') {
      if (isAdminPrincipal) return { text: '👑 Admin principal', tone: 'normal' }
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
        <ExerciceSelector />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 260px))', gap: 18, justifyContent: 'center' }}>
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
