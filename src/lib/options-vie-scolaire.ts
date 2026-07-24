/**
 * Catégories "Vie scolaire" des tarifs (tarifs_secteur.categorie).
 * Source unique pour TarifsTab (Paramètres) et les pages /transport, /cantine.
 * NULL en BDD = tarif ordinaire (scolarité, frais...) sans page dédiée.
 */

export const CATEGORIES_OPTION: { value: string; label: string; icone: string }[] = [
  { value: 'transport', label: 'Transport', icone: '🚌' },
  { value: 'cantine', label: 'Cantine', icone: '🍽️' },
  { value: 'activite', label: 'Activité', icone: '🎨' },
  { value: 'autre', label: 'Autre', icone: '📦' },
]

export function labelCategorie(value: string | null | undefined): string {
  if (!value) return ''
  const c = CATEGORIES_OPTION.find(c => c.value === value)
  return c ? `${c.icone} ${c.label}` : value
}

export type PlacesOption = {
  tarif_id: string
  nb_inscrits: number
  nb_attente: number
  places_max: number | null
  complet: boolean
}

/** Charge les compteurs de places pour tous les tarifs d'une école/année via la RPC places_options. */
export async function chargerPlacesOptions(
  supabase: any,
  ecoleId: string,
  annee: string,
): Promise<Map<string, PlacesOption>> {
  const map = new Map<string, PlacesOption>()
  if (!ecoleId || !annee) return map
  const { data } = await supabase.rpc('places_options', { p_ecole_id: ecoleId, p_annee: annee })
  ;(data || []).forEach((r: any) => {
    map.set(r.tarif_id, {
      tarif_id: r.tarif_id,
      nb_inscrits: Number(r.nb_inscrits) || 0,
      nb_attente: Number(r.nb_attente) || 0,
      places_max: r.places_max == null ? null : Number(r.places_max),
      complet: !!r.complet,
    })
  })
  return map
}
