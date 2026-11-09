-- Add category lifecycle metadata without changing existing category IDs or ledger rows.
-- Take and verify a backup before applying this migration to an existing database.
BEGIN;

ALTER TABLE categories
  ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT categories_name_not_blank CHECK (name ~ '[^[:space:]]'),
  ADD CONSTRAINT categories_name_trimmed CHECK (name !~ '^[[:space:]]|[[:space:]]$');

-- Case-insensitive, whitespace-normalized uniqueness applies to both active and archived rows.
-- Keeping archived names reserved avoids ambiguous restoration and historical labels.
CREATE UNIQUE INDEX idx_categories_normalized_name_type
  ON categories (
    type,
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );

-- Category type determines whether a transaction is income or expense; changing it would
-- rewrite financial meaning without changing any transaction rows.
CREATE FUNCTION prevent_category_type_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Category type is immutable.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'categories_type_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_type_immutable
  BEFORE UPDATE OF type ON categories
  FOR EACH ROW
  EXECUTE FUNCTION prevent_category_type_change();

-- Keep older API builds fail-closed during an application rollback after a category
-- has been archived. Retaining the same category ID on an existing row is allowed.
CREATE FUNCTION prevent_new_archived_category_transactions() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_archived BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.category_id = OLD.category_id THEN
    RETURN NEW;
  END IF;

  SELECT is_archived INTO category_archived
  FROM categories
  WHERE id = NEW.category_id
  FOR SHARE;

  IF category_archived IS NULL THEN
    RAISE EXCEPTION 'Category does not exist.'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'transactions_category_id_fkey';
  END IF;
  IF category_archived THEN
    RAISE EXCEPTION 'Archived categories cannot be assigned to new transactions.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'transactions_active_category_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_archived_category_guard
  BEFORE INSERT OR UPDATE OF category_id ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_new_archived_category_transactions();

COMMIT;
