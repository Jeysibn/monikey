-- Stage 6B: manual recurring-payment confirmation. Additive only: one new table, one new enum,
-- one nullable column. No existing row is rewritten; old API/worker versions ignore all of it.
CREATE TYPE "recurring_occurrence_status" AS ENUM ('confirmed', 'skipped');

ALTER TABLE "recurring_items" ADD COLUMN "anchor_day" SMALLINT;
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_anchor_day_range" CHECK ("anchor_day" IS NULL OR ("anchor_day" BETWEEN 1 AND 31));

CREATE TABLE "recurring_occurrences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recurring_item_id" UUID NOT NULL,
  "due_date" DATE NOT NULL,
  "status" "recurring_occurrence_status" NOT NULL,
  "transaction_id" UUID,
  "paid_on" DATE,
  "amount_minor" BIGINT,
  "account_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurring_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recurring_occurrences_item_fkey" FOREIGN KEY ("recurring_item_id") REFERENCES "recurring_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recurring_occurrences_transaction_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "recurring_occurrences_confirmed_has_transaction" CHECK ("status" <> 'confirmed' OR "transaction_id" IS NOT NULL),
  CONSTRAINT "recurring_occurrences_skipped_has_no_transaction" CHECK ("status" <> 'skipped' OR "transaction_id" IS NULL)
);
CREATE UNIQUE INDEX "recurring_occurrences_item_due_key" ON "recurring_occurrences" ("recurring_item_id", "due_date");
CREATE UNIQUE INDEX "recurring_occurrences_transaction_id_key" ON "recurring_occurrences" ("transaction_id");
