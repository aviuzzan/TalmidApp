'use client'
import EcoleAppLayout from '@/components/ui/EcoleAppLayout'
import FinanceGuard from '@/components/FinanceGuard'

/**
 * Layout finances avec verrou d'acces (empeche l'acces par URL directe pour un
 * admin sans acces finances).
 *
 * AUDIT P2 (06/08/2026) — « redirections muettes » : ce layout dupliquait la garde
 * et redirigeait automatiquement vers le dashboard (message visible quelques ms).
 * La garde partagee FinanceGuard affiche desormais un ecran de refus explicite
 * (motif + bouton retour) — logique unique, plus de redirection silencieuse.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EcoleAppLayout>
      <FinanceGuard>{children}</FinanceGuard>
    </EcoleAppLayout>
  )
}
