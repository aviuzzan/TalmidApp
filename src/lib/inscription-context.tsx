'use client'
import { createContext, useContext } from 'react'

/**
 * Contexte de "l'année d'inscription" pour le portail famille.
 * La valeur est résolue par le layout du portail (qui connaît l'ecole_id du parent)
 * via getExerciceInscription(), puis fournie ici.
 *
 * Usage dans une page portail :
 *   const { anneeInscription, exerciceInscriptionId } = useAnneeInscription()
 */

export type InscriptionCtxValue = {
  anneeInscription: string             // ex: "2026-2027"
  exerciceInscriptionId: string | null // id de l'exercice correspondant
}

export const InscriptionContext = createContext<InscriptionCtxValue>({
  anneeInscription: '',
  exerciceInscriptionId: null,
})

export function useAnneeInscription(): InscriptionCtxValue {
  return useContext(InscriptionContext)
}
