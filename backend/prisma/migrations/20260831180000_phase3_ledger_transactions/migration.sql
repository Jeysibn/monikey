-- Phase 3: Ledger/Accounts/Transactions
-- Creates goals, transactions, and transaction_balance_effects tables

-- Helper function for updated_at triggers
CREATE OR REPLACE FUNCTION "update_updated_at_column"() RETURNS trigger AS $$
BEGIN
    NEW."updated_at" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- goals table
CREATE TABLE "goals" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "target_minor" BIGINT NOT NULL,
    "current_minor" BIGINT NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'PHP',
    "target_date" DATE NOT NULL,
    "completed_date" DATE,
    "monthly_contribution_minor" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- transactions table
CREATE TABLE "transactions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "type" TEXT NOT NULL CHECK ("type" IN ('income','expense','transfer')),
    "title" TEXT NOT NULL,
    "category_id" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
    "goal_id" UUID REFERENCES "goals"("id") ON DELETE SET NULL,
    "from_account_id" UUID REFERENCES "financial_accounts"("id") ON DELETE SET NULL,
    "to_account_id" UUID REFERENCES "financial_accounts"("id") ON DELETE SET NULL,
    "occurred_on" DATE NOT NULL,
    "occurred_time" TIME WITHOUT TIME ZONE,
    "amount_minor" BIGINT NOT NULL,
    "fee_minor" BIGINT NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'PHP',
    "source" TEXT NOT NULL CHECK ("source" IN ('manual','ocr','recurring')),
    "status" TEXT NOT NULL CHECK ("status" IN ('cleared','pending')),
    "note" TEXT,
    "idempotency_key" TEXT,
    "reversed_transaction_id" UUID REFERENCES "transactions"("id") ON DELETE SET NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Indexes for transactions
CREATE INDEX "transactions_user_id_occurred_on_idx" ON "transactions"("user_id", "occurred_on" DESC);
CREATE INDEX "transactions_user_id_category_id_occurred_on_idx" ON "transactions"("user_id", "category_id", "occurred_on");
CREATE UNIQUE INDEX "transactions_user_id_idempotency_key_idx" ON "transactions"("user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- transaction_balance_effects table
CREATE TABLE "transaction_balance_effects" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
    "account_id" UUID NOT NULL REFERENCES "financial_accounts"("id") ON DELETE CASCADE,
    "role" TEXT NOT NULL CHECK ("role" IN ('source','destination','expense','income','card_charge','card_payment','fee')),
    "delta_minor" BIGINT NOT NULL,
    "balance_after_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Index for balance effects
CREATE INDEX "transaction_balance_effects_transaction_id_idx" ON "transaction_balance_effects"("transaction_id");
CREATE INDEX "transaction_balance_effects_account_id_idx" ON "transaction_balance_effects"("account_id");

-- Update triggers
CREATE TRIGGER "goals_updated_at"
BEFORE UPDATE ON "goals"
FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();

CREATE TRIGGER "transactions_updated_at"
BEFORE UPDATE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION "update_updated_at_column"();