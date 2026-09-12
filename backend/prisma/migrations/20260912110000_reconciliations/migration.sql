CREATE TABLE "reconciliations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL, "statement_date" DATE NOT NULL,
  "statement_balance_minor" BIGINT NOT NULL, "calculated_balance_minor" BIGINT NOT NULL,
  "difference_minor" BIGINT NOT NULL, "status" TEXT NOT NULL DEFAULT 'unreconciled',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reconciliations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE CASCADE
);
CREATE INDEX "reconciliations_user_id_account_id_statement_date_idx" ON "reconciliations"("user_id", "account_id", "statement_date");
