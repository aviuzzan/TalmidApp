/**
 * iiii5 (31/08/2026) — Gabarit du fichier d'import familles/élèves, partagé
 * entre l'écran Paramètres > Importer des données et la fiche de bienvenue
 * publique /bienvenue/<token> (la nouvelle école télécharge le même modèle).
 * Extrait de import/page.tsx sans modification de contenu (hhhh5 inclus).
 */

export type ColModele = { label: string; entity: 'famille' | 'enfant'; field: string; required?: boolean }

export const COLONNES_MODELE: ColModele[] = [
  { label: 'Nom de famille', entity: 'famille', field: 'nom', required: true },
  { label: 'Situation familiale (marie/celibataire/divorce/separe/veuf/non_connu)', entity: 'famille', field: 'situation_maritale' },
  { label: 'Parent 1 - Prenom', entity: 'famille', field: 'parent1_prenom' },
  { label: 'Parent 1 - Nom', entity: 'famille', field: 'parent1_nom' },
  { label: 'Parent 1 - Email', entity: 'famille', field: 'parent1_email', required: true },
  { label: 'Parent 1 - Telephone', entity: 'famille', field: 'parent1_telephone' },
  { label: 'Parent 1 - Profession', entity: 'famille', field: 'parent1_emploi' },
  { label: 'Parent 1 - Adresse', entity: 'famille', field: 'parent1_adresse' },
  { label: 'Parent 1 - Code postal', entity: 'famille', field: 'parent1_code_postal' },
  { label: 'Parent 1 - Ville', entity: 'famille', field: 'parent1_ville' },
  { label: 'Parent 2 - Prenom', entity: 'famille', field: 'parent2_prenom' },
  { label: 'Parent 2 - Nom', entity: 'famille', field: 'parent2_nom' },
  { label: 'Parent 2 - Email', entity: 'famille', field: 'parent2_email' },
  { label: 'Parent 2 - Telephone', entity: 'famille', field: 'parent2_telephone' },
  { label: 'Parent 2 - Profession', entity: 'famille', field: 'parent2_emploi' },
  { label: 'Parent 2 - Adresse', entity: 'famille', field: 'parent2_adresse' },
  { label: 'Parent 2 - Code postal', entity: 'famille', field: 'parent2_code_postal' },
  { label: 'Parent 2 - Ville', entity: 'famille', field: 'parent2_ville' },
  { label: 'Eleve - Prenom', entity: 'enfant', field: 'prenom', required: true },
  { label: 'Eleve - 2e prenom', entity: 'enfant', field: 'deuxieme_prenom' },
  { label: 'Eleve - Nom', entity: 'enfant', field: 'nom', required: true },
  { label: 'Eleve - Genre (M/F)', entity: 'enfant', field: 'genre' },
  { label: 'Eleve - Date de naissance (JJ/MM/AAAA)', entity: 'enfant', field: 'date_naissance' },
  { label: 'Eleve - Lieu de naissance', entity: 'enfant', field: 'lieu_naissance' },
  { label: 'Eleve - Classe actuelle', entity: 'enfant', field: 'classe' },
  { label: 'Eleve - Regime (demi_pension/externe/interne)', entity: 'enfant', field: 'regime' },
  { label: 'Eleve - Transport', entity: 'enfant', field: 'transport' },
  { label: 'Eleve - Instruction religieuse (oui/non)', entity: 'enfant', field: 'instruction_religieuse' },
  { label: 'Eleve - Etude/garderie (oui/non)', entity: 'enfant', field: 'etude_garderie' },
  { label: 'Eleve - INE', entity: 'enfant', field: 'ine' },
  // hhhh5 : reliquat de l'annee precedente geree HORS TalmidApp. Positif = la
  // famille doit, negatif = trop-percu. Colonne famille : sur une fratrie,
  // remplir sur une seule ligne suffit. Doit rester la DERNIERE colonne.
  { label: 'Solde a reprendre N-1 (EUR, positif = la famille doit)', entity: 'famille', field: 'solde_reprise' },
]

/** Contenu CSV du modèle (en-tête + ligne d'exemple des champs obligatoires). */
export function contenuModeleCSV(): string {
  const esc = (v: string) => '"' + v.replace(/"/g, '""') + '"'
  return [
    COLONNES_MODELE.map(c => esc(c.label)).join(';'),
    COLONNES_MODELE.map(c => esc(c.required ? '(obligatoire)' : '')).join(';'),
  ].join('\r\n')
}
