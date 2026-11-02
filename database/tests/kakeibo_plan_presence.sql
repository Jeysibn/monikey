BEGIN;

DO $$
DECLARE
  old_presence VARCHAR(12);
  old_plan NUMERIC(12, 2);
  old_review TEXT;
BEGIN
  SELECT plan_presence, planned_income, review_available
    INTO old_presence, old_plan, old_review
  FROM kakeibo_month_plans
  WHERE month = '2020-01-01';

  IF old_presence IS NOT NULL OR old_plan <> 0 OR old_review <> 'Legacy reflection stays readable.' THEN
    RAISE EXCEPTION 'Migration 006 must preserve legacy values and leave plan intent unknown';
  END IF;

  INSERT INTO kakeibo_month_plans (month, plan_presence)
  VALUES ('2020-02-01', 'not_saved');
  INSERT INTO kakeibo_month_plans (month, plan_presence)
  VALUES ('2020-03-01', 'saved');

  BEGIN
    INSERT INTO kakeibo_month_plans (month, plan_presence)
    VALUES ('2020-04-01', 'guessed');
    RAISE EXCEPTION 'Invalid plan presence was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
