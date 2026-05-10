// Pas de wrap : le layout parent /[ecole]/enfants/layout.tsx applique déjà EcoleAppLayout.
// Le wrapper ici causerait une double sidebar.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
