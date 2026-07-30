// vvvv2 : la demande de réduction est un OBJET FINANCIER (arbitrage Avi, 30/07).
// Elle expose le tarif proposé, le tarif accordé, les revenus déclarés de la
// famille et tout le détail du dossier — 22 montants sur la seule page de
// détail. Le layout voisin `inscriptions/contrat` était verrouillé depuis
// llll2, celui-ci ne l'a jamais été : un compte sans accès finances y arrivait
// par un lien, par la recherche globale ou depuis l'onglet « Demandes de
// réduction », et voyait l'ensemble.
//
// Pas de wrap de shell : le layout parent /[ecole]/inscriptions/layout.tsx
// applique déjà EcoleAppLayout, l'envelopper ici doublerait la sidebar.
import FinanceGuard from '@/components/FinanceGuard'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FinanceGuard>{children}</FinanceGuard>
}
