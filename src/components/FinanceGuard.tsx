'use client'
/**
 * FinanceGuard (llll2) — garde d'acces financier SANS shell.
 * A poser dans le layout.tsx d'un dossier dont le parent fournit deja EcoleAppLayout
 * (ex: familles/[id]/compte, inscriptions/contrat). Pour un dossier sans shell,
 * l'envelopper soi-meme : <EcoleAppLayout><FinanceGuard>{children}</FinanceGuard></EcoleAppLayout>.
 *
 * Regle identique partout : super_admin toujours OK, sinon profiles.acces_finances !== false.
 *
 * AUDIT P2 (06/08/2026) — « redirections muettes » : la garde redirigeait
 * automatiquement vers le dashboard, le message de refus ne restait affiche que
 * quelques millisecondes. Vecu utilisateur (constate sur le compte demo.gestion) :
 * clic sur un lien financier → retour silencieux au tableau de bord, sans jamais
 * comprendre pourquoi. La garde AFFICHE desormais l'ecran de refus, avec le motif
 * et un bouton de retour — plus aucune redirection automatique.
 * Seule exception : pas de session → page de connexion (rien a expliquer a un
 * utilisateur deconnecte).
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'

export default function FinanceGuard({ children, message }: { children: React.ReactNode; message?: string }) {
  const router = useRouter()
  const ecole = useEcole()
  const [autorise, setAutorise] = useState<boolean | null>(null)
  const [sansSession, setSansSession] = useState(false)

  useEffect(() => {
    ;(async () => {
      const s = createClient()
      const { data: { session } } = await s.auth.getSession()
      if (!session) { setSansSession(true); setAutorise(false); return }
      const { data: p } = await s.from('profiles')
        .select('role, acces_finances')
        .eq('id', session.user.id)
        .single()
      if (p?.role === 'super_admin') { setAutorise(true); return }
      setAutorise(p?.acces_finances !== false)
    })()
  }, [])

  useEffect(() => {
    if (sansSession && ecole?.slug) router.replace(`/${ecole.slug}/login`)
  }, [sansSession, ecole?.slug, router])

  if (autorise === null) return <div style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>Chargement…</div>
  if (autorise === false) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 36 }}>🔒</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E293B', marginTop: 12 }}>Accès finances non accordé</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginTop: 6, maxWidth: 460, margin: '6px auto 0', lineHeight: 1.6 }}>
        {message || 'Cette page contient des données financières et votre compte n\'a pas l\'accès finances.'}
        {' '}L&apos;accès s&apos;accorde par l&apos;administrateur principal dans Configuration → Comptes &amp; accès.
      </p>
      {ecole?.slug && (
        <button onClick={() => router.push(`/${ecole.slug}/dashboard`)}
          style={{ marginTop: 18, background: '#1E293B', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ← Retour au tableau de bord
        </button>
      )}
    </div>
  )
  return <>{children}</>
}
