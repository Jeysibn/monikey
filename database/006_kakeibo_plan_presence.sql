-- Distinguish an explicitly saved plan from a reflection-only row.
-- Existing rows stay NULL (legacy_unknown) because their plan intent cannot be
-- reconstructed safely from zero-valued defaults.
BEGIN;

ALTER TABLE kakeibo_month_plans
  ADD COLUMN plan_presence VARCHAR(12)
    CHECK (plan_presence IS NULL OR plan_presence IN ('saved', 'not_saved'));

COMMENT ON COLUMN kakeibo_month_plans.plan_presence IS
  'saved/not_saved is explicit; NULL means a pre-006 row whose plan intent is unknown.';

COMMIT;
