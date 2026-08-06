'use client'
import EcoleAppLayout from '@/components/ui/EcoleAppLayout'
import FinanceGuard from '@/components/FinanceGuard'

/**
 * Layout Bilan quotidien avec verrou d'acces finances : la page affiche des KPI
 * financiers journaliers (encaissements, soldes, etc.).
 * AUDIT P2 (06/08/2026) : garde partagee FinanceGuard, ecran de refus explicite
 * au lieu d'une redirection muette vers le dashboard (cf. FinanceGuard.tsx).
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EcoleAppLayout>
      <FinanceGuard message="Le bilan quotidien affiche des données financières et votre compte n'a pas l'accès finances.">
        {children}
      </FinanceGuard>
    </EcoleAppLayout>
  )
}
