-- Verify a backup before applying to an existing database.
-- Current-amount corrections may require signed baselines; ledger rows stay intact.
BEGIN;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_opening_balance_check;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_opening_debt_check;
COMMIT;
