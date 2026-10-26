-- Add liquid-account transfers to an existing MoniKey database.
-- Take and verify a backup before applying this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS account_transfers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_account_id INTEGER NOT NULL REFERENCES accounts(id),
  destination_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  transfer_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_account_id <> destination_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_transfers_source_date
  ON account_transfers(source_account_id, transfer_date DESC);

CREATE INDEX IF NOT EXISTS idx_account_transfers_destination_date
  ON account_transfers(destination_account_id, transfer_date DESC);

COMMIT;
