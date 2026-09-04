CREATE TYPE "investment_trade_type" AS ENUM ('buy', 'sell');

CREATE TABLE "instruments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_class" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'PHP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "instruments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "instruments_user_id_ticker_key" ON "instruments"("user_id", "ticker");
CREATE INDEX "instruments_ticker_idx" ON "instruments"("ticker");

CREATE TABLE "investment_trades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "type" "investment_trade_type" NOT NULL,
    "units" DECIMAL(30,10) NOT NULL CHECK ("units" > 0),
    "price_minor" BIGINT NOT NULL CHECK ("price_minor" > 0),
    "occurred_on" DATE NOT NULL,
    "cash_account_id" UUID,
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investment_trades_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "investment_trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "investment_trades_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "investment_trades_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "investment_trades_user_id_idempotency_key_key" ON "investment_trades"("user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "investment_trades_user_id_instrument_id_occurred_on_idx" ON "investment_trades"("user_id", "instrument_id", "occurred_on");

CREATE TABLE "dividends" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL CHECK ("amount_minor" > 0),
    "occurred_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dividends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dividends_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "dividends_user_id_instrument_id_occurred_on_idx" ON "dividends"("user_id", "instrument_id", "occurred_on");
