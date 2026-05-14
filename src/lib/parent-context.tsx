'use client'
import { createContext, useContext } from 'react'

/**
 * Contexte parent pour le portail famille.
 * Gère les familles à parents séparés : chaque login est rattaché à un parent
 * (parent1 / parent2). Le parent "principal" signe les contrats et fait les
 * démarches N+1 ; le secondaire les consulte. Chaque parent ne voit que sa part
 * financière.
 */
export interface ParentCtx {
  parentSlot: 'parent1' | 'parent2'
  estSeparee: boolean
  estPrincipal: boolean
  partPct: number // part de ce parent en % (0-100). 100 si famille non séparée.
}

export const ParentContext = createContext<ParentCtx>({
  parentSlot: 'parent1',
  estSeparee: false,
  estPrincipal: true,
  partPct: 100,
})

export function useParentCtx(): ParentCtx {
  return useContext(ParentContext)
}
