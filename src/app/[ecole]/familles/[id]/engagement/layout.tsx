// llll2 : engagement financier (montants, echeancier) -> verrou finances.
import FinanceGuard from '@/components/FinanceGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FinanceGuard>{children}</FinanceGuard>
}
