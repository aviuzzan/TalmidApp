// llll2 : ce dossier n'avait AUCUN layout -> ni auth client ni verrou finances.
import EcoleAppLayout from '@/components/ui/EcoleAppLayout'
import FinanceGuard from '@/components/FinanceGuard'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <EcoleAppLayout><FinanceGuard>{children}</FinanceGuard></EcoleAppLayout>
}
