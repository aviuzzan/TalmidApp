'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import EcoleSidebar from '@/components/ui/EcoleSidebar'
import ChatbotWidget from '@/components/ui/ChatbotWidget'
import GlobalSearch from '@/components/ui/GlobalSearch'
import ExerciceSelector from '@/components/ui/ExerciceSelector'
import EspaceSwitcher from '@/components/EspaceSwitcher'
import { useEcole } from '@/lib/ecole-context'
import { AccesFinancesProvider } from '@/lib/acces-finances'
import { routeMasquee } from '@/lib/etablissement'

export default function EcoleAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const ecole = useEcole()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(`/${ecole.slug}/login`)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, ecole_id')
        .eq('id', session.user.id)
        .single()

      // llll2 : le role 'agent' (compte limite a certains modules) accede aussi au back-office
      const estAdmin = profile && (profile.role === 'admin' || profile.role === 'super_admin' || profile.role === 'agent')

      // GARDE MULTI-ECOLES (gggg2) : le contexte actif doit correspondre a l'ecole
      // de l'URL. Avant : aucun controle -> un admin d'Eschel pouvait ouvrir
      // /beth-hanna/* (seule la RLS protegeait). Desormais :
      //  - contexte deja sur cette ecole (ou super_admin) -> ok
      //  - sinon, si le compte a un rattachement admin sur CETTE ecole -> bascule auto
      //    (c'est aussi ce qui permet a un parent d'Eschel d'etre admin de Beth Hanna)
      //  - sinon -> renvoi vers son propre espace
      const contexteOk = estAdmin && (profile!.role === 'super_admin' || profile!.ecole_id === ecole.id)
      if (!contexteOk) {
        try {
          const res = await fetch('/api/auth/activer-contexte', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
            body: JSON.stringify({ ecoleSlug: ecole.slug, espace: 'admin' }),
          })
          const json = await res.json()
          if (json?.ok) {
            // Contexte bascule sur cette ecole -> recharger proprement
            window.location.reload()
            return
          }
        } catch { /* tombe dans les redirections ci-dessous */ }

        // Aucun acces admin a cette ecole : renvoyer chacun chez soi
        if (profile?.role === 'parent') { router.push('/portail'); return }
        if (profile?.role === 'teacher' || profile?.role === 'prof') { router.push('/portail/prof'); return }
        if (estAdmin && profile?.ecole_id) {
          const { data: monEcole } = await supabase.from('ecoles').select('slug').eq('id', profile.ecole_id).maybeSingle()
          if (monEcole?.slug && monEcole.slug !== ecole.slug) { router.push(`/${monEcole.slug}/dashboard`); return }
        }
        router.push(`/${ecole.slug}/login`)
        return
      }

      setEmail(session.user.email ?? '')
      setRole(profile!.role)
      setReady(true)
    }
    check()
  }, [router, ecole.slug, ecole.id])

  if (!ready) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#F0F4FA',
    }}>
      <div style={{ color: '#64748B', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  return (
    <AccesFinancesProvider>
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4FA' }}>
      <EcoleSidebar userEmail={email} role={role} />
      <main className="ecole-main" style={{ flex: 1, overflowY: 'auto', maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Barre header globale avec sélecteur d'exercice, présent partout */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: 'rgba(240,244,250,0.94)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #E2E8F0',
          padding: '10px 28px',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        }}>
          <EspaceSwitcher compact />
          <ExerciceSelector />
        </div>
        <div style={{ flex: 1 }}>
          {/* ssss2 (Yeter) : un ecran masque pour ce profil reste inaccessible meme par URL directe */}
          {routeMasquee(pathname || '', ecole.slug, ecole.type_etablissement)
            ? <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Cette section n'est pas disponible pour ce type d'établissement.</div>
            : children}
        </div>
      </main>
      <GlobalSearch />
      <ChatbotWidget />
    </div>
    </AccesFinancesProvider>
  )
}
