-- Seed only fictional ledger rows on the disposable migration-test database.
-- These committed fixtures let the test compare existing records across 005.
BEGIN;

INSERT INTO accounts (name, type, opening_balance)
VALUES ('Kakeibo migration cash', 'cash', 1000.00);

INSERT INTO accounts (name, type, opening_balance)
VALUES ('Kakeibo migration bank', 'bank', 1000.00);

INSERT INTO accounts (name, type, opening_debt, credit_limit)
VALUES ('Kakeibo migration card', 'credit_card', 100.00, 5000.00);

INSERT INTO transactions (account_id, category_id, amount, transaction_date, note)
SELECT a.id, c.id, examples.amount, examples.transaction_date, examples.note
FROM (VALUES
  ('Kakeibo migration cash', 'Salary', 'income', 1000.00, DATE '2026-10-01', 'Synthetic income'),
  ('Kakeibo migration cash', 'Food', 'expense', 125.00, DATE '2026-10-02', 'Synthetic historical expense'),
  ('Kakeibo migration card', 'Food', 'expense', 250.00, DATE '2026-10-03', 'Synthetic card purchase')
) AS examples(account_name, category_name, category_type, amount, transaction_date, note)
JOIN accounts AS a ON a.name = examples.account_name
JOIN categories AS c ON c.name = examples.category_name AND c.type = examples.category_type;

INSERT INTO credit_card_payments
  (source_account_id, card_account_id, amount, payment_date, note)
SELECT source.id, card.id, 100.00, DATE '2026-10-04', 'Synthetic card payment'
FROM accounts AS source
CROSS JOIN accounts AS card
WHERE source.name = 'Kakeibo migration cash'
  AND card.name = 'Kakeibo migration card';

INSERT INTO account_transfers
  (source_account_id, destination_account_id, amount, transfer_date, note)
SELECT source.id, destination.id, 50.00, DATE '2026-10-05', 'Synthetic liquid transfer'
FROM accounts AS source
CROSS JOIN accounts AS destination
WHERE source.name = 'Kakeibo migration cash'
  AND destination.name = 'Kakeibo migration bank';

DO $$
DECLARE
  cash_balance NUMERIC(12, 2);
  bank_balance NUMERIC(12, 2);
  card_debt NUMERIC(12, 2);
BEGIN
  SELECT a.opening_balance
    + COALESCE((SELECT SUM(t.amount) FROM transactions AS t
                JOIN categories AS c ON c.id = t.category_id
                WHERE t.account_id = a.id AND c.type = 'income'), 0)
    - COALESCE((SELECT SUM(t.amount) FROM transactions AS t
                JOIN categories AS c ON c.id = t.category_id
                WHERE t.account_id = a.id AND c.type = 'expense'), 0)
    - COALESCE((SELECT SUM(p.amount) FROM credit_card_payments AS p
                WHERE p.source_account_id = a.id), 0)
    - COALESCE((SELECT SUM(x.amount) FROM account_transfers AS x
                WHERE x.source_account_id = a.id), 0)
    + COALESCE((SELECT SUM(x.amount) FROM account_transfers AS x
                WHERE x.destination_account_id = a.id), 0)
  INTO cash_balance
  FROM accounts AS a WHERE a.name = 'Kakeibo migration cash';

  SELECT a.opening_balance
    + COALESCE((SELECT SUM(t.amount) FROM account_transfers AS t
                WHERE t.destination_account_id = a.id), 0)
  INTO bank_balance
  FROM accounts AS a WHERE a.name = 'Kakeibo migration bank';

  SELECT a.opening_debt
    + COALESCE((SELECT SUM(t.amount) FROM transactions AS t
                JOIN categories AS c ON c.id = t.category_id
                WHERE t.account_id = a.id AND c.type = 'expense'), 0)
    - COALESCE((SELECT SUM(p.amount) FROM credit_card_payments AS p
                WHERE p.card_account_id = a.id), 0)
  INTO card_debt
  FROM accounts AS a WHERE a.name = 'Kakeibo migration card';

  IF cash_balance <> 1725.00 OR bank_balance <> 1050.00 OR card_debt <> 250.00 THEN
    RAISE EXCEPTION 'Pre-migration fixture positions are wrong: cash %, bank %, card %',
      cash_balance, bank_balance, card_debt;
  END IF;
END $$;

COMMIT;
