-- Align the Prisma enum declarations with the original Phase 3 migration,
-- which created these constrained values as TEXT columns. The conversion is
-- explicit and preserves existing rows while making future Prisma writes
-- type-compatible with the database.
CREATE TYPE "transaction_type" AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE "transaction_source" AS ENUM ('manual', 'ocr', 'recurring');
CREATE TYPE "transaction_status" AS ENUM ('cleared', 'pending');
CREATE TYPE "balance_effect_role" AS ENUM ('source', 'destination', 'expense', 'income', 'card_charge', 'card_payment', 'fee');

ALTER TABLE "transactions"
  DROP CONSTRAINT "transactions_type_check",
  DROP CONSTRAINT "transactions_source_check",
  DROP CONSTRAINT "transactions_status_check";
ALTER TABLE "transaction_balance_effects"
  DROP CONSTRAINT "transaction_balance_effects_role_check";

ALTER TABLE "transactions"
  ALTER COLUMN "type" TYPE "transaction_type" USING "type"::"transaction_type",
  ALTER COLUMN "source" TYPE "transaction_source" USING "source"::"transaction_source",
  ALTER COLUMN "status" TYPE "transaction_status" USING "status"::"transaction_status";

ALTER TABLE "transaction_balance_effects"
  ALTER COLUMN "role" TYPE "balance_effect_role" USING "role"::"balance_effect_role";
