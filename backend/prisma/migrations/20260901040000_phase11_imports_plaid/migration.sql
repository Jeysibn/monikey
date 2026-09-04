-- Phase 11: Plaid Sandbox integration and manual import foundation.
-- Adds tables for:
-- 1. PlaidItem: encrypted Plaid access token storage
-- 2. PlaidLinkToken: temporary link session tokens
-- 3. ImportBatch: staging area for Plaid/CSV imports
-- 4. ImportedTransaction: draft transactions pending user review
-- 5. Posting: link between imported transactions and real ledger transactions

-- Add "import" to transaction_source enum
ALTER TYPE "transaction_source" ADD VALUE 'import';

-- Create plaid_items table for storing encrypted Plaid access tokens
CREATE TABLE "plaid_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "item_id" text NOT NULL,
  "institution_name" text,
  "account_ids" text[] NOT NULL DEFAULT '{}',
  "encrypted_access_token" text NOT NULL,
  "last_synced_at" timestamptz,
  "status" text NOT NULL DEFAULT 'active',
  "error_message" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "plaid_items_user_id_item_id_key" ON "plaid_items"("user_id", "item_id");
CREATE INDEX "plaid_items_user_id_created_at_idx" ON "plaid_items"("user_id", "created_at" DESC);

-- Create plaid_link_tokens table for temporary link sessions
CREATE TABLE "plaid_link_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "link_token" text NOT NULL,
  "expires_at" timestamptz(6) NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "plaid_link_tokens_link_token_key" ON "plaid_link_tokens"("link_token");
CREATE INDEX "plaid_link_tokens_user_id_created_at_idx" ON "plaid_link_tokens"("user_id", "created_at");

-- Create import_batches table for staging Plaid/CSV imports
CREATE TABLE "import_batches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "import_source_id" uuid,
  "import_source_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'reviewing',
  "matched_account_id" uuid,
  "total_count" integer NOT NULL DEFAULT 0,
  "committed_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "committed_at" timestamptz(6),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("import_source_id") REFERENCES "plaid_items"("id") ON DELETE SET NULL,
  FOREIGN KEY ("matched_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL
);

CREATE INDEX "import_batches_user_id_status_created_at_idx"
  ON "import_batches"("user_id", "status", "created_at" DESC);
CREATE INDEX "import_batches_user_id_matched_account_id_idx"
  ON "import_batches"("user_id", "matched_account_id");

-- Create imported_transactions table for draft imported transactions
CREATE TABLE "imported_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "import_batch_id" uuid NOT NULL,
  "dedup_key" text NOT NULL,
  "provider" text NOT NULL,
  "provider_transaction_id" text,
  "occurred_on" date NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "amount_minor" bigint NOT NULL,
  "currency_code" char(3) NOT NULL DEFAULT 'PHP',
  "merchant_name" text,
  "status" text NOT NULL DEFAULT 'pending_review',
  "validation_errors" text[] NOT NULL DEFAULT '{}',
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "imported_transactions_import_batch_id_dedup_key_key"
  ON "imported_transactions"("import_batch_id", "dedup_key");
CREATE INDEX "imported_transactions_import_batch_id_status_idx"
  ON "imported_transactions"("import_batch_id", "status");
CREATE INDEX "imported_transactions_provider_dedup_key_idx"
  ON "imported_transactions"("provider", "dedup_key");

-- Create postings table to link imported transactions to real ledger transactions
CREATE TABLE "postings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "imported_transaction_id" uuid NOT NULL,
  "transaction_id" uuid NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("imported_transaction_id") REFERENCES "imported_transactions"("id") ON DELETE CASCADE,
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "postings_imported_transaction_id_key"
  ON "postings"("imported_transaction_id");
CREATE UNIQUE INDEX "postings_transaction_id_key"
  ON "postings"("transaction_id");
CREATE INDEX "postings_transaction_id_idx" ON "postings"("transaction_id");

-- Add trigger to update updated_at on plaid_items
CREATE OR REPLACE FUNCTION update_plaid_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plaid_items_updated_at_trigger
BEFORE UPDATE ON "plaid_items"
FOR EACH ROW
EXECUTE FUNCTION update_plaid_items_updated_at();

-- Add trigger to update updated_at on import_batches
CREATE OR REPLACE FUNCTION update_import_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_batches_updated_at_trigger
BEFORE UPDATE ON "import_batches"
FOR EACH ROW
EXECUTE FUNCTION update_import_batches_updated_at();
