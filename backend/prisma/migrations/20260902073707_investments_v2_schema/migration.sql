-- Investment V2 Phase 1: explicit market identity, fees, dividend cash linkage,
-- and asset-specific quote fields. Additive only — no existing columns are
-- dropped or altered, and no historical trade/dividend/quote data is touched.

-- CreateEnum
CREATE TYPE "instrument_asset_type" AS ENUM ('stock', 'etf', 'crypto', 'reit', 'bond');

-- AlterTable: instruments — explicit market identity
ALTER TABLE "instruments"
  ADD COLUMN "asset_type" "instrument_asset_type",
  ADD COLUMN "exchange" TEXT,
  ADD COLUMN "provider_symbol" TEXT,
  ADD COLUMN "base_asset" TEXT,
  ADD COLUMN "quote_asset" TEXT,
  ADD COLUMN "provider_asset_id" TEXT;

-- AlterTable: investment_trades — trade currency, fees, settlement/FX
ALTER TABLE "investment_trades"
  ADD COLUMN "currency_code" CHAR(3) NOT NULL DEFAULT 'PHP',
  ADD COLUMN "fee_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "settlement_amount_minor" BIGINT,
  ADD COLUMN "settlement_currency_code" CHAR(3),
  ADD COLUMN "fx_rate_to_base" DECIMAL(20,10);

-- AlterTable: dividends — cash account linkage + idempotency, matching trades
ALTER TABLE "dividends"
  ADD COLUMN "cash_account_id" UUID,
  ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "dividends_user_id_idempotency_key_key" ON "dividends"("user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_cash_account_id_fkey"
  FOREIGN KEY ("cash_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: quote_snapshots — asset-specific quote fields
-- Equity (stock/ETF/REIT): previous close, day change. Crypto: 24h change.
ALTER TABLE "quote_snapshots"
  ADD COLUMN "previous_close_minor" BIGINT,
  ADD COLUMN "day_change_minor" BIGINT,
  ADD COLUMN "day_change_pct" DECIMAL(10,4),
  ADD COLUMN "change_24h_minor" BIGINT,
  ADD COLUMN "change_24h_pct" DECIMAL(10,4),
  ADD COLUMN "market_timestamp" TIMESTAMPTZ(6);
