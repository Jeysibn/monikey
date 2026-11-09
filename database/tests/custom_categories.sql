BEGIN;

DO $$
DECLARE
  category_id INTEGER;
  transaction_id INTEGER;
BEGIN
  INSERT INTO categories (name, type) VALUES ('Synthetic Custom', 'expense') RETURNING id INTO category_id;
  INSERT INTO accounts (name, type) VALUES ('Synthetic archived category account', 'cash');
  INSERT INTO transactions (account_id, category_id, amount, transaction_date, note)
  SELECT a.id, category_id, 1.00, DATE '2026-10-01', 'Existing archived category transaction'
  FROM accounts AS a WHERE a.name = 'Synthetic archived category account'
  RETURNING id INTO transaction_id;

  BEGIN
    INSERT INTO categories (name, type) VALUES ('synthetic custom', 'expense');
    RAISE EXCEPTION 'Names must be unique case-insensitively within category type';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO categories (name, type) VALUES ('Synthetic Custom', 'income');

  BEGIN
    INSERT INTO categories (name, type) VALUES ('   ', 'expense');
    RAISE EXCEPTION 'Whitespace-only names must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO categories (name, type) VALUES (E'\t\n', 'expense');
    RAISE EXCEPTION 'Tab/newline-only names must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE categories SET type = 'income' WHERE id = category_id;
    RAISE EXCEPTION 'Category type must be immutable';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  UPDATE categories SET is_archived = TRUE WHERE id = category_id;
  IF NOT (SELECT is_archived FROM categories WHERE id = category_id) THEN
    RAISE EXCEPTION 'Categories must support archive state';
  END IF;

  -- An old application build may still read this category, but the database must
  -- reject assigning it to a new transaction. Updating its existing transaction is safe.
  UPDATE transactions SET note = 'Existing archived category transaction edited'
  WHERE id = transaction_id;
  BEGIN
    INSERT INTO transactions (account_id, category_id, amount, transaction_date)
    SELECT a.id, category_id, 1.00, DATE '2026-10-02'
    FROM accounts AS a WHERE a.name = 'Synthetic archived category account';
    RAISE EXCEPTION 'Archived category must reject new transaction references';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE categories SET default_kakeibo_envelope = 'needs'
    WHERE name = 'Salary' AND type = 'income';
    RAISE EXCEPTION 'Income categories must not have expense envelopes';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE categories SET default_kakeibo_envelope = 'other'
    WHERE name = 'Food' AND type = 'expense';
    RAISE EXCEPTION 'Unsupported envelope values must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;
