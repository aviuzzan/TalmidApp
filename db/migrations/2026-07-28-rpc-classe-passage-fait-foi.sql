-- ============================================================================
-- Migration 2026-07-28 (bis) — « LE PASSAGE DE CLASSE FAIT FOI »
-- soumettre_contrat_famille : la classe N+1 ne vient plus du navigateur
-- ----------------------------------------------------------------------------
-- POURQUOI (décision client du 28/07/2026) :
--   Dans le contrat de réinscription du portail, le parent choisissait lui-même
--   la classe de l'année N+1. En production, 68 contrats sur 94 portaient la
--   classe EN COURS au lieu de celle de l'année suivante : secrétariat obligé de
--   tout reprendre à la main, tarifs faussés (le secteur de la classe pilote les
--   tarifs), et affectations incohérentes avec les passages de classe.
--   Décision : c'est l'ÉCOLE qui fait foi. Le front
--   (src/app/portail/inscriptions/contrat/page.tsx) affiche désormais la classe
--   N+1 en LECTURE SEULE. Mais un client reste un client : il peut être
--   contourné (DevTools, requête forgée). D'où cette défense en profondeur.
--
-- CE QUI CHANGE (UNE SEULE règle ajoutée, tout le reste est identique à
-- db/migrations/2026-07-28-rpc-soumettre-contrat.sql) :
--   Au début de la boucle sur les enfants, si l'enfant possède DÉJÀ une
--   scolarité pour l'exercice de l'année demandée (exercices.code = p_annee et
--   exercices.ecole_id = école de la famille), le classe_id envoyé par le client
--   est IGNORÉ : on retient celui de la scolarité — la table `scolarites` est la
--   source de vérité de l'affectation par année.
--   Sinon (enfant nouveau, aucune scolarité N+1 : parcours admission), on garde
--   le classe_id du client, avec exactement les contrôles existants (classe de
--   l'école, tarifs du secteur/tranche, groupes exclusifs…).
--   Conséquence directe : les montants suivent la BONNE classe, donc le bon
--   secteur (une montée peut changer de site, ex. Kita 5 → Kita 6).
--
-- IDEMPOTENT : CREATE OR REPLACE de la même signature — aucun DROP, aucun
--   changement de type de retour, les GRANTs sont réappliqués à l'identique.
--
-- ----------------------------------------------------------------------------
-- Contexte d'origine de la fonction (audit sécurité Fable 28/07) :
--   Le portail parent (src/app/portail/inscriptions/contrat/page.tsx) calculait
--   montant_total côté navigateur puis insérait contrats_scolarisation,
--   contrat_enfants, cheques_prevus et mandats_sepa en plusieurs requêtes non
--   transactionnelles → un parent pouvait se fabriquer un tarif via DevTools,
--   et un échec en cours de route laissait des données incohérentes.
--
-- Cette fonction (SECURITY DEFINER, search_path épinglé sur public) :
--   1. vérifie que auth.uid() est un parent de p_famille_id (profiles.famille_id)
--      OU un membre du staff de l'école (role admin / agent / super_admin) ;
--   2. RECALCULE tous les montants côté SQL depuis les tables officielles,
--      en reproduisant fidèlement la logique métier du client :
--        - tarifs_secteur filtrés par secteur de la classe + tranche effective
--          de la famille (tranche_id de la famille, sinon première tranche
--          présente dans les tarifs de l'année, par ordre) ;
--        - postes = tarifs obligatoires + options cochées (tarif_ids), avec
--          contrôle des groupes exclusifs (Navette OU Car, pas les deux) ;
--        - réduction famille nombreuse (reductions_famille_nombreuse) si au
--          moins 2 enfants inscrits, palier le plus élevé <= nb enfants de la
--          famille, tranches_eligibles respectées — ignorée si une demande de
--          réduction est acceptée ;
--        - tarif_accorde d'une demandes_reduction acceptée (statuts 'accepte'
--          ou 'valide') appliqué au périmètre "inclus_dans_reduction" ; les
--          options hors réduction restent au plein tarif ;
--        - assurance = montant annuel école (défaut 12 €) x nb enfants avec
--          classe, si ecoles.assurance_proposee et case cochée ;
--   3. écrit atomiquement : upsert contrats_scolarisation (statut 'soumis',
--      montant_total recalculé), delete+insert contrat_enfants, delete+insert
--      cheques_prevus (échéances de septembre, jour clampé au dernier jour réel
--      du mois — équivalent SQL de src/lib/echeance.ts dateEcheance), mandat
--      SEPA le cas échéant, familles.scolarite_n1 ;
--   4. retourne jsonb { contrat_id, montant_total, lignes } pour le récap.
--
-- NOTE frais d'inscription/réinscription (frais_inscription_config) : comme
--   dans le comportement historique, ils NE sont PAS inclus dans montant_total
--   du contrat — ils sont ajoutés à la facture lors de la validation admin
--   (src/lib/facture-contrat.ts). Ils sont recalculés ici et retournés à titre
--   informatif dans lignes.frais_info.
--
-- DÉPLOIEMENT : appliquer cette migration EN MÊME TEMPS que le front (le client
--   appelle la RPC sans fallback — c'est voulu, un fallback recréerait la faille).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.soumettre_contrat_famille(
  p_contrat_id uuid,          -- contrat existant à re-soumettre, ou NULL
  p_famille_id uuid,
  p_annee text,               -- ex. '2026-2027'
  p_enfants jsonb,            -- [{ "enfant_id": uuid, "classe_id": uuid, "tarif_ids": [uuid, ...] }]
                              --   → UNIQUEMENT des identifiants/choix, JAMAIS de montants
  p_mode_paiement text,       -- type de modes_reglement_ecole ('cheque', 'sepa', 'virement', ...)
  p_options jsonb DEFAULT '{}'::jsonb
                              -- { assurance_ecole, autorisation_image, caution_acceptee,
                              --   observations, signature_url, nb_echeances, jour_echeance,
                              --   sepa: { iban, bic, titulaire, rib_url } | null }
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid                uuid := auth.uid();
  v_profil             record;
  v_est_parent         boolean := false;
  v_est_staff          boolean := false;
  v_famille            record;
  v_ecole              record;
  v_ecole_id           uuid;
  v_tranche_effective  text;   -- tranche utilisée pour filtrer les tarifs
  v_tranche_famille    text;   -- tranche brute de la famille (réduction FN)
  v_contrat_existant   record;
  v_contrat_id         uuid;

  -- Options
  v_assurance_ecole    boolean;
  v_autorisation_image boolean;
  v_caution            boolean;
  v_observations       text;
  v_signature_url      text;
  v_nb_echeances       int;
  v_jour_echeance      int;

  -- Boucle enfants
  v_enf                jsonb;
  v_enfant_id          uuid;
  v_classe_id          uuid;
  v_classe_scolarite   uuid;   -- classe portée par la scolarité N+1 (fait foi)
  v_tarif_ids          uuid[];
  v_classe             record;
  v_postes             jsonb;
  v_sous_total         numeric;
  v_hors_reduction     numeric;
  v_nb_valides         int;

  -- Agrégats
  v_lignes_enfants     jsonb := '[]'::jsonb;
  v_total_scolarite    numeric := 0;
  v_total_hors_red     numeric := 0;
  v_nb_avec_classe     int := 0;
  v_enfants_contrat    uuid[] := '{}';

  -- Réductions / assurance
  v_nb_enfants_famille int := 0;
  v_reduction_fn       numeric := 0;
  v_dr                 record;  -- demande de réduction acceptée
  v_assurance_proposee boolean;
  v_assurance_unitaire numeric;
  v_total_assurance    numeric := 0;
  v_total              numeric := 0;

  -- Échéancier
  v_cfg                record;
  v_min_ech            int;
  v_max_ech            int;
  v_montant_ech        numeric;
  v_annee_debut        int;
  v_i                  int;
  v_mois               int;
  v_an                 int;
  v_dernier_jour       int;
  v_statut_initial     text;

  -- SEPA
  v_sepa               jsonb;
  v_iban               text;
  v_bic                text;
  v_titulaire          text;
  v_rum                text;
  v_prefixe            text;
  v_mandat_id          uuid;

  -- Frais (informatif, hors montant_total — cf. note en tête)
  v_frais              record;
  v_frais_info         jsonb := NULL;
  v_nb_nouveaux        int := 0;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- 0. Authentification / autorisation
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT famille_id, ecole_id, role INTO v_profil FROM profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  SELECT * INTO v_famille FROM familles WHERE id = p_famille_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Famille introuvable';
  END IF;
  v_ecole_id := v_famille.ecole_id;

  v_est_parent := (v_profil.famille_id = p_famille_id);
  -- Staff : admin/agent de la MÊME école, ou super_admin (toutes écoles).
  -- (Permettra plus tard la saisie de contrats papier depuis le back-office.)
  v_est_staff := v_profil.role IN ('admin', 'agent', 'super_admin')
                 AND (v_profil.role = 'super_admin' OR v_profil.ecole_id = v_ecole_id);

  IF NOT v_est_parent AND NOT v_est_staff THEN
    RAISE EXCEPTION 'Accès refusé : vous n''êtes ni parent de cette famille ni membre de l''école';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Validation des entrées
  -- ──────────────────────────────────────────────────────────────────────────
  IF p_annee IS NULL OR p_annee !~ '^\d{4}-\d{4}$' THEN
    RAISE EXCEPTION 'Année scolaire invalide : %', p_annee;
  END IF;
  IF p_enfants IS NULL OR jsonb_typeof(p_enfants) <> 'array' OR jsonb_array_length(p_enfants) = 0 THEN
    RAISE EXCEPTION 'Aucun enfant sélectionné';
  END IF;
  PERFORM 1 FROM modes_reglement_ecole
   WHERE ecole_id = v_ecole_id AND type = p_mode_paiement AND actif IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mode de règlement « % » non proposé par l''école', p_mode_paiement;
  END IF;

  SELECT nom, assurance_proposee, assurance_montant_annuel
    INTO v_ecole FROM ecoles WHERE id = v_ecole_id;

  -- Contrat existant (par id explicite, sinon par famille + année)
  IF p_contrat_id IS NOT NULL THEN
    SELECT id, statut INTO v_contrat_existant
      FROM contrats_scolarisation
     WHERE id = p_contrat_id AND famille_id = p_famille_id AND annee_scolaire = p_annee;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contrat introuvable pour cette famille et cette année';
    END IF;
  ELSE
    SELECT id, statut INTO v_contrat_existant
      FROM contrats_scolarisation
     WHERE famille_id = p_famille_id AND annee_scolaire = p_annee
     LIMIT 1;
  END IF;
  IF v_contrat_existant.id IS NOT NULL
     AND v_contrat_existant.statut = 'valide'
     AND NOT v_est_staff THEN
    RAISE EXCEPTION 'Ce contrat a déjà été validé par l''école et ne peut plus être modifié depuis le portail';
  END IF;

  -- Options
  v_assurance_ecole    := COALESCE((p_options->>'assurance_ecole')::boolean, false);
  v_autorisation_image := COALESCE((p_options->>'autorisation_image')::boolean, false);
  v_caution            := COALESCE((p_options->>'caution_acceptee')::boolean, false);
  v_observations       := NULLIF(p_options->>'observations', '');
  v_signature_url      := COALESCE(p_options->>'signature_url', '');
  v_nb_echeances       := COALESCE((p_options->>'nb_echeances')::int, 1);
  v_jour_echeance      := (p_options->>'jour_echeance')::int;  -- NULL → 5 plus bas

  -- Bornes d'échéances de l'école (mêmes défauts que le client : 1..12)
  SELECT nb_echeances_min, nb_echeances_max INTO v_cfg
    FROM contrat_paiement_config WHERE ecole_id = v_ecole_id LIMIT 1;
  v_min_ech := GREATEST(COALESCE(v_cfg.nb_echeances_min, 1), 1);
  v_max_ech := COALESCE(v_cfg.nb_echeances_max, 12);
  v_nb_echeances := LEAST(GREATEST(v_nb_echeances, v_min_ech), v_max_ech);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. Tranche effective (logique client : tranche famille, sinon première
  --    tranche présente dans les tarifs de l'année, par ordre)
  -- ──────────────────────────────────────────────────────────────────────────
  v_tranche_famille := v_famille.tranche_id::text;
  IF v_famille.tranche_id IS NOT NULL THEN
    v_tranche_effective := v_famille.tranche_id::text;
  ELSE
    SELECT t.tranche_id::text INTO v_tranche_effective
      FROM tarifs_secteur t
     WHERE t.ecole_id = v_ecole_id AND t.annee_scolaire = p_annee AND t.tranche_id IS NOT NULL
     ORDER BY t.ordre
     LIMIT 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. Recalcul des postes par enfant (montants pris UNIQUEMENT en base)
  -- ──────────────────────────────────────────────────────────────────────────
  FOR v_enf IN SELECT * FROM jsonb_array_elements(p_enfants) LOOP
    v_enfant_id := NULLIF(v_enf->>'enfant_id', '')::uuid;
    v_classe_id := NULLIF(v_enf->>'classe_id', '')::uuid;
    IF v_enfant_id IS NULL OR v_classe_id IS NULL THEN
      CONTINUE;  -- le client ne soumet que les enfants avec classe choisie
    END IF;
    IF v_enfant_id = ANY(v_enfants_contrat) THEN
      RAISE EXCEPTION 'Enfant présent deux fois dans la demande';
    END IF;

    PERFORM 1 FROM enfants e WHERE e.id = v_enfant_id AND e.famille_id = p_famille_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enfant étranger à la famille';
    END IF;

    -- ────────────────────────────────────────────────────────────────────────
    -- RÈGLE 2026-07-28 : LE PASSAGE DE CLASSE FAIT FOI.
    -- Si l'enfant a déjà une scolarité sur l'exercice de l'année demandée, c'est
    -- ELLE qui donne la classe : le classe_id du client est ignoré (68 contrats
    -- sur 94 portaient la classe de l'année en cours). Un enfant nouveau n'a pas
    -- de scolarité N+1 → on conserve le classe_id client (parcours admission).
    -- ecole_id de la scolarité toléré NULL (données historiques) mais jamais
    -- d'une autre école.
    -- ────────────────────────────────────────────────────────────────────────
    SELECT sc.classe_id INTO v_classe_scolarite
      FROM scolarites sc
      JOIN exercices ex ON ex.id = sc.exercice_id
     WHERE sc.enfant_id = v_enfant_id
       AND ex.code = p_annee
       AND ex.ecole_id = v_ecole_id
       AND (sc.ecole_id IS NULL OR sc.ecole_id = v_ecole_id)
       AND sc.classe_id IS NOT NULL
     LIMIT 1;  -- scolarites est unique par (enfant_id, exercice_id)
    IF v_classe_scolarite IS NOT NULL THEN
      v_classe_id := v_classe_scolarite;
    END IF;

    SELECT c.id, c.nom, c.secteur_id INTO v_classe
      FROM classes c WHERE c.id = v_classe_id AND c.ecole_id = v_ecole_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Classe introuvable dans cette école';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT x::uuid), '{}'::uuid[]) INTO v_tarif_ids
      FROM jsonb_array_elements_text(COALESCE(v_enf->'tarif_ids', '[]'::jsonb)) AS x;

    -- Chaque tarif demandé doit être applicable : école + année + secteur + tranche
    SELECT COUNT(*) INTO v_nb_valides
      FROM tarifs_secteur t
     WHERE t.id = ANY(v_tarif_ids)
       AND t.ecole_id = v_ecole_id
       AND t.annee_scolaire = p_annee
       AND (t.secteur_id IS NULL OR t.secteur_id = v_classe.secteur_id)
       AND (t.tranche_id IS NULL OR t.tranche_id::text = v_tranche_effective);
    IF v_nb_valides <> cardinality(v_tarif_ids) THEN
      RAISE EXCEPTION 'Option tarifaire invalide (hors secteur, tranche ou année)';
    END IF;

    -- Postes retenus = tarifs obligatoires du secteur/tranche + options cochées
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object('tarif_id', t.id, 'nom', t.nom_poste, 'montant', t.montant) ORDER BY t.ordre), '[]'::jsonb),
      COALESCE(SUM(t.montant), 0),
      COALESCE(SUM(t.montant) FILTER (WHERE t.inclus_dans_reduction = false), 0)
      INTO v_postes, v_sous_total, v_hors_reduction
      FROM tarifs_secteur t
     WHERE t.ecole_id = v_ecole_id
       AND t.annee_scolaire = p_annee
       AND (t.secteur_id IS NULL OR t.secteur_id = v_classe.secteur_id)
       AND (t.tranche_id IS NULL OR t.tranche_id::text = v_tranche_effective)
       AND (t.obligatoire IS TRUE OR t.id = ANY(v_tarif_ids));

    -- Groupes exclusifs : au plus un tarif par groupe (ex. Navette OU Car)
    PERFORM 1
      FROM tarifs_secteur t
     WHERE t.ecole_id = v_ecole_id
       AND t.annee_scolaire = p_annee
       AND (t.secteur_id IS NULL OR t.secteur_id = v_classe.secteur_id)
       AND (t.tranche_id IS NULL OR t.tranche_id::text = v_tranche_effective)
       AND (t.obligatoire IS TRUE OR t.id = ANY(v_tarif_ids))
       AND t.groupe_exclusif IS NOT NULL
     GROUP BY t.groupe_exclusif
    HAVING COUNT(*) > 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Deux options du même groupe exclusif sont sélectionnées';
    END IF;

    v_total_scolarite := v_total_scolarite + v_sous_total;
    v_total_hors_red  := v_total_hors_red + v_hors_reduction;
    v_nb_avec_classe  := v_nb_avec_classe + 1;
    v_enfants_contrat := v_enfants_contrat || v_enfant_id;
    v_lignes_enfants  := v_lignes_enfants || jsonb_build_array(jsonb_build_object(
      'enfant_id', v_enfant_id,
      'classe_id', v_classe_id,
      'classe_nom', v_classe.nom,
      'secteur_id', v_classe.secteur_id,
      'postes', v_postes,
      'sous_total', v_sous_total
    ));
  END LOOP;

  IF v_nb_avec_classe = 0 THEN
    RAISE EXCEPTION 'Aucun enfant avec classe choisie';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. Demande de réduction acceptée / réduction famille nombreuse
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT d.id, d.tarif_accorde INTO v_dr
    FROM demandes_reduction d
   WHERE d.famille_id = p_famille_id
     AND d.annee_scolaire = p_annee
     AND d.statut IN ('accepte', 'valide')
   LIMIT 1;

  -- Réduction FN uniquement si pas de demande acceptée (logique client) et
  -- au moins 2 enfants inscrits au contrat. Palier : le plus élevé <= nombre
  -- TOTAL d'enfants de la famille ; tranches_eligibles null/[] = toutes.
  -- to_jsonb() rend le test robuste que la colonne soit jsonb ou text[].
  IF v_dr.id IS NULL AND v_nb_avec_classe >= 2 THEN
    SELECT COUNT(*) INTO v_nb_enfants_famille FROM enfants e WHERE e.famille_id = p_famille_id;
    SELECT r.montant_reduction INTO v_reduction_fn
      FROM reductions_famille_nombreuse r
     WHERE r.ecole_id = v_ecole_id
       AND r.annee_scolaire = p_annee
       AND r.nb_enfants <= v_nb_enfants_famille
       AND (
         r.tranches_eligibles IS NULL
         OR jsonb_array_length(to_jsonb(r.tranches_eligibles)) = 0
         -- jsonb_exists() plutôt que l'opérateur « ? » (mangling possible côté outils)
         OR (v_tranche_famille IS NOT NULL AND jsonb_exists(to_jsonb(r.tranches_eligibles), v_tranche_famille))
       )
     ORDER BY r.nb_enfants DESC
     LIMIT 1;
    v_reduction_fn := COALESCE(v_reduction_fn, 0);
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. Assurance (logique client : proposée sauf si explicitement false ;
  --    montant annuel école, 12 € si null OU 0 ; x nb enfants avec classe)
  -- ──────────────────────────────────────────────────────────────────────────
  v_assurance_proposee := COALESCE(v_ecole.assurance_proposee, true);
  IF NOT v_assurance_proposee THEN
    v_assurance_ecole := false;
  END IF;
  v_assurance_unitaire := COALESCE(NULLIF(v_ecole.assurance_montant_annuel, 0), 12);
  IF v_assurance_ecole THEN
    v_total_assurance := v_assurance_unitaire * v_nb_avec_classe;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 6. Total annuel (identique au client)
  --    - DDR acceptée avec tarif accordé > 0 : tarif accordé + options hors
  --      réduction + assurance
  --    - sinon : max(0, scolarité - réduction FN) + assurance
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_dr.id IS NOT NULL AND COALESCE(v_dr.tarif_accorde, 0) > 0 THEN
    v_total := v_dr.tarif_accorde + v_total_hors_red + v_total_assurance;
  ELSE
    v_total := GREATEST(0, v_total_scolarite - v_reduction_fn) + v_total_assurance;
  END IF;
  v_total := ROUND(v_total, 2);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. Écritures atomiques
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_contrat_existant.id IS NOT NULL THEN
    v_contrat_id := v_contrat_existant.id;
    UPDATE contrats_scolarisation SET
      ecole_id                = v_ecole_id,
      demande_reduction_id    = v_dr.id,
      assurance_ecole         = v_assurance_ecole,
      assurance_montant_total = v_total_assurance,
      mode_reglement          = p_mode_paiement,
      nb_echeances            = v_nb_echeances,
      montant_total           = v_total,
      autorisation_image      = v_autorisation_image,
      droit_image             = v_autorisation_image,
      caution_acceptee        = v_caution,
      observations            = v_observations,
      engagement_lu           = true,
      statut                  = 'soumis',
      soumis_le               = now(),
      signature_url           = v_signature_url,
      signature_date          = now()
    WHERE id = v_contrat_id;
    DELETE FROM contrat_enfants WHERE contrat_id = v_contrat_id;
  ELSE
    INSERT INTO contrats_scolarisation (
      famille_id, ecole_id, annee_scolaire, demande_reduction_id,
      assurance_ecole, assurance_montant_total, mode_reglement, nb_echeances,
      montant_total, autorisation_image, droit_image, caution_acceptee,
      observations, engagement_lu, statut, soumis_le, signature_url, signature_date
    ) VALUES (
      p_famille_id, v_ecole_id, p_annee, v_dr.id,
      v_assurance_ecole, v_total_assurance, p_mode_paiement, v_nb_echeances,
      v_total, v_autorisation_image, v_autorisation_image, v_caution,
      v_observations, true, 'soumis', now(), v_signature_url, now()
    )
    RETURNING id INTO v_contrat_id;
  END IF;

  INSERT INTO contrat_enfants (contrat_id, enfant_id, secteur_id, classe_prevue, postes, sous_total)
  SELECT v_contrat_id,
         (l->>'enfant_id')::uuid,
         NULLIF(l->>'secteur_id', '')::uuid,
         l->>'classe_nom',
         l->'postes',
         (l->>'sous_total')::numeric
    FROM jsonb_array_elements(v_lignes_enfants) l;

  -- Mémoriser la scolarité N pour N+1 (comme le client, mais avec le total serveur)
  UPDATE familles
     SET scolarite_n1 = v_total, scolarite_n1_annee = p_annee
   WHERE id = p_famille_id;

  -- Mandat SEPA
  IF p_mode_paiement = 'sepa' THEN
    v_sepa      := COALESCE(p_options->'sepa', '{}'::jsonb);
    v_iban      := upper(regexp_replace(COALESCE(v_sepa->>'iban', ''), '\s', '', 'g'));
    v_bic       := upper(trim(COALESCE(v_sepa->>'bic', '')));
    v_titulaire := trim(COALESCE(v_sepa->>'titulaire', ''));
    IF v_iban = '' OR v_bic = '' OR v_titulaire = '' THEN
      RAISE EXCEPTION 'Coordonnées SEPA incomplètes (IBAN, BIC et titulaire requis)';
    END IF;
    IF v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' THEN
      RAISE EXCEPTION 'IBAN invalide';
    END IF;
    IF v_bic !~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$' THEN
      RAISE EXCEPTION 'BIC invalide';
    END IF;

    -- RUM : 2 premières lettres significatives du nom de l'école, sinon 'EC'
    v_prefixe := substring(regexp_replace(upper(COALESCE(v_ecole.nom, '')), '[^A-Z]', '', 'g') FROM 1 FOR 2);
    IF v_prefixe IS NULL OR length(v_prefixe) < 2 THEN
      v_prefixe := 'EC';
    END IF;
    v_rum := v_prefixe || '-'
          || COALESCE(NULLIF(v_famille.numero::text, ''), left(p_famille_id::text, 8)) || '-'
          || extract(year FROM now())::int;

    SELECT id INTO v_mandat_id FROM mandats_sepa
     WHERE famille_id = p_famille_id AND ecole_id = v_ecole_id AND actif IS TRUE
     LIMIT 1;
    IF v_mandat_id IS NOT NULL THEN
      UPDATE mandats_sepa SET
        contrat_id       = v_contrat_id,
        iban             = v_iban,
        bic              = v_bic,
        titulaire_compte = v_titulaire,
        rib_url          = NULLIF(v_sepa->>'rib_url', ''),
        rum              = v_rum,
        date_signature   = current_date,
        actif            = true
      WHERE id = v_mandat_id;
    ELSE
      INSERT INTO mandats_sepa (famille_id, ecole_id, contrat_id, iban, bic, titulaire_compte, rib_url, rum, date_signature, actif)
      VALUES (p_famille_id, v_ecole_id, v_contrat_id, v_iban, v_bic, v_titulaire, NULLIF(v_sepa->>'rib_url', ''), v_rum, current_date, true);
    END IF;
  END IF;

  -- Échéancier : tous les modes, démarre en septembre de l'année scolaire.
  -- Jour clampé au dernier jour réel du mois (fini les 2027-02-31).
  -- La dernière échéance absorbe l'écart d'arrondi (somme = total EXACT).
  DELETE FROM cheques_prevus WHERE contrat_id = v_contrat_id;
  IF v_nb_echeances > 0 THEN
    v_annee_debut := COALESCE(NULLIF(split_part(p_annee, '-', 1), '')::int, extract(year FROM now())::int);
    IF v_jour_echeance IS NULL OR v_jour_echeance < 1 THEN
      v_jour_echeance := 5;
    END IF;
    v_statut_initial := CASE WHEN p_mode_paiement = 'cheque' THEN 'attente_reception' ELSE 'prevu' END;
    v_montant_ech := ROUND(v_total / v_nb_echeances, 2);
    FOR v_i IN 0 .. v_nb_echeances - 1 LOOP
      v_mois := 9 + v_i;  -- septembre
      v_an   := v_annee_debut;
      WHILE v_mois > 12 LOOP
        v_mois := v_mois - 12;
        v_an := v_an + 1;
      END LOOP;
      v_dernier_jour := extract(day FROM (make_date(v_an, v_mois, 1) + interval '1 month' - interval '1 day'))::int;
      INSERT INTO cheques_prevus (contrat_id, famille_id, ecole_id, numero_cheque, montant, date_echeance, statut, mode_paiement)
      VALUES (
        v_contrat_id, p_famille_id, v_ecole_id, v_i + 1,
        CASE WHEN v_i = v_nb_echeances - 1
             THEN ROUND(v_total - v_montant_ech * (v_nb_echeances - 1), 2)
             ELSE v_montant_ech END,
        make_date(v_an, v_mois, LEAST(v_jour_echeance, v_dernier_jour)),
        v_statut_initial, p_mode_paiement
      );
    END LOOP;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 8. Frais d'inscription / réinscription — informatif uniquement (facturés
  --    à la validation admin via construireLignesFacture, jamais dans le total
  --    du contrat : comportement historique conservé)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT inscription_par_enfant, inscription_par_famille,
         reinscription_par_enfant, reinscription_par_famille
    INTO v_frais
    FROM frais_inscription_config
   WHERE ecole_id = v_ecole_id AND annee_scolaire = p_annee
   LIMIT 1;
  IF FOUND THEN
    -- "Nouveaux" = enfants du contrat ayant une fiche pédagogique cette année
    SELECT COUNT(DISTINCT ip.enfant_id) INTO v_nb_nouveaux
      FROM inscriptions_pedagogiques ip
     WHERE ip.annee_scolaire = p_annee AND ip.enfant_id = ANY(v_enfants_contrat);
    v_frais_info := jsonb_build_object(
      'nb_nouveaux', v_nb_nouveaux,
      'nb_reinscriptions', v_nb_avec_classe - v_nb_nouveaux,
      'inscription_par_enfant', COALESCE(v_frais.inscription_par_enfant, 0),
      'inscription_par_famille', COALESCE(v_frais.inscription_par_famille, 0),
      'reinscription_par_enfant', COALESCE(v_frais.reinscription_par_enfant, 0),
      'reinscription_par_famille', COALESCE(v_frais.reinscription_par_famille, 0),
      'inclus_dans_montant_total', false
    );
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 9. Résultat pour le récap client
  -- ──────────────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'contrat_id', v_contrat_id,
    'montant_total', v_total,
    'lignes', jsonb_build_object(
      'enfants', v_lignes_enfants,
      'total_scolarite', v_total_scolarite,
      'reduction_famille_nombreuse', v_reduction_fn,
      'demande_reduction_id', v_dr.id,
      'tarif_accorde', v_dr.tarif_accorde,
      'total_options_hors_reduction', v_total_hors_red,
      'assurance', v_total_assurance,
      'frais_info', v_frais_info
    )
  );
END;
$$;

-- ============================================================================
-- Droits : accessible aux comptes authentifiés uniquement (jamais anon)
-- ============================================================================
REVOKE ALL ON FUNCTION public.soumettre_contrat_famille(uuid, uuid, text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soumettre_contrat_famille(uuid, uuid, text, jsonb, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.soumettre_contrat_famille(uuid, uuid, text, jsonb, text, jsonb) TO authenticated;

-- ============================================================================
-- NOTE D'EXPLOITATION
--   Les contrôles existants sont conservés tels quels après le recalage de la
--   classe : si un navigateur resté ouvert AVANT le déploiement envoie des
--   options tarifaires d'un autre secteur que la classe N+1 réelle, la fonction
--   lève « Option tarifaire invalide (hors secteur, tranche ou année) ».
--   C'est volontaire (on ne modifie pas en silence ce que le parent a signé) :
--   un simple rechargement de la page corrige.
--
-- ROLLBACK (à exécuter manuellement en cas de retour arrière) :
--   Il suffit de REJOUER la migration précédente, qui redéfinit la même
--   fonction sans la règle « le passage de classe fait foi » :
--
--     \i db/migrations/2026-07-28-rpc-soumettre-contrat.sql
--
--   (ne PAS faire de DROP FUNCTION : la soumission de contrat serait cassée
--    pour tout le monde entre le drop et la recréation).
-- ============================================================================
