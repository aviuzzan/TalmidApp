/**
 * Source UNIQUE du statut d'inscription d'un enfant pour une année scolaire.
 *
 * FIX P1-1 (audit portail parent 06/08) : l'accueil, « Mes enfants » et
 * « Inscriptions » calculaient chacun un statut localement, avec des résultats
 * contradictoires pour un même enfant (ex. « Inscrit » sur une page,
 * « En attente » sur une autre). Ce module dérive UN statut canonique à partir
 * des mêmes données brutes, et chaque page l'affiche tel quel.
 *
 * Règle produit décidée par Avi (règle a) : un enfant n'est « inscrit » que
 * lorsque le contrat de scolarisation de l'année est VALIDÉ par l'école
 * (= scolarité créée). Un contrat simplement soumis ne suffit pas.
 *
 * Cas particulier assumé : une admission REFUSÉE est distinguée du triptyque
 * de base (admission_en_cours / admis_sans_contrat / inscrit) — afficher
 * « en cours d'étude » pour un enfant refusé serait un mensonge.
 */

export type StatutInscriptionAnnee =
  | 'admission_en_cours'   // fiche pédagogique de l'année absente ou non validée ('soumis', 'en_etude'…)
  | 'admission_refusee'    // fiche pédagogique refusée (décision définitive pour l'année)
  | 'admis_sans_contrat'   // admission validée (ou enfant historique réinscriptible) mais pas de contrat validé
  | 'inscrit'              // contrat de l'année validé par l'école

/** Statuts de contrats_scolarisation considérés comme « validés » (scolarité créée). */
export const CONTRAT_STATUTS_VALIDES = ['valide', 'accepte', 'signe']

/** Statuts d'inscriptions_pedagogiques valant admission acceptée. */
export const ADMISSION_STATUTS_ACCEPTES = ['accepte', 'valide']

export interface DonneesStatutInscription {
  /** Statut de inscriptions_pedagogiques pour l'enfant et l'année (undefined/null = pas de fiche). */
  admissionStatut?: string | null
  /** enfants.statut_inscription (statut « historique » de l'enfant dans l'école). */
  statutEnfant?: string | null
  /** L'enfant figure-t-il dans contrat_enfants du contrat de l'année ? */
  dansContrat?: boolean
  /** Statut du contrat de scolarisation de la famille pour l'année. */
  contratStatut?: string | null
}

export function deriverStatutInscription(d: DonneesStatutInscription): StatutInscriptionAnnee {
  const adm = d.admissionStatut || null
  // Contrat validé + enfant dans le contrat → inscrit (seule voie vers 'inscrit').
  if (d.dansContrat && CONTRAT_STATUTS_VALIDES.includes(d.contratStatut || '')) return 'inscrit'
  if (adm === 'refuse') return 'admission_refusee'
  // Admis via fiche pédagogique validée, OU enfant déjà scolarisé sans fiche de
  // l'année (réinscription : chantier « fiche pédagogique = nouvel enfant
  // uniquement » — un enfant historique n'a pas à redemander une admission).
  const admisViaFiche = ADMISSION_STATUTS_ACCEPTES.includes(adm || '')
  const historiqueSansFiche = !adm && d.statutEnfant === 'inscrit'
  if (admisViaFiche || historiqueSansFiche) return 'admis_sans_contrat'
  return 'admission_en_cours'
}

export interface LibelleStatut {
  /** Clé i18n à passer à t(cle, libelle) — le libellé FR sert de fallback. */
  cle: string
  label: string
  color: string
  bg: string
}

/** Libellés français + couleurs harmonisés (mêmes codes visuels sur tout le portail). */
export function libelleStatutInscription(statut: StatutInscriptionAnnee): LibelleStatut {
  switch (statut) {
    case 'inscrit':
      return { cle: 'portail.statut_inscription.inscrit', label: '✓ Inscrit', color: '#065F46', bg: '#ECFDF5' }
    case 'admis_sans_contrat':
      return { cle: 'portail.statut_inscription.admis_sans_contrat', label: '✓ Admis — inscription à finaliser', color: '#1E40AF', bg: '#EFF6FF' }
    case 'admission_refusee':
      return { cle: 'portail.statut_inscription.admission_refusee', label: '✕ Admission refusée', color: '#991B1B', bg: '#FEF2F2' }
    case 'admission_en_cours':
    default:
      return { cle: 'portail.statut_inscription.admission_en_cours', label: "⏳ Admission en cours d'étude", color: '#9A3412', bg: '#FFF7ED' }
  }
}
