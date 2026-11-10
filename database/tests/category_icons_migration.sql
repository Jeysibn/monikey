DO $$
DECLARE
  saved_category_id INTEGER;
  saved_transaction_id INTEGER;
  actual_amount NUMERIC(12, 2);
  actual_balance NUMERIC(12, 2);
BEGIN
  SELECT c.id INTO saved_category_id FROM categories AS c WHERE c.name = 'Food' AND c.type = 'expense';
  SELECT t.id INTO saved_transaction_id
  FROM transactions AS t
  WHERE t.note = 'Synthetic icon migration expense';

  IF saved_category_id IS NULL OR saved_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Synthetic category or transaction was not created before migration 008';
  END IF;

  IF (SELECT icon_key FROM categories WHERE id = saved_category_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Existing category icon must remain unset after migration';
  END IF;

  SELECT amount INTO actual_amount FROM transactions WHERE id = saved_transaction_id;
  SELECT opening_balance - COALESCE(SUM(t.amount), 0)
    INTO actual_balance
  FROM accounts AS a
  LEFT JOIN transactions AS t ON t.account_id = a.id
  WHERE a.name = 'Synthetic icon migration cash'
  GROUP BY a.id;

  IF actual_amount <> 77.77 OR actual_balance <> 422.23 THEN
    RAISE EXCEPTION 'Migration 008 changed the ledger amount or account balance';
  END IF;

  UPDATE categories SET icon_key = 'shopping-basket' WHERE id = saved_category_id;
  IF (SELECT icon_key FROM categories WHERE id = saved_category_id) <> 'shopping-basket' THEN
    RAISE EXCEPTION 'Valid icon key was not persisted';
  END IF;

  BEGIN
    UPDATE categories SET icon_key = 'https://invalid.example/icon.svg' WHERE id = saved_category_id;
    RAISE EXCEPTION 'Invalid icon key was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT category_id FROM transactions WHERE id = saved_transaction_id) <> saved_category_id
     OR (SELECT kakeibo_envelope FROM transactions WHERE id = saved_transaction_id) <> 'culture' THEN
    RAISE EXCEPTION 'Icon update changed historical transaction category or classification';
  END IF;

  UPDATE categories SET icon_key = NULL WHERE id = saved_category_id;
END $$;

DELETE FROM transactions WHERE note = 'Synthetic icon migration expense';
DELETE FROM accounts WHERE name = 'Synthetic icon migration cash';
