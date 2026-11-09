-- Synthetic pre-007 financial rows. Migration 007 must preserve them verbatim.
INSERT INTO accounts (name, type, opening_balance)
VALUES ('Synthetic category migration cash', 'cash', 5000.00);

UPDATE categories
SET default_kakeibo_envelope = 'needs'
WHERE name = 'Food' AND type = 'expense';

INSERT INTO transactions (account_id, category_id, amount, transaction_date, note, kakeibo_envelope)
SELECT a.id, c.id, 123.45, DATE '2026-10-02', 'Synthetic category migration expense', 'wants'
FROM accounts AS a CROSS JOIN categories AS c
WHERE a.name = 'Synthetic category migration cash'
  AND c.name = 'Food' AND c.type = 'expense';

INSERT INTO transactions (account_id, category_id, amount, transaction_date, note)
SELECT a.id, c.id, 250.00, DATE '2026-10-03', 'Synthetic category migration income'
FROM accounts AS a CROSS JOIN categories AS c
WHERE a.name = 'Synthetic category migration cash'
  AND c.name = 'Salary' AND c.type = 'income';
