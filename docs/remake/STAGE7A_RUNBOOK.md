# Stage 7A deployment and rollback runbook (PREPARED, NOT EXECUTED)

Nothing in this document has been run against production or the homelab. Rehearse only in an isolated environment.

## Hard statements
- **Reverting to an old auto-posting worker is not a safe rollback strategy.**
- **The kill switch (`RECURRING_CONFIRMATIONS_DISABLED`) controls confirmation only and cannot protect against old worker binaries.**
- **An old worker must still be stopped during rollout, even with database-level safeguards.**
- The migration `20261016000000_recurring_posting_guard` installs a trigger that rejects any `recurring:*` idempotency key unless the new confirm path sets `app.recurring_confirmation`. Rejected old-worker posts raise `P0001 / RECURRING_AUTOPOST_BLOCKED`. The old worker's error handler then **auto-pauses the bill**: after the old worker is stopped, review paused bills and resume the ones the user did not pause.
- Default `RECURRING_CONFIRMATIONS_DISABLED=false`. The new worker has no posting switch: it only sends reminders.

## Sequence (rehearsal first)
1. **Inventory** every old recurring worker, scheduled job (cron, compose services, k8s CronJobs) and API replica. Record image tags.
2. **Write control and backup.** Define a maintenance window / write freeze. Take a backup stored **off-host** and verify a restore into a scratch database (row counts and balance totals match).
3. **Stop all old auto-posting workers and verify inactive** (process/container list, no recurring jobs in `worker_jobs` advancing) BEFORE any migration or rollout.
4. **Validate migration compatibility** with old and new API versions: the guard migration adds only a function and trigger (no column or enum change); old Prisma clients keep working for normal transactions.
5. **Apply migrations only in the isolated rehearsal environment** (`prisma migrate deploy` against a disposable copy). Production application is a separate, explicitly approved step.
6. **Start the new manual-only worker**; confirm it cannot post (no `source='recurring'` rows appear; reminders only).
7. **Start the new API and the frontend** in rehearsal (V3 remains opt-in, legacy default).
8. **Smoke tests:** register/login; Quick Add expense, income, transfer, card payment; confirm a bill once (replay returns the same transaction); skip a cycle (no ledger row); run `scripts/legacy-dry-run.ts` (read-only) and the reconciliation queries below.
9. **Resume normal operations:** lift the write freeze, re-enable monitoring, resume wrongly auto-paused bills, record outcomes.

## Emergency stop
1. Set `RECURRING_CONFIRMATIONS_DISABLED=true` and restart the API (stops confirmation only).
2. Stop every worker/job container; verify with the process list.
3. If posting anomalies persist, enter maintenance (block writes at the proxy). The DB trigger remains the last line of defence against stray auto-posting.

## Rollback
- Roll the API/frontend back to the previous image if needed; **never** restart the old recurring worker. Leave the guard trigger in place (it is harmless to old API versions).
- Data is never rewritten: no balance or budget history repair.

## Reconciliation checks (read-only)
- Per account: `current_balance_minor = opening_balance_minor + sum(transaction_balance_effects.delta_minor)`.
- `SELECT … FROM transactions WHERE source='recurring'` lacking a `recurring_occurrences` row (legacy auto-posts).
- Duplicate `(user_id, idempotency_key)` must be zero.
- Net position = liquid assets − card liabilities; transfers/card repayments excluded from income/expense.
- `backend/scripts/legacy-dry-run.ts` covers favorites, archived refs, budget periods, drifted due dates, paused bills and snapshots. The offline outbox is client-side (IndexedDB) and cannot be seen from SQL.

## Balance-adjustment feature (design only, not implemented)
Recommendation: **not launch-required** (users can post income/expense/transfer). If added: a distinct `adjustment` transaction type with its own balance-effect role, reason + actor required, idempotency key, excluded from income/expense/budget/insights totals, reversible only by a compensating adjustment, never a direct balance overwrite.
Tests outline: adjustment changes balance exactly by delta and writes a balance effect; excluded from spend/income/budgets/safeToSpend; idempotent replay; concurrent same key posts once; BIGINT bounds; reconciliation oracle still matches; archived-account rejected; audit fields mandatory.
