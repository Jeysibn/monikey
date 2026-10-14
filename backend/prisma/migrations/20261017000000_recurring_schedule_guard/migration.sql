-- Stage 7B: schedule backstop for the manual-only recurring rule. Additive: one function and one trigger.
--
-- Found by the Stage 7B old-worker rehearsal: with only the posting guard (20261016000000) the legacy worker could
-- still ADVANCE a bill's next_due_date when a legacy ledger row already existed for the cycle (its idempotent
-- replay succeeded, so it moved the schedule on without any payment). Changing next_due_date or last_paid_date
-- therefore now requires the transaction to announce a user-driven schedule change with
-- set_config('app.recurring_schedule_write','on', true). The new API sets it for confirm / skip / link and for a
-- user editing the due date; nothing else does.
--
-- Effect on an old worker: its schedule UPDATE fails (SQLSTATE P0001, HINT RECURRING_SCHEDULE_WRITE_BLOCKED) and,
-- as before, its own catch block pauses that bill. Resume paused bills after the old binary is removed.
-- An old API binary editing a due date or using mark-paid is refused the same way. This is a backstop, NOT a
-- rollback strategy: old workers must still be stopped.
CREATE OR REPLACE FUNCTION guard_recurring_schedule_write() RETURNS trigger AS $$
BEGIN
  IF (NEW.next_due_date IS DISTINCT FROM OLD.next_due_date OR NEW.last_paid_date IS DISTINCT FROM OLD.last_paid_date)
     AND COALESCE(current_setting('app.recurring_schedule_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'a recurring bill schedule can only change through a user-driven confirm, skip, link or edit'
      USING ERRCODE = 'P0001', HINT = 'RECURRING_SCHEDULE_WRITE_BLOCKED';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER recurring_items_guard_schedule
  BEFORE UPDATE OF next_due_date, last_paid_date ON recurring_items
  FOR EACH ROW EXECUTE FUNCTION guard_recurring_schedule_write();
