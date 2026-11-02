-- Verify migration 005 preserves synthetic ledger rows and adds only metadata.
BEGIN;

DO $$
DECLARE
  cash_balance NUMERIC(12, 2);
  bank_balance NUMERIC(12, 2);
  card_debt NUMERIC(12, 2);
BEGIN
  SELECT a.opening_balance
    + COALESCE(SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE -t.amount END), 0)
    - COALESCE((
      SELECT SUM(p.amount) FROM credit_card_payments AS p
      WHERE p.source_account_id = a.id
    ), 0)
    - COALESCE((
      SELECT SUM(x.amount) FROM account_transfers AS x
      WHERE x.source_account_id = a.id
    ), 0)
    + COALESCE((
      SELECT SUM(x.amount) FROM account_transfers AS x
      WHERE x.destination_account_id = a.id
    ), 0)
  INTO cash_balance
  FROM accounts AS a
  LEFT JOIN transactions AS t ON t.account_id = a.id
  LEFT JOIN categories AS c ON c.id = t.category_id
  WHERE a.name = 'Kakeibo migration cash'
  GROUP BY a.id;

  SELECT a.opening_balance
    + COALESCE(SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE -t.amount END), 0)
    - COALESCE((
      SELECT SUM(x.amount) FROM account_transfers AS x
      WHERE x.source_account_id = a.id
    ), 0)
    + COALESCE((
      SELECT SUM(x.amount) FROM account_transfers AS x
      WHERE x.destination_account_id = a.id
    ), 0)
  INTO bank_balance
  FROM accounts AS a
  LEFT JOIN transactions AS t ON t.account_id = a.id
  LEFT JOIN categories AS c ON c.id = t.category_id
  WHERE a.name = 'Kakeibo migration bank'
  GROUP BY a.id;

  SELECT a.opening_debt
    + COALESCE(SUM(CASE WHEN c.id IS NOT NULL THEN t.amount ELSE 0 END), 0)
    - COALESCE((
      SELECT SUM(p.amount) FROM credit_card_payments AS p
      WHERE p.card_account_id = a.id
    ), 0)
  INTO card_debt
  FROM accounts AS a
  LEFT JOIN transactions AS t ON t.account_id = a.id
  LEFT JOIN categories AS c ON c.id = t.category_id AND c.type = 'expense'
  WHERE a.name = 'Kakeibo migration card'
  GROUP BY a.id, a.opening_debt;

  IF cash_balance <> 1725.00 OR bank_balance <> 1050.00 OR card_debt <> 250.00 THEN
    RAISE EXCEPTION 'Ledger positions changed: cash %, bank %, card %',
      cash_balance, bank_balance, card_debt;
  END IF;

  IF (SELECT COUNT(*) FROM transactions WHERE note LIKE 'Synthetic %') <> 3
     OR (SELECT COUNT(*) FROM transactions
         WHERE note = 'Synthetic historical expense' AND amount = 125.00
           AND transaction_date = DATE '2026-10-02') <> 1
     OR (SELECT COUNT(*) FROM transactions
         WHERE note = 'Synthetic card purchase' AND amount = 250.00
           AND transaction_date = DATE '2026-10-03') <> 1
     OR (SELECT COUNT(*) FROM credit_card_payments
         WHERE note = 'Synthetic card payment' AND amount = 100.00
           AND payment_date = DATE '2026-10-04') <> 1
     OR (SELECT COUNT(*) FROM account_transfers
         WHERE note = 'Synthetic liquid transfer' AND amount = 50.00
           AND transfer_date = DATE '2026-10-05') <> 1 THEN
    RAISE EXCEPTION 'Migration changed the synthetic ledger row counts';
  END IF;

  IF (SELECT COUNT(*) FROM transactions
      WHERE note LIKE 'Synthetic %' AND kakeibo_envelope IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'Existing transactions must remain unclassified after migration';
  END IF;

  BEGIN
    UPDATE categories SET default_kakeibo_envelope = 'needs'
    WHERE name = 'Salary' AND type = 'income';
    RAISE EXCEPTION 'Income categories must reject Kakeibo defaults';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE categories SET default_kakeibo_envelope = 'other'
    WHERE name = 'Food' AND type = 'expense';
    RAISE EXCEPTION 'Unknown Kakeibo envelopes must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE transactions SET kakeibo_envelope = 'other'
    WHERE note = 'Synthetic historical expense';
    RAISE EXCEPTION 'Unknown transaction envelopes must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  UPDATE transactions SET kakeibo_envelope = 'wants'
  WHERE note = 'Synthetic card purchase';
  UPDATE categories SET default_kakeibo_envelope = 'needs'
  WHERE name = 'Food' AND type = 'expense';

  IF (SELECT kakeibo_envelope FROM transactions
      WHERE note = 'Synthetic card purchase') <> 'wants' THEN
    RAISE EXCEPTION 'Transaction envelope classification did not persist';
  END IF;

  -- Planning metadata accepts zero and does not need a ledger/account link.
  INSERT INTO kakeibo_month_plans (month, savings_target, review_actuals_snapshot)
  VALUES (
    DATE '2026-10-01',
    0.00,
    '{"actual_income":"1000.00","total_expenses":"375.00","unclassified":"125.00","envelopes":{"needs":"0.00","wants":"250.00","culture":"0.00","unexpected":"0.00"}}'::jsonb
  );
  INSERT INTO kakeibo_weekly_reviews (week_start, surprise_note)
  VALUES (DATE '2026-10-05', 'Synthetic weekly note');

  BEGIN
    INSERT INTO kakeibo_month_plans (month) VALUES (DATE '2026-10-02');
    RAISE EXCEPTION 'Month plans must use the first day of a month';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO kakeibo_month_plans (month, review_actuals_snapshot)
    VALUES (DATE '2026-11-01', '{"actual_income":1000}'::jsonb);
    RAISE EXCEPTION 'Review snapshots must use the documented decimal-string shape';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO kakeibo_month_plans (month, savings_target)
    VALUES (DATE '2026-11-01', -1.00);
    RAISE EXCEPTION 'Negative plan amounts must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO kakeibo_weekly_reviews (week_start) VALUES (DATE '2026-10-06');
    RAISE EXCEPTION 'Weekly reviews must start on Monday';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;

-- The fixtures were committed before migration 005 so the migration could be
-- tested with pre-existing rows. Remove only those synthetic rows afterward
-- so the existing accounting suite starts with its original clean fixture set.
DELETE FROM account_transfers WHERE note = 'Synthetic liquid transfer';
DELETE FROM credit_card_payments WHERE note = 'Synthetic card payment';
DELETE FROM transactions WHERE note LIKE 'Synthetic %';
DELETE FROM accounts
WHERE name IN (
  'Kakeibo migration cash',
  'Kakeibo migration bank',
  'Kakeibo migration card'
);
