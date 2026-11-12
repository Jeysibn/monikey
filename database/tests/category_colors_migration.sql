DO $$
DECLARE
  saved_category_id INTEGER;
  saved_transaction_id INTEGER;
  actual_amount NUMERIC(12, 2);
  actual_balance NUMERIC(12, 2);
  before_icon TEXT;
BEGIN
  SELECT c.id, c.icon_key INTO saved_category_id, before_icon
  FROM categories AS c WHERE c.name = 'Food' AND c.type = 'expense';
  SELECT t.id INTO saved_transaction_id FROM transactions AS t WHERE t.note = 'Synthetic color migration expense';
  IF saved_category_id IS NULL OR saved_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Synthetic category or transaction was not created before migration 009';
  END IF;

  -- Upgrade preserves what existed: no backfill, the old icon is still valid, history is untouched.
  IF (SELECT color_key FROM categories WHERE id = saved_category_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Existing category color must remain unset after migration';
  END IF;
  IF (SELECT COUNT(*) FROM categories WHERE color_key IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'Migration 009 must not backfill any color';
  END IF;
  IF before_icon IS DISTINCT FROM 'utensils' THEN
    RAISE EXCEPTION 'Migration 009 changed an existing icon';
  END IF;
  SELECT amount INTO actual_amount FROM transactions WHERE id = saved_transaction_id;
  SELECT opening_balance - COALESCE(SUM(t.amount), 0) INTO actual_balance
  FROM accounts AS a LEFT JOIN transactions AS t ON t.account_id = a.id
  WHERE a.name = 'Synthetic color migration cash' GROUP BY a.id;
  IF actual_amount <> 88.88 OR actual_balance <> 811.12 THEN
    RAISE EXCEPTION 'Migration 009 changed the ledger amount or account balance';
  END IF;

  -- A curated name and a custom #rrggbb persist; every other value (CSS, short or upper-case hex) is rejected.
  UPDATE categories SET color_key = 'green' WHERE id = saved_category_id;
  IF (SELECT color_key FROM categories WHERE id = saved_category_id) <> 'green' THEN
    RAISE EXCEPTION 'Valid color key was not persisted';
  END IF;
  UPDATE categories SET color_key = '#3a7bd5' WHERE id = saved_category_id;
  IF (SELECT color_key FROM categories WHERE id = saved_category_id) <> '#3a7bd5' THEN
    RAISE EXCEPTION 'A custom hex color was not persisted';
  END IF;
  BEGIN
    UPDATE categories SET color_key = '#FF0000' WHERE id = saved_category_id;
    RAISE EXCEPTION 'An upper-case hex color was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE categories SET color_key = '#f00' WHERE id = saved_category_id;
    RAISE EXCEPTION 'A short hex color was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE categories SET color_key = '#ff0000; x' WHERE id = saved_category_id;
    RAISE EXCEPTION 'A hex color with trailing CSS was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE categories SET color_key = 'red; background:url(x)' WHERE id = saved_category_id;
    RAISE EXCEPTION 'Arbitrary CSS was accepted as a color';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The widened icon allowlist accepts the new keys, still rejects an arbitrary value, and old keys stay valid.
  UPDATE categories SET icon_key = 'coffee' WHERE id = saved_category_id;
  UPDATE categories SET icon_key = 'wrench' WHERE id = saved_category_id;
  UPDATE categories SET icon_key = 'shopping-basket' WHERE id = saved_category_id;
  BEGIN
    UPDATE categories SET icon_key = 'https://invalid.example/icon.svg' WHERE id = saved_category_id;
    RAISE EXCEPTION 'Invalid icon key was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Appearance never touches history, defaults or archive state.
  IF (SELECT category_id FROM transactions WHERE id = saved_transaction_id) <> saved_category_id
     OR (SELECT kakeibo_envelope FROM transactions WHERE id = saved_transaction_id) <> 'needs'
     OR (SELECT is_archived FROM categories WHERE id = saved_category_id) THEN
    RAISE EXCEPTION 'Appearance update changed history, classification or archive state';
  END IF;

  UPDATE categories SET color_key = NULL, icon_key = NULL WHERE id = saved_category_id;
END $$;

DELETE FROM transactions WHERE note = 'Synthetic color migration expense';
DELETE FROM accounts WHERE name = 'Synthetic color migration cash';
