CREATE TABLE "quote_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instrument_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "price_minor" BIGINT NOT NULL CHECK ("price_minor" > 0),
    "currency_code" CHAR(3) NOT NULL DEFAULT 'PHP',
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_snapshots_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "quote_snapshots_instrument_id_fetched_at_idx" ON "quote_snapshots"("instrument_id", "fetched_at");
