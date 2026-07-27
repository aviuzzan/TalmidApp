/**
 * Catalogue des encarts d'aide affichés en haut des pages admin.
 * Utilisé par <AidePage route="..." /> (src/components/ui/AidePage.tsx).
 * Clé = identifiant de route (les sous-pages utilisent un tiret : finances-relances).
 */
export const AIDE_PAGES: Record<string, { titre: string; points: string[] }> = {
  direction: {
    titre: 'Pilotage de l’école en un coup d’œil',
    points: [
      'Consultez les indicateurs clés de l’année : effectifs, finances (taux de recouvrement), retards de paiement et inscriptions N+1.',
      'Cliquez sur « 📥 Export CSV » pour télécharger les indicateurs, ou sur « 🖨️ Imprimer » pour une version papier.',
      'En cas de retards de paiement, cliquez sur « Lancer une relance → » pour ouvrir directement la page des relances.',
      'Cette page est en lecture seule : rien n’y est modifié.',
    ],
  },
  finances: {
    titre: 'Suivre les factures et enregistrer les paiements',
    points: [
      'Passez de l’onglet « 📄 Factures » à « 💸 Paiements » pour voir toutes les factures et tous les règlements de l’année.',
      'Cliquez sur « + Nouvelle facture » pour facturer une famille, ou sur « + Saisir un paiement » (onglet Paiements) pour enregistrer un règlement.',
      'Sur une ligne de facture, cliquez sur « 💰 Encaisser » pour saisir un règlement, ou « Voir → » pour ouvrir le détail de la facture.',
      'Dans l’onglet Paiements, filtrez par famille, mode de règlement et période pour retrouver un règlement précis.',
      'Cliquez sur « Gérer les tarifs → » en haut à droite pour ajuster les tranches et tarifs de facturation.',
    ],
  },
  'finances-relances': {
    titre: 'Relancer les familles en retard de paiement',
    points: [
      'Repérez les familles en retard : dû à date, solde annuel et prochaine échéance sont affichés pour chaque facture.',
      'Cliquez sur « Envoyer N1 / N2 / N3 » pour envoyer la relance suivante : rappel amical, puis relance, puis mise en demeure.',
      'Cochez « Voir toutes les factures avec solde » pour élargir la liste aux familles qui ont un solde sans être en retard.',
    ],
  },
  'finances-rapprochement': {
    titre: 'Pointer le relevé bancaire contre les factures',
    points: [
      'Collez votre relevé bancaire (format date;libellé;montant) dans la zone de texte, puis cliquez sur « 📥 Importer les mouvements ».',
      'Pour chaque mouvement, cliquez sur « ✓ Confirmer » si la facture suggérée est la bonne, ou choisissez la facture manuellement dans la liste déroulante.',
      'Filtrez avec « À rapprocher / Rapprochés / Tous » pour suivre l’avancement, et cliquez sur « Ignorer » pour écarter un mouvement sans lien avec une facture.',
    ],
  },
  presences: {
    titre: 'Pointer les présences de la journée',
    points: [
      'Choisissez la date, la demi-journée (matin / après-midi / journée) et la classe pour afficher les élèves.',
      'Cliquez sur ✓ Présent, ✕ Absent, ⏰ Retard ou ↩ Sortie sur chaque ligne ; un motif vous est demandé pour les absences et les retards.',
      'Cliquez sur « ✓ Tous présents » pour pointer toute la classe d’un coup, puis corrigez seulement les exceptions.',
      'Les compteurs en haut récapitulent présents, absents, retards et élèves non pointés.',
    ],
  },
  bulletins: {
    titre: 'Générer et diffuser les bulletins',
    points: [
      'Choisissez le trimestre et la classe, puis cliquez sur « ⚙ Générer pour cette classe » : les moyennes sont calculées à partir des notes saisies.',
      'Cliquez sur « Voir / Imprimer → » pour ouvrir, compléter et imprimer le bulletin d’un élève.',
      'Cliquez sur « ✓ Visible / 🔒 Masqué » pour rendre un bulletin consultable (ou non) par la famille sur le portail.',
    ],
  },
  notes: {
    titre: 'Créer les évaluations et saisir les notes',
    points: [
      'Onglet « 📚 Matières » : cliquez sur « + Matière » pour créer les matières enseignées (à faire une fois en début d’année).',
      'Onglet « 📊 Évaluations » : cliquez sur « + Nouvelle évaluation » pour créer un contrôle ou un devoir, avec matière, classe, barème et coefficient.',
      'Cliquez sur « 📝 Saisir notes » sur une évaluation pour entrer note, absence et appréciation de chaque élève.',
      'Filtrez par classe et par trimestre pour retrouver vos évaluations ; le bouton 🗑 supprime une évaluation.',
    ],
  },
  'demandes-inscription': {
    titre: 'Inviter et traiter les nouvelles familles',
    points: [
      'Cliquez sur « + Envoyer un lien d’inscription » pour inviter une nouvelle famille à remplir sa demande en ligne.',
      'Cliquez sur une carte (Liens envoyés, À traiter, Acceptées, Refusées) pour filtrer le tableau des demandes.',
      'Ouvrez « Voir le détail » d’une demande, puis cliquez sur « Accepter et créer la famille » (famille, enfant et compte parent créés automatiquement) ou « Refuser » avec un motif.',
      'Dans le détail, « 📄 Imprimer / PDF » ouvre une version imprimable de la demande.',
    ],
  },
  inscriptions: {
    titre: 'Gérer la campagne d’inscription et les contrats',
    points: [
      'Naviguez entre les onglets : Tableau de bord, Fiches pédagogiques, Demandes de réduction, Contrats, À relancer et Échéances (chacun avec son compteur).',
      'Onglet Tableau de bord : ouvrez ou fermez la campagne pour l’année choisie en haut de page (dates, frais d’inscription, message d’accueil…).',
      'Onglet Contrats : cliquez sur « ✓ Valider » pour valider un contrat soumis (facture et scolarités créées automatiquement), ou « 📄 + Saisir contrat papier » pour un contrat reçu hors ligne.',
      'Onglets Fiches pédagogiques et Demandes de réduction : acceptez ou refusez chaque dossier au fil de l’eau.',
      'Onglet Échéances : filtrez par mode de règlement et encaissez les échéances (réservé aux comptes avec accès finances).',
    ],
  },
  'comptes-parents': {
    titre: 'Ouvrir les accès portail aux familles',
    points: [
      'Cliquez sur « Créer accès » sur une ligne pour ouvrir un compte portail à une famille (choix du parent + email).',
      'Cliquez sur « ✉️ Inviter toutes les familles sans compte » pour créer et envoyer tous les accès manquants en une fois.',
      'Cliquez sur « 📧 Renvoyer lien » si un parent n’a pas reçu ou a perdu son lien de connexion.',
      'Utilisez la barre de recherche pour retrouver une famille ; « 🗑 Supprimer compte » retire l’accès portail.',
    ],
  },
  exports: {
    titre: 'Exporter les données en CSV',
    points: [
      'Cliquez sur « ⬇ Télécharger CSV » sur une carte pour exporter Familles, Élèves, Factures, Règlements ou Chèques.',
      'Choisissez l’exercice en haut de page : les exports liés à l’année (factures, règlements…) en dépendent.',
      'Sur la carte Familles, filtrez par tranche de facturation avant de télécharger.',
      'L’export « FEC » génère le fichier normé à transmettre à votre comptable ; les CSV s’ouvrent directement dans Excel ou LibreOffice.',
    ],
  },
  transport: {
    titre: 'Gérer les forfaits et inscriptions transport',
    points: [
      'Onglet « 💶 Forfaits » : cliquez sur « + Nouveau forfait » pour créer un forfait (zone, trajet, prix mensuel) ; ✏ modifie, 🗑 supprime, et l’interrupteur active ou désactive.',
      'Onglet « 📝 Depuis contrats » : consultez les élèves inscrits à la navette via leur contrat.',
      'Onglet « 👨‍👩‍👧 Inscriptions manuelles » : consultez les inscriptions saisies à la main et cliquez sur « Annuler » pour en retirer une.',
      'Les compteurs en haut donnent le nombre d’inscrits et le chiffre d’affaires mensuel et annuel.',
    ],
  },
  'a-traiter': {
    titre: 'Traiter tout ce qui attend une action',
    points: [
      'Cette page rassemble tout ce qui attend votre action : contrats à valider, demandes de réduction, options, chèques et demandes d’inscription.',
      'Cliquez sur « Examiner → », « Étudier → » ou « Traiter → » pour ouvrir l’élément sur sa page dédiée.',
      'Pour les demandes d’option (navette, cantine…), cliquez directement sur « ✓ Accepter » ou « ✗ Refuser ».',
      'Cliquez sur « ✓ Marquer reçu » quand un chèque annoncé est bien arrivé à l’école.',
    ],
  },
  familles: {
    titre: 'Créer et gérer les dossiers familles',
    points: [
      'Cliquez sur « + Nouvelle famille » pour créer un dossier complet (parents, situation, mode de paiement).',
      'Recherchez par nom, numéro ou parent, et cliquez sur un en-tête de colonne pour trier le tableau.',
      'Cliquez sur une ligne (ou sur « Voir → ») pour ouvrir la fiche famille complète.',
      'Sur chaque ligne : ✏️ pour une édition rapide, 🗑️ pour supprimer la famille (action irréversible, les enfants liés sont supprimés).',
    ],
  },
  enfants: {
    titre: 'Consulter la liste des élèves',
    points: [
      'Recherchez un élève par nom, prénom ou famille, et filtrez par classe ou par état de contrat (signé, soumis, brouillon, sans contrat).',
      'Cliquez sur une ligne pour ouvrir la fiche de l’élève, ou sur le nom de famille souligné pour ouvrir la fiche famille.',
      'Cochez « Inclure les élèves sortis » pour afficher aussi les élèves qui ont quitté l’école.',
      'Les compteurs en haut résument les contrats signés, soumis, brouillons et manquants pour l’année active.',
    ],
  },
  factures: {
    titre: 'Consulter et encaisser une facture',
    points: [
      'Cliquez sur « 💰 Encaisser » pour enregistrer un règlement tant qu’il reste un solde sur la facture.',
      'Cliquez sur « 🖨 Imprimer » pour ouvrir la facture en PDF, et sur « 🔒 Verrouiller » pour figer ses lignes.',
      'Si un écart avec le contrat est signalé, cliquez sur « ↻ Régénérer » pour recalculer les lignes (les règlements sont conservés).',
      'Consultez plus bas le détail des lignes, les règlements reçus et l’échéancier.',
    ],
  },
}
