-- Crypto Portfolio V1, Phase 1: precision, provider identity, tracked coins,
-- event-time ordering, locations and non-disposing transfers. Forward-only.

CREATE TYPE "crypto_location_type" AS ENUM ('exchange', 'wallet', 'other');

ALTER TABLE "instruments"
  ADD COLUMN "tracked" BOOLEAN NOT NULL DEFAULT true;

-- Crypto IDs, rather than display symbols, are the authoritative provider identity.
DROP INDEX "instruments_user_id_ticker_key";
CREATE INDEX "instruments_user_id_ticker_idx" ON "instruments"("user_id", "ticker");
CREATE UNIQUE INDEX "instruments_user_id_provider_asset_id_key"
  ON "instruments"("user_id", "provider_asset_id");

-- Only safe, unambiguous legacy IDs are backfilled. Unknown assets intentionally
-- remain unlinked for a user to choose through catalog search.
UPDATE "instruments"
SET "provider_asset_id" = CASE upper("ticker")
  WHEN 'BTC' THEN 'bitcoin'
  WHEN 'ETH' THEN 'ethereum'
  WHEN 'SOL' THEN 'solana'
  WHEN 'XRP' THEN 'ripple'
  ELSE "provider_asset_id"
END
WHERE "asset_type" = 'crypto'::"instrument_asset_type"
  AND "provider_asset_id" IS NULL
  AND upper("ticker") IN ('BTC', 'ETH', 'SOL', 'XRP');

ALTER TABLE "investment_trades"
  ALTER COLUMN "units" TYPE DECIMAL(38,18),
  ADD COLUMN "price_amount" DECIMAL(38,18),
  ADD COLUMN "fee_amount" DECIMAL(38,18) NOT NULL DEFAULT 0,
  ADD COLUMN "occurred_time" TIME,
  ADD COLUMN "location_id" UUID;

UPDATE "investment_trades"
SET "price_amount" = "price_minor"::DECIMAL / 100,
    "fee_amount" = "fee_minor"::DECIMAL / 100;

ALTER TABLE "investment_trades"
  ALTER COLUMN "price_amount" SET NOT NULL;

CREATE TABLE "crypto_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "crypto_location_type" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "crypto_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crypto_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "crypto_locations_user_id_name_key" ON "crypto_locations"("user_id", "name");
CREATE INDEX "crypto_locations_user_id_active_idx" ON "crypto_locations"("user_id", "active");

ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "crypto_locations"("id") ON DELETE SET NULL;
DROP INDEX "investment_trades_user_id_instrument_id_occurred_on_idx";
CREATE INDEX "investment_trades_user_id_instrument_id_occurred_on_occurred_time_idx"
  ON "investment_trades"("user_id", "instrument_id", "occurred_on", "occurred_time");

CREATE TABLE "crypto_transfers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "instrument_id" UUID NOT NULL,
  "units" DECIMAL(38,18) NOT NULL,
  "from_location_id" UUID NOT NULL,
  "to_location_id" UUID NOT NULL,
  "network_fee_units" DECIMAL(38,18) NOT NULL DEFAULT 0,
  "occurred_on" DATE NOT NULL,
  "occurred_time" TIME,
  "note" TEXT,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crypto_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crypto_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "crypto_transfers_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT,
  CONSTRAINT "crypto_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "crypto_locations"("id") ON DELETE RESTRICT,
  CONSTRAINT "crypto_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "crypto_locations"("id") ON DELETE RESTRICT,
  CONSTRAINT "crypto_transfers_user_id_idempotency_key_key" UNIQUE ("user_id", "idempotency_key"),
  CONSTRAINT "crypto_transfers_distinct_locations_check" CHECK ("from_location_id" <> "to_location_id"),
  CONSTRAINT "crypto_transfers_positive_units_check" CHECK ("units" > 0 AND "network_fee_units" >= 0)
);
CREATE INDEX "crypto_transfers_user_id_instrument_id_occurred_on_occurred_time_idx"
  ON "crypto_transfers"("user_id", "instrument_id", "occurred_on", "occurred_time");
CREATE INDEX "crypto_transfers_user_id_from_location_id_idx" ON "crypto_transfers"("user_id", "from_location_id");
CREATE INDEX "crypto_transfers_user_id_to_location_id_idx" ON "crypto_transfers"("user_id", "to_location_id");

ALTER TABLE "quote_snapshots" ADD COLUMN "price_amount" DECIMAL(38,18);
UPDATE "quote_snapshots" SET "price_amount" = "price_minor"::DECIMAL / 100;
