'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * gggg5 (31/08/2026) — Porte d'entrée de l'app installée sur téléphone (PWA).
 *
 * Problème d'Avi : « Sur l'écran d'accueil » iOS utilise le start_url du
 * manifest (« / ») quelle que soit la page d'où on ajoute l'icône → l'app
 * installée s'ouvrait TOUJOURS sur la vitrine commerciale, jamais sur l'école.
 *
 * Le manifest pointe désormais ici (/app), qui aiguille :
 *  - session vivante → l'espace du profil actif (admin/agent → dashboard de
 *    son école via profiles.ecole_id → ecoles.slug ; super_admin sans école →
 *    /admin ; prof → /portail/prof ; parent → /portail)
 *  - pas de session → la page de connexion de la dernière école utilisée
 *    (localStorage talmidapp_derniere_ecole, posé par la page de login),
 *    sinon la vitrine.
 * Jamais de formulaire ici : on ne fait que rediriger.
 */
export default function EntreeApp() {
  const router = useRouter()

  useEffect(() => {
    let annule = false
    ;(async () => {
      const s = createClient()
      try {
        const { data: { session } } = await s.auth.getSession()
        if (annule) return
        if (session) {
          const { data: profile } = await s
            .from('profiles').select('role, ecole_id').eq('id', session.user.id).single()
          if (annule) return
          const role = profile?.role
          if (role === 'parent') { router.replace('/portail'); return }
          if (role === 'teacher') { router.replace('/portail/prof'); return }
          if (role === 'admin' || role === 'super_admin' || role === 'agent') {
            if (profile?.ecole_id) {
              const { data: ec } = await s.from('ecoles').select('slug').eq('id', profile.ecole_id).single()
              if (annule) return
              if (ec?.slug) { router.replace('/' + ec.slug + '/dashboard'); return }
            }
            if (role === 'super_admin') { router.replace('/admin'); return }
          }
        }
      } catch { /* on retombe sur l'aiguillage sans session */ }
      let slug: string | null = null
      try { slug = localStorage.getItem('talmidapp_derniere_ecole') } catch { /* stockage indisponible */ }
      router.replace(slug ? '/' + slug + '/login' : '/')
    })()
    return () => { annule = true }
  }, [router])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F0F4FA', color: '#64748B', fontFamily: 'Inter, sans-serif',
      fontSize: 15, fontWeight: 600, textAlign: 'center', padding: 24,
    }}>
      Ouverture de TalmidApp…
    </div>
  )
}
