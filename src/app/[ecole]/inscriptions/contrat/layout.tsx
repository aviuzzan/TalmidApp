// llll2 : montants du contrat + saisie papier (tarifs, echeancier) -> verrou finances.
// Shell fourni par inscriptions/layout.
import FinanceGuard from '@/components/FinanceGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FinanceGuard>{children}</FinanceGuard>
}
