CREATE SEQUENCE "crypto_activity_sequence";

ALTER TABLE "investment_trades" ADD COLUMN "event_sequence" BIGINT;
ALTER TABLE "crypto_transfers" ADD COLUMN "event_sequence" BIGINT;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id)::BIGINT AS sequence
  FROM (
    SELECT id, created_at FROM "investment_trades"
    UNION ALL
    SELECT id, created_at FROM "crypto_transfers"
  ) activities
)
UPDATE "investment_trades" AS trades
SET event_sequence = ordered.sequence
FROM ordered
WHERE ordered.id = trades.id;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id)::BIGINT AS sequence
  FROM (
    SELECT id, created_at FROM "investment_trades"
    UNION ALL
    SELECT id, created_at FROM "crypto_transfers"
  ) activities
)
UPDATE "crypto_transfers" AS transfers
SET event_sequence = ordered.sequence
FROM ordered
WHERE ordered.id = transfers.id;

SELECT setval('crypto_activity_sequence', GREATEST(
  COALESCE((SELECT MAX(event_sequence) FROM "investment_trades"), 0),
  COALESCE((SELECT MAX(event_sequence) FROM "crypto_transfers"), 0),
  1
));

ALTER TABLE "investment_trades"
  ALTER COLUMN "event_sequence" SET DEFAULT nextval('crypto_activity_sequence'::regclass),
  ALTER COLUMN "event_sequence" SET NOT NULL;
ALTER TABLE "crypto_transfers"
  ALTER COLUMN "event_sequence" SET DEFAULT nextval('crypto_activity_sequence'::regclass),
  ALTER COLUMN "event_sequence" SET NOT NULL;

CREATE INDEX "investment_trades_instrument_id_event_sequence_idx" ON "investment_trades"("instrument_id", "event_sequence");
CREATE INDEX "crypto_transfers_instrument_id_event_sequence_idx" ON "crypto_transfers"("instrument_id", "event_sequence");
