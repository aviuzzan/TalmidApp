'use client'
import { createContext, useContext } from 'react'

export type Ecole = {
  id: string
  slug: string
  nom: string
  couleur_primaire: string
  logo_url: string | null
}

const EcoleContext = createContext<Ecole | null>(null)

export function EcoleProvider({ ecole, children }: { ecole: Ecole; children: React.ReactNode }) {
  return <EcoleContext.Provider value={ecole}>{children}</EcoleContext.Provider>
}

export function useEcole(): Ecole {
  const ctx = useContext(EcoleContext)
  if (!ctx) throw new Error('useEcole doit être utilisé à l\'intérieur d\'un EcoleProvider')
  return ctx
}
