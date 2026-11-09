DO $$
DECLARE
  cash_balance NUMERIC(12, 2);
  historical_category_id INTEGER;
  wants_total NUMERIC(12, 2);
  income_total NUMERIC(12, 2);
BEGIN
  SELECT id INTO historical_category_id
  FROM categories WHERE name = 'Food' AND type = 'expense';

  SELECT a.opening_balance
    + COALESCE(SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE -t.amount END), 0)
  INTO cash_balance
  FROM accounts AS a
  LEFT JOIN transactions AS t ON t.account_id = a.id
  LEFT JOIN categories AS c ON c.id = t.category_id
  WHERE a.name = 'Synthetic category migration cash'
  GROUP BY a.id, a.opening_balance;

  IF cash_balance <> 5126.55 THEN
    RAISE EXCEPTION 'Migration changed the synthetic account balance: %', cash_balance;
  END IF;

  IF (SELECT COUNT(*) FROM transactions
      WHERE note LIKE 'Synthetic category migration %') <> 2 THEN
    RAISE EXCEPTION 'Migration changed synthetic transaction counts';
  END IF;

  IF (SELECT COUNT(*) FROM transactions
      WHERE note = 'Synthetic category migration expense'
        AND category_id = historical_category_id
        AND amount = 123.45
        AND kakeibo_envelope = 'wants') <> 1 THEN
    RAISE EXCEPTION 'Migration changed historical expense identity, amount, or envelope';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO wants_total
  FROM transactions
  WHERE note LIKE 'Synthetic category migration %' AND kakeibo_envelope = 'wants';
  SELECT COALESCE(SUM(amount), 0) INTO income_total
  FROM transactions AS t JOIN categories AS c ON c.id = t.category_id
  WHERE t.note = 'Synthetic category migration income' AND c.type = 'income';
  IF wants_total <> 123.45 OR income_total <> 250.00 THEN
    RAISE EXCEPTION 'Migration changed envelope or income classification totals: wants %, income %',
      wants_total, income_total;
  END IF;

  IF (SELECT default_kakeibo_envelope FROM categories WHERE id = historical_category_id) <> 'needs' THEN
    RAISE EXCEPTION 'Migration changed the existing category envelope default';
  END IF;

  IF EXISTS (SELECT 1 FROM categories WHERE is_archived IS DISTINCT FROM FALSE) THEN
    RAISE EXCEPTION 'Existing categories must start active after migration';
  END IF;
END $$;

DELETE FROM transactions WHERE note LIKE 'Synthetic category migration %';
DELETE FROM accounts WHERE name = 'Synthetic category migration cash';
UPDATE categories
SET default_kakeibo_envelope = NULL
WHERE name = 'Food' AND type = 'expense';
