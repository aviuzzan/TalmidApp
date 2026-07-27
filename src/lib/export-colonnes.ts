/**
 * Définition des colonnes disponibles pour les exports CSV Familles et Élèves.
 * Chaque colonne : key (identifiant stable, stocké en localStorage), label (en-tête CSV),
 * defaut (cochée par défaut = colonne de l'export historique).
 */

export type ColonneExport = { key: string; label: string; defaut: boolean }

export const COLONNES_FAMILLES: ColonneExport[] = [
  // Colonnes de l'export historique (cochées par défaut)
  { key: 'numero', label: 'Numéro', defaut: true },
  { key: 'nom', label: 'Nom famille', defaut: true },
  { key: 'situation_maritale', label: 'Situation', defaut: true },
  { key: 'tranche_code', label: 'Code tranche', defaut: true },
  { key: 'tranche_libelle', label: 'Libellé tranche', defaut: true },
  { key: 'adresse', label: 'Adresse', defaut: true },
  { key: 'parent1_prenom', label: 'Resp1 prénom', defaut: true },
  { key: 'parent1_nom', label: 'Resp1 nom', defaut: true },
  { key: 'parent1_email', label: 'Resp1 email', defaut: true },
  { key: 'parent1_telephone', label: 'Resp1 tél', defaut: true },
  { key: 'parent2_prenom', label: 'Resp2 prénom', defaut: true },
  { key: 'parent2_nom', label: 'Resp2 nom', defaut: true },
  { key: 'parent2_email', label: 'Resp2 email', defaut: true },
  { key: 'parent2_telephone', label: 'Resp2 tél', defaut: true },
  // Colonnes supplémentaires (décochées par défaut)
  { key: 'mode_paiement', label: 'Mode de paiement', defaut: false },
  { key: 'statut_dossier', label: 'Statut dossier', defaut: false },
  { key: 'parent1_emploi', label: 'Resp1 profession', defaut: false },
  { key: 'parent2_emploi', label: 'Resp2 profession', defaut: false },
  { key: 'part_pere', label: 'Part père %', defaut: false },
  { key: 'part_mere', label: 'Part mère %', defaut: false },
  { key: 'garde', label: 'Type de garde', defaut: false },
  { key: 'autorite_parentale', label: 'Autorité parentale', defaut: false },
  { key: 'parent2_adresse', label: 'Resp2 adresse', defaut: false },
  { key: 'parent2_code_postal', label: 'Resp2 code postal', defaut: false },
  { key: 'parent2_ville', label: 'Resp2 ville', defaut: false },
]

export const COLONNES_ELEVES: ColonneExport[] = [
  // Colonnes de l'export historique (cochées par défaut)
  { key: 'prenom', label: 'Prénom', defaut: true },
  { key: 'nom', label: 'Nom', defaut: true },
  { key: 'date_naissance', label: 'Date naissance', defaut: true },
  { key: 'famille_numero', label: 'N° famille', defaut: true },
  { key: 'famille_nom', label: 'Nom famille', defaut: true },
  { key: 'classe', label: 'Classe', defaut: true },
  { key: 'statut', label: 'Statut', defaut: true },
  { key: 'transport', label: 'Transport', defaut: true },
  { key: 'instruction_religieuse', label: 'Instruction religieuse', defaut: true },
  { key: 'etude_garderie', label: 'Étude/Garderie', defaut: true },
  { key: 'annee', label: 'Année', defaut: true },
  // Colonnes supplémentaires (décochées par défaut)
  { key: 'deuxieme_prenom', label: 'Deuxième prénom', defaut: false },
  { key: 'genre', label: 'Genre', defaut: false },
  { key: 'lieu_naissance', label: 'Lieu de naissance', defaut: false },
  { key: 'ine', label: 'INE', defaut: false },
  { key: 'regime', label: 'Régime', defaut: false },
  { key: 'parent1_email', label: 'Email famille', defaut: false },
  { key: 'parent1_telephone', label: 'Téléphone famille', defaut: false },
  { key: 'date_sortie', label: 'Date sortie', defaut: false },
]
