'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

/**
 * Catégorie « Démarches & documents » du portail famille.
 * Page de regroupement : inscriptions N+1, documents, santé, messagerie, contact.
 *
 * FIX P2-7 (audit portail parent 06/08) : /portail/sante et /portail/messages
 * n'avaient aucun point d'entrée visible (routes accessibles uniquement en
 * tapant l'URL). On ajoute deux cartes ici, filtrées par les modules actifs
 * de l'école (même règle que le layout portail et la page Mes enfants).
 */
export default function DemarchesPage() {
  const { t } = useI18n()
  const [modulesActifs, setModulesActifs] = useState<string[] | null>(null) // null = tous actifs

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles').select('ecole_id').eq('id', session.user.id).single()
      if (!profile?.ecole_id) return
      const { data: ecoleConf } = await supabase
        .from('ecoles').select('portail_modules_actifs')
        .eq('id', profile.ecole_id).single()
      if (Array.isArray((ecoleConf as any)?.portail_modules_actifs)) {
        setModulesActifs((ecoleConf as any).portail_modules_actifs)
      }
    }
    load()
  }, [])

  const items = [
    {
      icon: '📝',
      title: t('portail.demarches.item.inscriptions.title'),
      desc: t('portail.demarches.item.inscriptions.desc'),
      href: '/portail/inscriptions',
      modules: null as string[] | null,
    },
    {
      icon: '📄',
      // FIX P2-6 (audit portail parent 06/08) : « Consulter les documents de l'école »
      // — l'envoi de documents famille→école n'existe pas, on ne le promet plus.
      title: t('portail.demarches.item.documents.title'),
      desc: t('portail.demarches.item.documents.desc'),
      href: '/portail/documents',
      modules: null as string[] | null,
    },
    {
      icon: '🏥',
      title: t('portail.demarches.item.sante.title'),
      desc: t('portail.demarches.item.sante.desc'),
      href: '/portail/sante',
      modules: ['pedagogie', 'administratif'],
    },
    {
      icon: '💬',
      title: t('portail.demarches.item.messages.title'),
      desc: t('portail.demarches.item.messages.desc'),
      href: '/portail/messages',
      modules: ['messagerie'],
    },
    {
      icon: '📞',
      title: t('portail.demarches.item.contact.title'),
      desc: t('portail.demarches.item.contact.desc'),
      href: '/portail/contact',
      modules: null as string[] | null,
    },
  ].filter(item => {
    // Même règle que le layout portail : null = toujours visible ; sinon la carte
    // est visible si au moins un module requis est actif (ou si l'école n'a pas
    // restreint ses modules).
    if (!item.modules) return true
    if (!modulesActifs) return true
    return item.modules.some(m => modulesActifs.includes(m))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>{t('portail.demarches.title')}</h1>
        <p style={{ color: '#64748B', fontSize: 13 }}>{t('portail.demarches.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {items.map(item => (
          <a key={item.href} href={item.href}
            style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '22px 24px', textDecoration: 'none', display: 'flex',
              flexDirection: 'column', gap: 10, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#2563EB'; el.style.boxShadow = '0 4px 12px rgba(37,99,235,0.1)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#E2E8F0'; el.style.boxShadow = 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{item.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>{item.title}</div>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>{item.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
