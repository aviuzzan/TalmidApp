// Le layout parent /[ecole]/finances/layout.tsx wrap deja dans EcoleAppLayout.
// Pas besoin d'un layout local — supprime le double sidebar / double selecteur d'annee.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '24px 32px' }}>{children}</div>
}
