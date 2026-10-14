-- Stage 7A: database-level backstop for the manual-only recurring payment rule. Additive: one function and
-- one trigger; no table or row is rewritten.
--
-- Why: the only thing that can stop an OLD worker/API binary (which still auto-posts under the key
-- 'recurring:<itemId>:<dueDate>') is the database they share. A row whose idempotency key has that shape can
-- only be inserted by a transaction that has explicitly announced a user-confirmed payment with
-- set_config('app.recurring_confirmation','on', true) -- RecurringService.confirm does this and nothing else does.
--
-- Effect on an old binary: its INSERT fails (SQLSTATE P0001) instead of silently creating an expense. The old
-- worker then pauses that bill (its own catch block); resume paused bills after the old binary is removed.
-- This is a backstop, NOT a rollback strategy: running the old worker is still forbidden.
CREATE OR REPLACE FUNCTION guard_recurring_ledger_posting() RETURNS trigger AS $$
BEGIN
  IF NEW.idempotency_key LIKE 'recurring:%'
     AND COALESCE(current_setting('app.recurring_confirmation', true), '') <> 'on' THEN
    RAISE EXCEPTION 'recurring ledger entries can only be created by a user-confirmed payment'
      USING ERRCODE = 'P0001', HINT = 'RECURRING_AUTOPOST_BLOCKED';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_guard_recurring_posting
  BEFORE INSERT OR UPDATE OF idempotency_key ON transactions
  FOR EACH ROW EXECUTE FUNCTION guard_recurring_ledger_posting();
