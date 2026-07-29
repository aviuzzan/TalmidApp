/**
 * Couche comptable partagée — imputation des lignes de facture.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Avant ssss2, une ligne de facture ne gardait AUCUN lien vers le poste
 * tarifaire qui l'avait produite : `construireLignesFacture` n'écrivait que
 * { facture_id, enfant_id, description, montant, deductible }. Le
 * rattachement n'existait plus que sous forme de texte dans le libellé.
 *
 * Conséquences constatées :
 *   - l'export FEC imputait TOUT sur le compte 706 codé en dur, quel que
 *     soit le poste (scolarité, cantine, transport… tout au même endroit) ;
 *   - la page « Compta analytique » lisait `facture_lignes.centre_cout`,
 *     que personne n'écrivait jamais → 100 % du CA tombait dans « Autre » ;
 *   - le champ `tarifs_secteur.code_comptable`, saisissable dans les
 *     Paramètres, n'était lu par aucune ligne de code.
 *
 * Ce module rétablit le lien et centralise l'imputation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRINCIPE : SNAPSHOT, PAS RÉFÉRENCE VIVANTE
 * ─────────────────────────────────────────────────────────────────────────
 * L'imputation est RECOPIÉE sur la ligne de facture au moment où la facture
 * est créée. Si l'école modifie ensuite le paramétrage d'un poste, les
 * factures déjà émises gardent leur imputation d'origine.
 *
 * C'est volontaire et non négociable : sans ça, le FEC d'un exercice clos
 * changerait rétroactivement à chaque changement de paramétrage, ce qui est
 * inacceptable pour un fichier réglementaire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DIMENSIONS ANALYTIQUES, PAS UNE
 * ─────────────────────────────────────────────────────────────────────────
 *   - `activite`    : secteur d'activité (enseignement, restauration,
 *                     transport…). Sert au résultat analytique par secteur.
 *                     C'est la dimension structurante.
 *   - `centre_cout` : dimension libre de gestion interne (site, niveau,
 *                     motif de remise, projet…). Facultative.
 *
 * Le champ texte historique `facture_lignes.centre_cout` n'est PLUS écrit.
 * Il porte une contrainte CHECK à vocabulaire fermé
 * ('scolarite','transport','cantine','navette','frais_inscription',
 * 'assurance','autre') : y écrire un code de section ferait échouer
 * l'insertion, donc la création de la facture entière. Plus aucun écran ne
 * le lit depuis la refonte de la page analytique, qui s'appuie désormais sur
 * `compte_id` et `activite_id`. On le laisse tel quel, en colonne morte.
 */

type AnySupabase = any

/** Clés d'imputation des lignes qui ne viennent pas d'un poste tarifaire. */
export type CleImputation =
  | 'client'
  | 'banque'
  | 'caisse'
  | 'assurance'
  | 'frais_inscription'
  | 'frais_reinscription'
  | 'reduction'
  | 'avoir'
  | 'poste_defaut'
  | 'creance_douteuse'
  | 'perte_creance'

export interface Imputation {
  compte_id: string | null
  compte_code: string | null
  compte_libelle: string | null
  activite_id: string | null
  activite_code: string | null
  centre_cout_id: string | null
  centre_cout_code: string | null
}

const IMPUTATION_VIDE: Imputation = {
  compte_id: null,
  compte_code: null,
  compte_libelle: null,
  activite_id: null,
  activite_code: null,
  centre_cout_id: null,
  centre_cout_code: null,
}

/**
 * Résolveur d'imputation pour une école, chargé une fois puis interrogé
 * en mémoire. Évite N requêtes pendant la construction d'une facture.
 */
export interface ResolveurImputation {
  /** Imputation d'un poste tarifaire, avec repli sur `poste_defaut`. */
  parTarif(tarifId: string | null | undefined): Imputation
  /** Imputation d'une ligne système (assurance, frais d'inscription…). */
  parCle(cle: CleImputation): Imputation
  /** true si l'école n'a aucun paramétrage comptable exploitable. */
  readonly vide: boolean
  /** Postes de l'école sans compte renseigné (pour l'écran de contrôle). */
  readonly tarifsSansCompte: string[]
}

/**
 * Charge le paramétrage comptable d'une école.
 *
 * Ne lève jamais : si la lecture échoue (RLS, table absente sur un
 * environnement pas encore migré), on renvoie un résolveur vide et la
 * facturation continue SANS imputation plutôt que d'échouer. Une facture
 * sans compte reste rattrapable ; une facture non créée bloque une famille.
 */
export async function chargerImputations(
  s: AnySupabase,
  ecoleId: string,
): Promise<ResolveurImputation> {
  const parTarifMap = new Map<string, Imputation>()
  const parCleMap = new Map<string, Imputation>()
  const sansCompte: string[] = []

  if (!ecoleId) return construireResolveur(parTarifMap, parCleMap, sansCompte)

  const [tarifsRes, defautsRes] = await Promise.all([
    s
      .from('tarifs_secteur')
      .select(
        'id, nom_poste, compte_id, activite_id, centre_cout_id,' +
          ' compte:comptes_comptables!tarifs_secteur_compte_id_fkey(id, code, libelle),' +
          ' activite:sections_analytiques!tarifs_secteur_activite_id_fkey(id, code),' +
          ' centre_cout:sections_analytiques!tarifs_secteur_centre_cout_id_fkey(id, code)',
      )
      .eq('ecole_id', ecoleId),
    s
      .from('imputations_defaut')
      .select(
        'cle, compte_id, activite_id,' +
          ' compte:comptes_comptables(id, code, libelle),' +
          ' activite:sections_analytiques(id, code)',
      )
      .eq('ecole_id', ecoleId),
  ])

  // Échec de lecture : on n'empêche pas la facturation, on impute juste rien.
  if (!tarifsRes?.error) {
    for (const t of tarifsRes?.data || []) {
      const imp: Imputation = {
        compte_id: t.compte_id ?? null,
        compte_code: t.compte?.code ?? null,
        compte_libelle: t.compte?.libelle ?? null,
        activite_id: t.activite_id ?? null,
        activite_code: t.activite?.code ?? null,
        centre_cout_id: t.centre_cout_id ?? null,
        centre_cout_code: t.centre_cout?.code ?? null,
      }
      parTarifMap.set(String(t.id), imp)
      if (!t.compte_id) sansCompte.push(t.nom_poste || String(t.id))
    }
  }

  if (!defautsRes?.error) {
    for (const d of defautsRes?.data || []) {
      parCleMap.set(String(d.cle), {
        compte_id: d.compte_id ?? null,
        compte_code: d.compte?.code ?? null,
        compte_libelle: d.compte?.libelle ?? null,
        activite_id: d.activite_id ?? null,
        activite_code: d.activite?.code ?? null,
        centre_cout_id: null,
        centre_cout_code: null,
      })
    }
  }

  return construireResolveur(parTarifMap, parCleMap, sansCompte)
}

function construireResolveur(
  parTarifMap: Map<string, Imputation>,
  parCleMap: Map<string, Imputation>,
  sansCompte: string[],
): ResolveurImputation {
  const defaut = () => parCleMap.get('poste_defaut') || IMPUTATION_VIDE
  return {
    parTarif(tarifId) {
      if (!tarifId) return defaut()
      const imp = parTarifMap.get(String(tarifId))
      if (!imp) return defaut()
      // Poste connu mais sans compte : on retombe sur le compte de repli
      // plutôt que de laisser la ligne sans imputation du tout.
      if (!imp.compte_id) {
        const d = defaut()
        return { ...imp, compte_id: d.compte_id, compte_code: d.compte_code, compte_libelle: d.compte_libelle }
      }
      return imp
    },
    parCle(cle) {
      return parCleMap.get(cle) || defaut()
    },
    get vide() {
      return parTarifMap.size === 0 && parCleMap.size === 0
    },
    get tarifsSansCompte() {
      return sansCompte
    },
  }
}

/**
 * Applique une imputation à une ligne de facture en construction.
 *
 * Renvoie un NOUVEL objet — ne mute pas l'entrée, pour que les appelants
 * puissent continuer à construire leurs lignes de façon déclarative.
 *
 * N'écrit délibérément PAS le champ texte `centre_cout` : voir l'en-tête du
 * fichier. Sa contrainte CHECK rejetterait un code de section et ferait
 * échouer l'insertion de toute la facture.
 */
export function imputer<T extends Record<string, any>>(
  ligne: T,
  imp: Imputation,
): T & {
  compte_id: string | null
  activite_id: string | null
  centre_cout_id: string | null
} {
  return {
    ...ligne,
    compte_id: imp.compte_id,
    activite_id: imp.activite_id,
    centre_cout_id: imp.centre_cout_id,
  }
}

/**
 * Dérive le compte de réduction en miroir du compte de produit.
 *
 * La nomenclature du secteur construit les comptes 709 en miroir exact des
 * comptes 706 : 70611 (enseignement) → 709611 (réduction sur enseignement),
 * 70614 (ramassage) → 709614. La règle mécanique est : insérer un « 9 »
 * après le « 70 ».
 *
 * Retourne null si le code ne suit pas ce schéma — on préfère ne rien
 * proposer plutôt que d'inventer un numéro de compte, ce qui serait pire
 * que pas de numéro du tout dans un fichier comptable.
 */
export function deriverCompteReduction(codeProduit: string | null | undefined): string | null {
  if (!codeProduit) return null
  const code = String(codeProduit).trim()
  if (!/^70[0-9]{2,}$/.test(code)) return null
  if (code.startsWith('709')) return code // déjà un compte de réduction
  return '709' + code.slice(2)
}

/**
 * Libellé lisible d'un compte, pour les écrans et les exports.
 * Ex. : « 706142 — Familles : navette »
 */
export function libelleCompte(code: string | null | undefined, libelle: string | null | undefined): string {
  if (!code && !libelle) return '—'
  if (!libelle) return String(code)
  if (!code) return String(libelle)
  return `${code} — ${libelle}`
}
