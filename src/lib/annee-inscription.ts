/**
 * Résolution de "l'année d'inscription" d'une école.
 *
 * Deux notions d'année coexistent :
 *  - l'année de RÉFÉRENCE  = l'exercice courant (ex: 2025-2026), la base / le roster.
 *  - l'année d'INSCRIPTION = l'exercice sur lequel se fait tout le workflow
 *    (nouvelle inscription, réduction, contrat, paiement) — ex: 2026-2027.
 *
 * L'année d'inscription est l'exercice qui SUIT l'exercice courant :
 *  1. le suivant chaîné (exercice_suivant_id) de l'exercice courant ;
 *  2. sinon l'exercice en statut 'preparation' le plus récent ;
 *  3. sinon, calcul de secours (année scolaire suivante).
 */

export type AnneeInscription = {
  code: string
  exercice_id: string | null
  date_debut: string | null
  date_fin: string | null
}

// Calcul de secours : code de l'année scolaire SUIVANTE.
function anneeSuivanteCalculee(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() // 0-11 ; septembre = 8
  const debutCourant = m >= 8 ? y : y - 1
  return `${debutCourant + 1}-${debutCourant + 2}`
}

export async function getExerciceInscription(
  supabase: any,
  ecoleId: string
): Promise<AnneeInscription> {
  if (!ecoleId) {
    return { code: anneeSuivanteCalculee(), exercice_id: null, date_debut: null, date_fin: null }
  }

  // 1. Exercice courant de l'école
  let courant: any = null
  const { data: ecole } = await supabase
    .from('ecoles').select('exercice_courant_id').eq('id', ecoleId).maybeSingle()
  if (ecole?.exercice_courant_id) {
    const { data } = await supabase
      .from('exercices').select('*').eq('id', ecole.exercice_courant_id).maybeSingle()
    courant = data
  }
  if (!courant) {
    const { data } = await supabase
      .from('exercices').select('*')
      .eq('ecole_id', ecoleId).eq('statut', 'ouvert')
      .order('code', { ascending: false }).limit(1).maybeSingle()
    courant = data
  }

  // 2. Son suivant chaîné = l'année d'inscription
  if (courant?.exercice_suivant_id) {
    const { data } = await supabase
      .from('exercices').select('*').eq('id', courant.exercice_suivant_id).maybeSingle()
    if (data) {
      return { code: data.code, exercice_id: data.id, date_debut: data.date_debut, date_fin: data.date_fin }
    }
  }

  // 3. Sinon : l'exercice en préparation le plus récent
  const { data: prep } = await supabase
    .from('exercices').select('*')
    .eq('ecole_id', ecoleId).eq('statut', 'preparation')
    .order('code', { ascending: false }).limit(1).maybeSingle()
  if (prep) {
    return { code: prep.code, exercice_id: prep.id, date_debut: prep.date_debut, date_fin: prep.date_fin }
  }

  // 4. Secours : calcul de date
  return { code: anneeSuivanteCalculee(), exercice_id: null, date_debut: null, date_fin: null }
}
