// eeee1 (audit module 4, P2-6) : en acces URL direct sous verrou finances, la page
// s'affichait vide (0 partout) au lieu d'un ecran de refus explicite — la RLS
// protegeait les donnees mais l'utilisateur pouvait croire a une famille sans
// echeancier. Meme garde que compte/engagement/attestation-fiscale.
import FinanceGuard from '@/components/FinanceGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FinanceGuard>{children}</FinanceGuard>
}
