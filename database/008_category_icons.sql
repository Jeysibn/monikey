-- Category icons are optional presentation metadata. This migration does not alter
-- category identity, transaction references, amounts, or saved Kakeibo classifications.
-- Take and verify a backup before applying this migration to an existing database.
BEGIN;

ALTER TABLE categories
  ADD COLUMN icon_key TEXT,
  ADD CONSTRAINT categories_icon_key_allowed CHECK (
    icon_key IS NULL OR icon_key IN (
      'shopping-basket', 'utensils', 'car-front', 'house', 'briefcase-business', 'graduation-cap',
      'heart-pulse', 'gamepad-2', 'book-open', 'shopping-bag', 'gift', 'piggy-bank'
    )
  );

COMMIT;
