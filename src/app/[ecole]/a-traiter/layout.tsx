// llll2 : ce dossier n'avait AUCUN layout -> pas d'auth cote client (RLS seule).
import EcoleAppLayout from '@/components/ui/EcoleAppLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <EcoleAppLayout>{children}</EcoleAppLayout>
}
