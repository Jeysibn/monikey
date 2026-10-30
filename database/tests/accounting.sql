-- Fictional, transaction-scoped accounting checks.
-- Run against a fresh test database; all inserted rows are rolled back.

BEGIN;

INSERT INTO accounts (name, type, opening_balance)
VALUES
  ('Test Bank', 'bank', 5000.00),
  ('Test Cash', 'cash', 200.00),
  ('Test E-wallet', 'ewallet', 0.00);

INSERT INTO accounts (name, type, credit_limit, opening_debt)
VALUES
  ('Test Card', 'credit_card', 20000.00, 0.00),
  ('Overpaid Card', 'credit_card', 5000.00, 100.00);

INSERT INTO transactions (account_id, category_id, amount, transaction_date, note)
SELECT a.id, c.id, examples.amount, examples.transaction_date, examples.note
FROM (VALUES
  ('Test Bank', 'Salary', 'income', 5000.00, DATE '2026-10-01', 'Synthetic salary'),
  ('Test Card', 'Groceries', 'expense', 1000.00, DATE '2026-10-05', 'Synthetic card purchase'),
  ('Test Bank', 'Groceries', 'expense', 300.00, DATE '2026-10-15', 'Synthetic bank purchase'),
  ('Test Bank', 'Groceries', 'expense', 99.00, DATE '2026-09-30', 'Synthetic prior-month purchase'),
  ('Test E-wallet', 'Food', 'expense', 25.00, DATE '2026-10-18', 'Synthetic negative-balance case')
) AS examples(account_name, category_name, category_type, amount, transaction_date, note)
JOIN accounts AS a ON a.name = examples.account_name
JOIN categories AS c
  ON c.name = examples.category_name
  AND c.type = examples.category_type;

INSERT INTO credit_card_payments
  (source_account_id, card_account_id, amount, payment_date, note)
SELECT source.id, card.id, examples.amount, examples.payment_date, examples.note
FROM (VALUES
  ('Test Bank', 'Test Card', 600.00, DATE '2026-10-20', 'Synthetic card payment'),
  ('Test Cash', 'Overpaid Card', 150.00, DATE '2026-10-22', 'Synthetic overpayment')
) AS examples(source_name, card_name, amount, payment_date, note)
JOIN accounts AS source ON source.name = examples.source_name
JOIN accounts AS card ON card.name = examples.card_name;

-- These test-only formulas mirror the financial definitions in the TLD.
-- Production routes will own the corresponding readable SQL in Milestone 7.
CREATE TEMP VIEW test_account_positions AS
SELECT
  a.id,
  a.name,
  a.type,
  a.credit_limit,
  CASE
    WHEN a.type = 'credit_card' THEN
      a.opening_debt
        + COALESCE((
          SELECT SUM(t.amount)
          FROM transactions AS t
          JOIN categories AS c ON c.id = t.category_id
          WHERE t.account_id = a.id AND c.type = 'expense'
        ), 0)
        - COALESCE((
          SELECT SUM(p.amount)
          FROM credit_card_payments AS p
          WHERE p.card_account_id = a.id
        ), 0)
    ELSE
      a.opening_balance
        + COALESCE((
          SELECT SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE -t.amount END)
          FROM transactions AS t
          JOIN categories AS c ON c.id = t.category_id
          WHERE t.account_id = a.id
        ), 0)
        - COALESCE((
          SELECT SUM(p.amount)
          FROM credit_card_payments AS p
          WHERE p.source_account_id = a.id
        ), 0)
  END AS position
FROM accounts AS a;

DO $$
DECLARE
  observed NUMERIC(12, 2);
  liquid_balance NUMERIC(12, 2);
  outstanding_debt NUMERIC(12, 2);
  net_position NUMERIC(12, 2);
  month_income NUMERIC(12, 2);
  month_expenses NUMERIC(12, 2);
BEGIN
  -- Corrections can require signed baselines; the account type rules still apply.
  INSERT INTO accounts (name, type, opening_balance)
  VALUES ('Correction baseline bank', 'bank', -10.00);
  INSERT INTO accounts (name, type, opening_debt, credit_limit)
  VALUES ('Correction baseline card', 'credit_card', -10.00, 100.00);
  DELETE FROM accounts WHERE name IN ('Correction baseline bank', 'Correction baseline card');

  IF (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) <> 5 THEN
    RAISE EXCEPTION 'Expected exactly five core tables';
  END IF;

  IF (SELECT COUNT(*) FROM categories) <> 9 THEN
    RAISE EXCEPTION 'Expected nine seeded categories after applying seed twice';
  END IF;

  IF (SELECT COUNT(*) FROM categories WHERE name = 'Other') <> 2 THEN
    RAISE EXCEPTION 'Expected one Other category for each category type';
  END IF;

  -- Invalid account combinations and non-positive transactions are rejected.
  BEGIN
    INSERT INTO accounts (name, type, opening_debt)
    VALUES ('Invalid Cash Debt', 'cash', 1.00);
    RAISE EXCEPTION 'Expected cash opening debt to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO accounts (name, type)
    VALUES ('  tESt bANK  ', 'bank');
    RAISE EXCEPTION 'Expected trimmed case-insensitive account name to be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO categories (name, type) VALUES ('Food', 'expense');
    RAISE EXCEPTION 'Expected duplicate category name/type to be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO transactions (account_id, category_id, amount, transaction_date)
    SELECT a.id, c.id, 0.00, DATE '2026-10-01'
    FROM accounts AS a
    CROSS JOIN categories AS c
    WHERE a.name = 'Test Bank' AND c.name = 'Salary' AND c.type = 'income';
    RAISE EXCEPTION 'Expected zero transaction amount to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO credit_card_payments
      (source_account_id, card_account_id, amount, payment_date)
    SELECT a.id, a.id, 1.00, DATE '2026-10-01'
    FROM accounts AS a
    WHERE a.name = 'Test Bank';
    RAISE EXCEPTION 'Expected same-account card payment to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  SELECT position INTO observed FROM test_account_positions WHERE name = 'Test Bank';
  IF observed <> 9001.00 THEN
    RAISE EXCEPTION 'Expected Test Bank balance 9001.00, got %', observed;
  END IF;

  SELECT position INTO observed FROM test_account_positions WHERE name = 'Test E-wallet';
  IF observed <> -25.00 THEN
    RAISE EXCEPTION 'Expected negative E-wallet balance -25.00, got %', observed;
  END IF;

  SELECT position INTO observed FROM test_account_positions WHERE name = 'Test Card';
  IF observed <> 400.00 THEN
    RAISE EXCEPTION 'Expected Test Card signed debt 400.00, got %', observed;
  END IF;

  SELECT credit_limit - position
  INTO observed
  FROM test_account_positions
  WHERE name = 'Overpaid Card';
  IF observed <> 5050.00 THEN
    RAISE EXCEPTION 'Expected overpaid card available credit 5050.00, got %', observed;
  END IF;

  SELECT SUM(position) INTO liquid_balance
  FROM test_account_positions
  WHERE type <> 'credit_card';
  IF liquid_balance <> 9026.00 THEN
    RAISE EXCEPTION 'Expected liquid balance 9026.00, got %', liquid_balance;
  END IF;

  SELECT SUM(GREATEST(position, 0)) INTO outstanding_debt
  FROM test_account_positions
  WHERE type = 'credit_card';
  IF outstanding_debt <> 400.00 THEN
    RAISE EXCEPTION 'Expected outstanding debt 400.00, got %', outstanding_debt;
  END IF;

  SELECT liquid_balance - SUM(position) INTO net_position
  FROM test_account_positions
  WHERE type = 'credit_card';
  IF net_position <> 8676.00 THEN
    RAISE EXCEPTION 'Expected net position 8676.00, got %', net_position;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END), 0)
  INTO month_income, month_expenses
  FROM transactions AS t
  JOIN categories AS c ON c.id = t.category_id
  WHERE t.transaction_date >= DATE '2026-10-01'
    AND t.transaction_date < DATE '2026-11-01';

  IF month_income <> 5000.00 THEN
    RAISE EXCEPTION 'Expected October income 5000.00, got %', month_income;
  END IF;
  IF month_expenses <> 1325.00 THEN
    RAISE EXCEPTION 'Expected October expenses 1325.00 (excluding card payments), got %', month_expenses;
  END IF;

  -- Purchase edits and deletes recalculate debt; a payment remains separate.
  UPDATE transactions AS t
  SET amount = 1200.00
  FROM accounts AS a
  WHERE a.id = t.account_id
    AND a.name = 'Test Card'
    AND t.note = 'Synthetic card purchase';

  SELECT position INTO observed FROM test_account_positions WHERE name = 'Test Card';
  IF observed <> 600.00 THEN
    RAISE EXCEPTION 'Expected edited Test Card signed debt 600.00, got %', observed;
  END IF;

  DELETE FROM transactions AS t
  USING accounts AS a
  WHERE a.id = t.account_id
    AND a.name = 'Test Card'
    AND t.note = 'Synthetic card purchase';

  SELECT position INTO observed FROM test_account_positions WHERE name = 'Test Card';
  IF observed <> -600.00 THEN
    RAISE EXCEPTION 'Expected Test Card signed debt -600.00 after deleting purchase, got %', observed;
  END IF;
END;
$$;

ROLLBACK;

\echo 'Accounting SQL checks passed.'
