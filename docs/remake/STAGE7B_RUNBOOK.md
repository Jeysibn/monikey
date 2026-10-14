# Stage 7B revised production runbook (REHEARSED ON SYNTHETIC DATA ONLY, NOT EXECUTED IN PRODUCTION)

Supersedes `STAGE7A_RUNBOOK.md` for sequencing. Every step below was rehearsed against disposable PostgreSQL 18.6 containers
with synthetic data (evidence in `docs/remake/stage7b/`). Nothing was run against production or the homelab.
Production-only items (off-host backup verification, real restore drill, real-data dry-run) are **NOT YET AUTHORIZED and NOT DONE**.

## Hard statements (unchanged, now evidenced)
- **Restoring or restarting an old auto-posting worker is never a rollback.** Rehearsal control run (no guard): the legacy worker (commit `2f8b119`) posted an expense, moved a balance, advanced two schedules and processed a bill with `autopay=false`.
- Stop every old worker/job/replica **before** migrating. The DB guards are a safety net, not a licence to leave one running.
- The kill switch `RECURRING_CONFIRMATIONS_DISABLED` stops confirmation only; it cannot stop an old binary.
- No script or step here rewrites historical balances, budgets or transactions.

## What the guards do to an OLD worker (rehearsed, `old-worker-compat.log`)
Two triggers (migrations `20261016000000_recurring_posting_guard`, `20261017000000_recurring_schedule_guard`):
1. `transactions_guard_recurring_posting` rejects any `recurring:*` ledger insert not issued by the new confirm path (`P0001 RECURRING_AUTOPOST_BLOCKED`).
2. `recurring_items_guard_schedule` rejects any change of `next_due_date` / `last_paid_date` not issued by the new API (`P0001 RECURRING_SCHEDULE_WRITE_BLOCKED`). **Stage 7B added this** after the rehearsal showed that with only guard 1 an old worker could still advance a schedule (Gym 09-10 -> 10-10, no payment) when a legacy ledger row for the cycle already existed.

Result with the old worker against the fully guarded DB: no ledger rows, no balance change, no schedule advance, nothing marked paid, `autopay=false` bills untouched in value.
**Side effect:** the old worker's error handler pauses any due bill it fails on (`status` active -> paused), including non-autopay bills. After the old workers are stopped, review paused bills and resume the ones the user did not pause (compare `updated_at` against the rollout window). The old worker also writes derived daily snapshots; these are not financial mutations.
**Old API compatibility:** an OLD API's "mark paid" or due-date edit now fails at the database (it surfaces as a 500 in the old UI). V3 and the new API are unaffected. Treat the legacy UI as read/ordinary-ledger-only for recurring bills after rollout.

## Rollout sequence (all rehearsed by `backend/scripts/rehearsal/`)
0. **Authorization gate.** Production steps need explicit approval (Stage 7C).
1. **Inventory & freeze.** List every worker process/container, cron/k8s CronJob and API replica with image tags. Entrypoint of the legacy worker is `node dist/worker.js` (`npm run start:worker`). Announce a write freeze.
2. **Backup.** `pg_dump -Fc` -> `pg_restore --list` integrity check -> encrypt (`openssl enc -aes-256-cbc -pbkdf2`, passphrase held outside the host and the repo) -> copy to an independently managed location -> verify sha256 there -> decrypt a copy and `cmp` against the original -> restore into a scratch database -> run `oracle.sql` on source and restore: outputs must be byte-identical. Rehearsed (`backup-restore.sh`): dump 0.18 s / 122 KB, restore 1.15 s. **Rehearsal used a local container as the "independent" location; that is NOT an off-host production backup.** Record the timestamp and server version with the backup.
3. **Stop all old workers and verify** (process list, container list, `pg_stat_activity` has no worker sessions, `worker_jobs` not advancing). Do this BEFORE step 4.
4. **Migrate** with `prisma migrate deploy` (four additive migrations since the legacy baseline; ~1 s on the synthetic set). If it fails mid-way see Recovery. Do not start any app on a DB whose `prisma migrate status` is not clean.
5. **Verify guards and financial identity**: both triggers present; `oracle.sql` output equals the pre-migration output (only new empty columns/tables and, if seeded, system categories differ). Run `scripts/legacy-dry-run.ts` (read-only) and review, do not normalize.
6. **Start the new manual-only worker** (reminders and snapshots only; verify no `source='recurring'` rows appear and balances are unchanged). **Then the new API, then the frontend.** V3 remains opt-in; legacy UI remains default.
7. **Smoke** (`smoke.ts`, 58 checks) and the oracle: every account `balanced`, expected deltas only.
8. **Resume**: lift the freeze, review/resume wrongly auto-paused bills, record outcomes.

## Emergency stop
1. `RECURRING_CONFIRMATIONS_DISABLED=true` + API restart (confirmation only).
2. Stop all worker/job containers and verify with the process list.
3. If anomalies persist, block writes at the proxy. The two triggers remain the last line of defence against stray posting or schedule movement.

## Recovery (failure-injection results, `failure-injection.log`, 0 failures)
| Failure point | Observed state | Action |
|---|---|---|
| Before migration | DB identical to the backup | Abandon; nothing to undo |
| During migration (3rd migration broken) | Migration 1-2 applied, 3 recorded failed and fully rolled back (no trigger); financial data untouched; `migrate status` blocks | Do not start apps. Restore the tested backup into a **fresh** database, re-run `migrate deploy` with the approved HEAD; oracle identical, both guards present |
| After migration, before API start | DB static (no writer); guards present | Start the API later; healthy |
| API only, no worker | Confirm, reports work; snapshots lag | Start the worker |
| Worker only, no API | No state change, no recurring posts | Start the API |
| Worker killed (`kill -9`) | Consistent, no stuck jobs | Restart; still cannot post |
| Backend terminated during recurring confirmation | Atomic: no ledger row, occurrence, balance or schedule change; client sees 500 | Retry the same confirmation: posts once; further retries replay |
Always recover to an approved compatible NEW app version. Never roll back to an old auto-posting worker.

### Restore-point limitation
A restore returns the database to the backup time. Every write after it is lost (F7: a bill confirmation and a Quick Add expense). Before restoring production-like data, export the list of ids/idempotency keys created since the backup from the damaged DB (if readable), and after restore diff against it (`comm` of `id|title|amount` lists); those items must be re-entered or replayed. Balances of the restored DB reconcile with the restore point (all accounts balanced) but not with real-world events after it.

## Offline and browser data (not covered by any PG backup)
The IndexedDB outbox lives in each user's browser. Only `create_transaction` (plus crypto activity and receipt capture) is replayed, through `POST /transactions` with the operation's idempotency key.
- **Committed before backup, tab still "pending":** replay returns the original transaction; no duplicate, balance unchanged.
- **Commit lost by a restore:** replay creates it exactly once; later replays return the same row.
- **Concurrent replays (two tabs / retry racing the original):** one row.
- **Replay after the transaction was reversed:** returns the original, never re-creates or re-applies it.
- **Changed payload under the same key:** the FIRST committed content wins; the edit is not applied (the client treats outbox payloads as immutable, so this should not occur; if a user edits a queued item, re-queue it under a new key).
- **Keys are per user:** another user or session cannot collide with or read them. A logged-out replay gets 401 and posts nothing, so the outbox keeps the operation until login.
- **`recurring:` key prefix** is reserved and cannot be forged from the outbox.
- A restore does not touch browsers: after a restore, users should open Sync Center and let pending items replay; items already in the restored DB replay as no-ops. Operations that failed or conflicted stay visible for review. Clearing site data or switching browsers loses un-synced operations permanently (no server copy). Recurring confirmations are not queued offline (they need the server) and are safe to retry.
Tests: `backend/test/integration/stage7b-offline-replay.db.test.ts` (8) and the existing frontend outbox/Sync Center tests.

## Recurring lifecycle (Stage 7B behaviour)
- Editing a bill's due date to a date on or before its latest settled (confirmed or skipped) cycle is refused with `409 RECURRING_SETTLED_CYCLE` and an explanation; nothing changes. A later date or an unchanged date is allowed, and the bill is never stuck.
- Confirm, skip or link on a cycle whose payment was reversed returns `409 RECURRING_PAYMENT_REVERSED` ("record the correct payment as a normal expense in Quick Add; the next cycle is not affected"). Occurrence, reversal and audit trail are kept; duplicates are impossible.
- **Not implemented (needs a data-model change; deliberately not done inside this migration):** re-paying the *same* reversed cycle. Design: add `recurring_occurrence_attempts` (occurrence_id, attempt_no, transaction_id, status confirmed|reversed|superseded). The occurrence row stays unique per (item, due_date) and points at the *current* attempt; a reversal marks its attempt `reversed` and, only on explicit user action ("record a corrected payment"), opens attempt n+1 with ledger key `recurring:<item>:<due>:<n>`; the guard trigger accepts the `:n` suffix only when set by the confirm path; at most one attempt may be `confirmed`; the schedule advances on the first confirmed attempt only; backfill creates attempt 1 from existing rows. Until then Quick Add is the supported correction path.

## Reconciliation checks (read-only)
`backend/scripts/rehearsal/oracle.sql` re-derives balances from transaction rows (reversal rows inverted), compares with stored balances and balance effects, and reports net position, income/expense by month (transfers, repayments, reversals excluded; card purchases once), category and budget spend, recurring ledger rows, and md5 hashes of every financial table. It uses only legacy-baseline columns, so the identical file runs before and after migration. `migration-validate.sh` lists applied migrations, new-column states, guards and constraint probes (rolled-back transactions on a clone).

## Related existing documents
`docs/Disaster-Recovery.md`, `docs/operations/restore-drill-2026-09-13.md`, `docs/operations/incidents-2026-09-13-worker-migration.md` (the worker did not run migrations; a worker CrashLoopBackOff on a missing `worker_jobs` table is the symptom of a skipped `migrate deploy`).
