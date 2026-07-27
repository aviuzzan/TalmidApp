// llll2 : montants regles -> verrou finances (shell fourni par familles/layout).
import FinanceGuard from '@/components/FinanceGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FinanceGuard>{children}</FinanceGuard>
}
