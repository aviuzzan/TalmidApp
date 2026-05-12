/**
 * Helper unique pour récupérer l'année scolaire courante d'une école.
 *
 * Priorité :
 *   1. Exercice avec statut = 'ouvert' pour cette école
 *   2. Sinon, calcul basé sur la date du jour (sept-août = nouvelle année)
 *
 * À utiliser PARTOUT au lieu des constantes hardcodées 'ANNEE = 2025-2026'.
 */
import { createClient } from '@/lib/supabase'

export type AnneeCourante = {
  code: string                  // ex: '2025-2026'
  debut: Date                   // 1er septembre
  fin: Date                     // 31 août année suivante
  exercice_id: string | null    // null si pas d'exercice configuré
}

/**
 * Calcule l'année scolaire à partir d'une date donnée.
 * Du 1er sept au 31 août = même année scolaire.
 */
export function calcAnneeDepuisDate(d: Date = new Date()): { code: string; debut: Date; fin: Date } {
  const y = d.getFullYear()
  const m = d.getMonth() // 0-11
  // Avant septembre (mois < 8), on est encore dans l'année scolaire précédente
  const debutAnnee = m >= 8 ? y : y - 1
  const finAnnee = debutAnnee + 1
  return {
    code: `${debutAnnee}-${finAnnee}`,
    debut: new Date(debutAnnee, 8, 1),
    fin: new Date(finAnnee, 7, 31),
  }
}

/**
 * Récupère l'année scolaire courante pour une école.
 * Cherche un exercice `ouvert` ; sinon retombe sur le calcul date.
 */
export async function getAnneeCourante(ecoleId: string | null | undefined): Promise<AnneeCourante> {
  if (ecoleId) {
    try {
      const s = createClient()
      const { data } = await s
        .from('exercices')
        .select('id, code, date_debut, date_fin')
        .eq('ecole_id', ecoleId)
        .eq('statut', 'ouvert')
        .limit(1)
        .maybeSingle()
      if (data) {
        return {
          code: data.code,
          debut: new Date(data.date_debut),
          fin: new Date(data.date_fin),
          exercice_id: data.id,
        }
      }
    } catch { /* fallback below */ }
  }
  const calc = calcAnneeDepuisDate()
  return { ...calc, exercice_id: null }
}

/**
 * Version synchrone — utilise uniquement le calcul date.
 * Pratique pour défaut initial avant chargement async.
 */
export function getAnneeCouranteSync(): string {
  return calcAnneeDepuisDate().code
}

/**
 * Liste les années scolaires utilisables (courante + 2 futures + 1 passée).
 * Utile pour les sélecteurs.
 */
export function listAnneesUtilisables(): string[] {
  const courante = calcAnneeDepuisDate()
  const debutY = parseInt(courante.code.split('-')[0])
  return [
    `${debutY - 1}-${debutY}`,
    `${debutY}-${debutY + 1}`,
    `${debutY + 1}-${debutY + 2}`,
  ]
}
