-- Synthetic pre-009 state: a category that already has a migration-008 icon, and a ledger row that uses it.
-- Used to prove the upgrade from schema 008 to 009 changes no ledger data and keeps every existing icon valid.
INSERT INTO accounts (name, type, opening_balance, opening_debt, credit_limit)
VALUES ('Synthetic color migration cash', 'cash', 900.00, 0.00, NULL);

UPDATE categories SET icon_key = 'utensils' WHERE name = 'Food' AND type = 'expense';

INSERT INTO transactions (account_id, category_id, amount, transaction_date, note, kakeibo_envelope)
SELECT a.id, c.id, 88.88, DATE '2026-10-12', 'Synthetic color migration expense', 'needs'
FROM accounts AS a
CROSS JOIN categories AS c
WHERE a.name = 'Synthetic color migration cash'
  AND c.name = 'Food' AND c.type = 'expense';
