-- Verify a backup before applying to an existing database.
-- Presentation only: the card a person picked for an account (ADR-020).
BEGIN;
ALTER TABLE accounts
  ADD COLUMN card_product_id VARCHAR(64) NULL,
  ADD CONSTRAINT accounts_card_product_id_format
    CHECK (card_product_id IS NULL OR card_product_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT accounts_card_product_id_not_cash
    CHECK (type <> 'cash' OR card_product_id IS NULL);
COMMIT;
