-- Category color is optional presentation metadata (ADR-026). It stores one of ten curated names, or a custom
-- lower-case "#rrggbb" value; never any other CSS. The frontend derives the contrast-checked tint and ink for
-- both forms. This migration also widens the icon
-- allowlist to a strict superset of migration 008's, so no existing icon value becomes invalid.
-- It does not alter category identity, transaction references, amounts, archive state, Kakeibo defaults or
-- saved Kakeibo classifications, and it backfills nothing: existing rows keep color_key NULL.
-- Take and verify a backup before applying this migration to an existing database.
BEGIN;

ALTER TABLE categories
  ADD COLUMN color_key TEXT,
  ADD CONSTRAINT categories_color_key_allowed CHECK (
    color_key IS NULL
    OR color_key IN ('blue', 'green', 'teal', 'amber', 'orange', 'red', 'pink', 'purple', 'indigo', 'slate')
    OR color_key ~ '^#[0-9a-f]{6}$'
  );

ALTER TABLE categories DROP CONSTRAINT categories_icon_key_allowed;
ALTER TABLE categories
  ADD CONSTRAINT categories_icon_key_allowed CHECK (
    icon_key IS NULL OR icon_key IN (
      'shopping-basket', 'utensils', 'car-front', 'house', 'briefcase-business', 'graduation-cap',
      'heart-pulse', 'gamepad-2', 'book-open', 'shopping-bag', 'gift', 'piggy-bank',
      'coffee', 'bus', 'receipt', 'smartphone', 'plane', 'wallet',
      'banknote', 'dumbbell', 'shirt', 'paw-print', 'music', 'wrench'
    )
  );

COMMIT;
