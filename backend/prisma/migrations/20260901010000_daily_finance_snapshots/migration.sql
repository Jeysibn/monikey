-- Phase 7: Daily Finance Snapshots
-- Materialized cache of daily net-worth and balance summaries per user.
-- Optimizes report generation and historical trending.
-- This table is rebuildable from ledger history + FX/market snapshots.

CREATE TABLE "daily_finance_snapshots" (
    "user_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "asset_total_minor" BIGINT NOT NULL DEFAULT 0,
    "liability_total_minor" BIGINT NOT NULL DEFAULT 0,
    "net_worth_minor" BIGINT NOT NULL DEFAULT 0,
    "card_debt_minor" BIGINT NOT NULL DEFAULT 0,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'PHP',
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_finance_snapshots_pkey" PRIMARY KEY ("user_id", "snapshot_date")
);

CREATE INDEX "daily_finance_snapshots_user_id_snapshot_date_idx" ON "daily_finance_snapshots"("user_id", "snapshot_date" DESC);
