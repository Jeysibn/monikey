CREATE TABLE "transaction_splits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "transaction_id" UUID NOT NULL,
  "category_id" UUID NOT NULL, "amount_minor" BIGINT NOT NULL, "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE,
  CONSTRAINT "transaction_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "transaction_splits_transaction_id_category_id_key" ON "transaction_splits"("transaction_id", "category_id");
CREATE INDEX "transaction_splits_category_id_idx" ON "transaction_splits"("category_id");
