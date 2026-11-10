-- Synthetic pre-008 ledger row used to prove the additive icon migration preserves history.
INSERT INTO accounts (name, type, opening_balance, opening_debt, credit_limit)
VALUES ('Synthetic icon migration cash', 'cash', 500.00, 0.00, NULL);

INSERT INTO transactions (account_id, category_id, amount, transaction_date, note, kakeibo_envelope)
SELECT a.id, c.id, 77.77, DATE '2026-10-10', 'Synthetic icon migration expense', 'culture'
FROM accounts AS a
CROSS JOIN categories AS c
WHERE a.name = 'Synthetic icon migration cash'
  AND c.name = 'Food' AND c.type = 'expense';
