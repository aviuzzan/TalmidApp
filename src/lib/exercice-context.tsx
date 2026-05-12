'use client'
import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { useEcole } from '@/lib/ecole-context'
import {
  Exercice,
  getExerciceCourant,
  listExercices,
  setExerciceCourant as dbSetExerciceCourant,
} from '@/lib/exercice'

type Ctx = {
  exercice: Exercice | null
  exerciceSelectionne: Exercice | null
  exercices: Exercice[]
  loading: boolean
  selectExercice: (exId: string) => Promise<void>
  changeExerciceCourant: (exId: string) => Promise<void>
  reload: () => Promise<void>
}

const ExerciceContext = createContext<Ctx>({
  exercice: null,
  exerciceSelectionne: null,
  exercices: [],
  loading: true,
  selectExercice: async () => {},
  changeExerciceCourant: async () => {},
  reload: async () => {},
})

export function ExerciceProvider({ children }: { children: ReactNode }) {
  const ecole = useEcole()
  // useMemo pour stabiliser la reference du client Supabase entre les renders.
  // Sinon le useCallback ci-dessous voit supabase changer a chaque render,
  // re-execute le useEffect, et setLoading(true) -> setLoading(false) en boucle
  // ce qui fait clignoter le bouton "exercice" dans le header.
  const supabase = useMemo(() => createClient(), [])
  const [exercice, setExercice] = useState<Exercice | null>(null)
  const [exerciceSelectionne, setExerciceSelectionne] = useState<Exercice | null>(null)
  const [exercices, setExercices] = useState<Exercice[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!ecole?.id) return
    setLoading(true)
    const [courant, list] = await Promise.all([
      getExerciceCourant(supabase, ecole.id),
      listExercices(supabase, ecole.id),
    ])
    setExercice(courant)
    setExercices(list)

    if (typeof window !== 'undefined') {
      const storedId = localStorage.getItem(`talmid_exercice_${ecole.id}`)
      if (storedId) {
        const stored = list.find(e => e.id === storedId)
        if (stored) {
          setExerciceSelectionne(stored)
          setLoading(false)
          return
        }
      }
    }
    setExerciceSelectionne(courant)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecole?.id])

  useEffect(() => { reload() }, [reload])

  async function selectExercice(exId: string) {
    const ex = exercices.find(e => e.id === exId)
    if (!ex) return
    setExerciceSelectionne(ex)
    if (typeof window !== 'undefined' && ecole?.id) {
      localStorage.setItem(`talmid_exercice_${ecole.id}`, exId)
    }
  }

  async function changeExerciceCourant(exId: string) {
    if (!ecole?.id) return
    const res = await dbSetExerciceCourant(supabase, ecole.id, exId)
    if (res.ok) {
      const ex = exercices.find(e => e.id === exId)
      if (ex) setExercice(ex)
    }
  }

  return (
    <ExerciceContext.Provider value={{
      exercice,
      exerciceSelectionne,
      exercices,
      loading,
      selectExercice,
      changeExerciceCourant,
      reload,
    }}>
      {children}
    </ExerciceContext.Provider>
  )
}

export function useExercice() {
  return useContext(ExerciceContext)
}

export function useAnneeScolaireCode(): string | null {
  const { exerciceSelectionne } = useExercice()
  return exerciceSelectionne?.code ?? null
}

export function useExerciceId(): string | null {
  const { exerciceSelectionne } = useExercice()
  return exerciceSelectionne?.id ?? null
}
