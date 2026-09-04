-- Phase 11 Defect 5: Convert global deduplication from INDEX to UNIQUE constraint
-- Ensures that (provider, dedup_key) cannot be duplicated even across different batches.
-- This prevents race conditions in concurrent sync operations.

-- Drop the old non-unique index
DROP INDEX IF EXISTS "imported_transactions_provider_dedup_key_idx";

-- Add a unique constraint on (provider, dedup_key)
ALTER TABLE "imported_transactions"
ADD CONSTRAINT "imported_transactions_provider_dedup_key_unique"
UNIQUE ("provider", "dedup_key");
