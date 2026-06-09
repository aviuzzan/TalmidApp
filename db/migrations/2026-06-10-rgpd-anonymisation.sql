-- ===============================================
-- RGPD - Anonymisation famille
-- ===============================================
-- À exécuter dans Supabase SQL Editor.
-- Ajoute des champs de traçabilité pour l'anonymisation
-- d'une famille (droit à l'oubli, article 17 RGPD).
--
-- Stratégie : on ANONYMISE (pas hard-delete) pour préserver
-- l'intégrité comptable (les factures restent émises mais
-- avec un nom "Anonymisé #IDX").
-- ===============================================

-- 1. Champs sur familles
ALTER TABLE familles
  ADD COLUMN IF NOT EXISTS anonymized_at  timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motif_anonymisation text;

CREATE INDEX IF NOT EXISTS idx_familles_anonymized_at ON familles(anonymized_at);

-- 2. Champs sur enfants (cascade de l'anonymisation)
ALTER TABLE enfants
  ADD COLUMN IF NOT EXISTS anonymized_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_enfants_anonymized_at ON enfants(anonymized_at);

-- 3. Vue helper : familles_actives (non anonymisées)
CREATE OR REPLACE VIEW familles_actives AS
SELECT * FROM familles WHERE anonymized_at IS NULL;

-- 4. Action admin_logs déjà supportée via le helper logAction()
--    Pas de migration nécessaire sur admin_logs.

-- Vérification finale
SELECT
  'familles' AS table_name,
  COUNT(*) AS total,
  COUNT(anonymized_at) AS deja_anonymisees
FROM familles
UNION ALL
SELECT
  'enfants',
  COUNT(*),
  COUNT(anonymized_at)
FROM enfants;
