# Stage 7C: production release readiness package (PLANNING ONLY - NOTHING IN THIS FILE HAS BEEN EXECUTED)

Branch `feature/monikey-v3-foundation-20261013`. No production, homelab, registry or GitOps access was used; no data was copied; no push, merge, image publish or deployment happened. Every command below is a **proposal for the operator to approve and run later**. Placeholders in `<angle brackets>` are unknown and must be filled in from the live system, never guessed.

Legend for authorization: **[A0]** safe read-only/local, already allowed; **[A1]** needs explicit approval to access production read-only; **[A2]** needs explicit approval to change production state; **[A3]** needs approval to change the GitOps repo / publish images.

---
## 1. Review of rehearsal evidence (Task 1)

### 1.1 Documentation vs implementation (checked in this stage)
| Claim in docs | Checked against | Result |
|---|---|---|
| Posting guard rejects `recurring:%` keys unless `app.recurring_confirmation='on'` (P0001 `RECURRING_AUTOPOST_BLOCKED`) | migration `20261016000000` | matches |
| Schedule guard rejects `next_due_date`/`last_paid_date` changes unless `app.recurring_schedule_write='on'` (P0001 `RECURRING_SCHEDULE_WRITE_BLOCKED`); pause/status not guarded | migration `20261017000000` | matches |
| Legacy worker (`2f8b119`) always posts under `recurring:<item>:<due>` and updates the schedule in the same loop, auto-pauses on any error | `git show 2f8b119:backend/src/modules/recurring/recurring.worker.ts` | matches: both guards cover its only write paths |
| Legacy API `POST /recurring/:id/mark-paid` also used the `recurring:` key | `2f8b119 recurring.routes.ts:66` | matches: refused by guards |
| Stage 7B runbook said a changed payload under one key keeps the first content | repository | **was a correctness gap; fixed in this stage** (see 4.5, commit `586ab23`) and the runbook corrected |
| Runtime image has no `npx`/Prisma CLI; migration needs the separate `monikey-migration` image | `docs/operations/deployment-contract.md` | consistent (and an external gap, section 2) |

### 1.2 Demonstrated with synthetic data (disposable PostgreSQL 18.6; evidence `docs/remake/stage7b/`)
Four additive migrations since the legacy baseline apply cleanly (~1 s); financial oracle byte-identical before migration, after restore and after migration (only 8 system categories added on the restored copy); encrypted backup/restore procedure incl. checksum and byte-identical decrypt; old worker posts/advances without guards and is fully neutralized (plus pauses due bills) with both guards; 7 failure points recover; 58 HTTP smoke checks, 86 + 86 real-backend browser tests (fresh and restored DB); offline replay idempotency.

### 1.3 NOT verified against real data
Real schema version and drift; real row counts and anomalies (drifted days, odd budget periods, legacy auto-posts, paused bills, archived references, favorites); real backup size/time, encryption keys, off-host destination, retention and restore time; the real worker/CronJob inventory; real image digests; Argo behaviour; TLS/ingress/cookie behaviour (known gaps below); performance on real volumes; real browsers' IndexedDB contents.

### 1.4 Known defects and limitations
See the defect register (section 11).

### 1.5 Recovery guarantees and limits
Guaranteed (synthetic): a tested backup restored into a fresh database reconciles exactly with the oracle; failed migrations recover by restore + re-migrate with an approved version; confirmation is atomic and retry-safe. Not guaranteed: writes after the restore point are lost (must be identified and replayed, section 8); no real RPO/RTO is known; an old application image is not a safe rollback target once the guards exist; browser-held outbox data is outside any database backup.

### 1.6 Conditions before production release
All blockers in section 12 PASS with **production** evidence, plus explicit user approval.

---
## 2. Production architecture and worker inventory plan (Task 2) - read-only, [A1]
Known (from `docs/operations/*`, last observed 2026-09-13, **re-verify**): K3s + Argo CD; GitOps repo `homelab-gitops` owns manifests; manifests used `:latest` for api/web/worker/migration; migration Job ran `npx prisma migrate deploy` in the runtime image (which has no npx); PostgreSQL declared `postgres:18-alpine`; HTTP-only ingress `monikey.homelab.local`, `NODE_ENV=development`, `SESSION_SECURE=false`; no backup CronJob seen. The operator should treat each as unverified until the commands below confirm it.

Information needed, with the read-only command for each (substitute `<ns>`, `<argo-ns>`, `<app>`; none have been run):
| Need | Command |
|---|---|
| Cluster/context sanity | `kubectl config current-context; kubectl get nodes -o wide` |
| Everything in the namespace | `kubectl -n <ns> get deploy,sts,ds,job,cronjob,pod,svc,ingress,pvc,cm -o wide` |
| API/worker Deployments, replicas, strategy | `kubectl -n <ns> get deploy -o custom-columns=NAME:.metadata.name,REPL:.spec.replicas,READY:.status.readyReplicas,STRAT:.spec.strategy.type` |
| Image tags AND resolved digests | `kubectl -n <ns> get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .status.containerStatuses[*]}{.image}{" "}{.imageID}{"\n"}{end}{end}'` |
| Worker entrypoints/args/env (look for `dist/worker.js`, any `node dist/...` scheduler) | `kubectl -n <ns> get deploy,cronjob,job -o yaml \| grep -nE 'image:\|command:\|args:\|schedule:\|suspend:\|replicas:'` |
| ALL CronJobs incl. suspended, and recent Jobs | `kubectl get cronjob -A -o wide; kubectl get job -A --sort-by=.metadata.creationTimestamp \| tail -30` |
| Other places a recurring poster could run (other namespaces, sidecars, docker/compose on hosts, systemd timers, local dev machines pointing at the prod DB) | `kubectl get pods -A -o wide \| grep -i monikey`; on each host: `docker ps -a \| grep -i monikey`; `systemctl list-timers --all \| grep -i monikey`; check DB sessions below |
| DB sessions per client (finds unknown workers) | `SELECT application_name, client_addr, usename, state, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2,3,4;` |
| Recurring execution path evidence | `SELECT status, count(*), max(updated_at) FROM recurring_items GROUP BY 1;` and `SELECT max(created_at) FROM transactions WHERE source='recurring';` (a recent value reveals a live auto-poster) |
| Job-runner state | `SELECT name,status,count(*),max(updated_at) FROM worker_jobs GROUP BY 1,2;` (table name per schema; confirm columns first with `\d worker_jobs`) |
| PostgreSQL instance/storage | `kubectl -n <ns> get sts,pvc,pv -o wide; kubectl -n <ns> describe pvc <pvc>`; `SHOW server_version; SHOW data_directory; SELECT pg_size_pretty(pg_database_size(current_database()));` |
| Current schema version | `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;` (expect 26 baseline migrations, none of the 4 new ones, no failed row) |
| Migration Job config | `kubectl -n <ns> get job -l app.kubernetes.io/name=monikey-migrate -o yaml` (image, command, backoffLimit, ttl, hook annotations) |
| Argo sync behaviour | `kubectl -n <argo-ns> get application <app> -o yaml` - read `spec.syncPolicy.automated.{prune,selfHeal}`, `syncOptions`, `source.targetRevision`, `status.sync`, `status.health`, `operationState`; also `argocd app history <app>` if the CLI is available |
| Secrets/config (**names and key lists only, never values**) | `kubectl -n <ns> get secret -o custom-columns=NAME:.metadata.name,KEYS:.data; kubectl -n <ns> get cm monikey-config -o yaml` (review `NODE_ENV`, `APP_ORIGIN`, `SESSION_SECURE`, `RECURRING_CONFIRMATIONS_DISABLED`, `PUBLIC_API_DOCS`) |
| Backup destinations/retention | `kubectl get cronjob -A \| grep -i -E 'backup\|dump\|pg'`; ask the owner where encrypted dumps go, who holds keys, retention, last successful restore |
| Existing rollback mechanism | `argocd app history`, `kubectl rollout history deploy/<name>`; note that **neither is a safe rollback for this release** (section 8) |
| Public edge | `curl -fsS https://<host>/api/v1/health/ready`; `curl -sSI https://<host>/` (TLS, HSTS, CSP) |
Record the output verbatim in a dated inventory file kept outside the repo until reviewed.

---
## 3. Final migration plan (Task 3) - operator procedure, NOT PERMISSION TO EXECUTE
Authorization column: A1 read-only prod access, A2 prod state change, A3 GitOps/registry change. Every A1/A2/A3 step needs separate written approval; **no step may be done on the strength of this document**.

| # | Step | Detail / verification | Auth |
|---|---|---|---|
| 0 | Preconditions | Section 12 items 1-7 PASS with production evidence; owners, communication channel, abort criteria, and the Stage 7C approval recorded | - |
| 1 | Maintenance window | Pick window with no scheduled bill due-dates the team cannot tolerate being late; announce; define who may abort | A2 |
| 2 | Prevent conflicting writes | Put ingress in maintenance (return 503 for `/api`), or scale API to 0 after step 3; confirm via access logs that no writes arrive; revoke ad-hoc DB write access | A2 |
| 3 | Identify old workers | Run every section-2 inventory command; list each deployment/cronjob/host process with image digest | A1 |
| 4 | Stop old workers and prevent recreation | Suspend Argo auto-sync/selfHeal for the app (or set the Application to manual) **first**, then scale the worker Deployment to 0 / suspend CronJobs / stop host containers (section 7 explains how not to be reconciled back) | A2 |
| 5 | Verify stopped | No worker pods; `pg_stat_activity` shows no worker client; `max(updated_at)` of `recurring_items` and `worker_jobs` stop moving for >= 2 scheduler intervals (the old worker ticks every 60 s - observe >= 3 min); record evidence | A1 |
| 6 | Consistent backup | `pg_dump -Fc --no-owner` of the whole database from a connection that sees a stable snapshot (writes are frozen; the dump itself is transactionally consistent). Record UTC timestamp, `SHOW server_version`, pg_dump version, byte size, `SELECT count(*)` of core tables, and the oracle hashes (section 6) | A1 |
| 7 | Encrypt, copy off-host | Encrypt (age or `openssl enc -aes-256-cbc -pbkdf2 -salt`), key stored in a separate secret store; copy to the independent destination; verify sha256 at the destination; record retention and who can read it | A1/A2 |
| 8 | Isolated restore | Restore the *off-host copy* (decrypt, `pg_restore --list` then `pg_restore`) into an isolated PostgreSQL of the same major version with no network path to production and no running app; record restore time | A1 |
| 9 | Real-data dry-run on the copy | `scripts/legacy-dry-run.ts` (SELECT-only, READ ONLY transaction) and `oracle.sql`, pointed at the isolated copy only; apply the section 9 audit queries | A1 (data access) |
| 10 | Review | Owner reviews every anomaly count and the financial totals; decide per anomaly: accept, document, or defer release. **No normalization or repair of history.** Stop here if any total is unexplained | decision |
| 11 | Rehearse on the real copy | On the isolated copy only: apply the 4 migrations, rerun oracle (must be identical besides new empty columns/tables), start API+worker from the candidate digests against the copy, run the smoke list (section 10) with a throwaway test user (no real-account posts) | A1 |
| 12 | Compatibility confirmation | Candidate API, worker and migration image digests all contain the same 4 migrations; `prisma migrate status` clean on the copy | - |
| 13 | Approval gate | User approves the exact digests, the window and the abort criteria in writing | decision |
| 14 | Apply migrations in production | Run the migration Job from the pinned `monikey-migration@sha256` image with workers still at 0; confirm `_prisma_migrations` has 4 new finished rows and both triggers (`transactions_guard_recurring_posting`, `recurring_items_guard_schedule`) exist; re-run oracle: identical to step 6 | A2/A3 |
| 15 | Start the new manual-only worker | Pinned digest, 1 replica; confirm logs show reminders/snapshots only; `count(*) FROM transactions WHERE source='recurring'` unchanged; balances unchanged | A2/A3 |
| 16 | Start the new API, then the frontend | Pinned digests; readiness `/api/v1/health/ready`; V3 stays opt-in, legacy UI default | A2/A3 |
| 17 | Reconcile and smoke | Oracle again (every account `balanced`, hashes equal to step 14); smoke checklist (section 10) read-only plus the authorized test steps | A1/A2 |
| 18 | Review paused bills | List `recurring_items` with `status='paused'` and `updated_at` inside the window; resume those the user did not pause (via the app, not SQL) | A2 |
| 19 | Restore access | Remove maintenance mode; re-enable Argo auto-sync only with the new pinned manifests and **no old worker definition**; notify users; keep monitoring | A2 |
| 20 | Close out | Archive evidence, the backup, and the inventory; record outcomes in the register | - |
Abort criteria (any step): unexplained financial difference; guard missing; a worker still active; migration failure; smoke failure. Aborting means section 8, never "start the old worker".

---
## 4. Critical financial safeguards review (Task 4)

### 4.1 Invariant
*No old worker or legacy API path can silently create expenses, advance recurring schedules, or alter balances contrary to the manual-confirmation model.* **Holds for every known legacy path** (analysis of `2f8b119` plus the Stage 7A/7B rehearsal): the only auto-posting insert uses a `recurring:` key and the only schedule writes are the worker's `UPDATE next_due_date, last_paid_date` and the old API's mark-paid/due-date edit; both guards reject them at the database, and balances change only through ledger inserts. Evidence: `old-worker-compat.log` (control vs guarded), `stage7a-recurring-safety` and `stage7b-lifecycle` integration tests.

**Residual risk (documented, not fixed):** the DB cannot stop an unknown binary that posts a recurring-style expense with a *different* idempotency key, or that edits balances with raw SQL. Mitigation: inventory and stop every writer (section 3), least-privilege DB credentials, and monitoring for `source='recurring'` rows without `recurring_occurrences`. A possible hardening (also guard `NEW.source='recurring'`) was considered and left out of this milestone because no known binary needs it.

### 4.2 Explicit documentation of the worker pausing bills
After a guard rejection the old worker's own catch block sets `recurring_items.status='paused'` for that bill, including bills with `autopay=false`. Pausing is intentionally not blocked (status is not a financial field). Operators must stop the old worker first; if it ran even briefly, bills due in that period are paused and must be reviewed (step 18). The old worker also writes derived daily snapshots (not financial).

### 4.3 Other safeguards reviewed
- *Cycle-specific idempotency:* ledger key `recurring:<item>:<due>` plus unique `recurring_occurrences(item, due_date)`; the confirm path locks the item row; replays return `replayed`; stale legacy keys reconcile to `reconciled_existing` without a second post (smoke + tests).
- *Concurrent posting:* per-key advisory lock in `postTransaction`, account row locks sorted by id; 6-way concurrent replay test posts once.
- *BIGINT:* money is `bigint`/minor-unit strings; Stage 7A tests cover bounds and the oracle recomputes sums in SQL `bigint`.
- *Atomic confirmation:* single DB transaction; F6 killed the backend mid-confirm: no ledger row/occurrence/balance/schedule change, retry posted once.
- *Skip and link:* skip writes an occurrence only (no ledger row) and advances the schedule; link attaches an existing expense, creates no new one, and refuses a reversed or already-linked transaction; both are idempotent on replay.
- *Reversal:* reversal rows are inverted in the oracle; reversed cycle payments return 409 `RECURRING_PAYMENT_REVERSED`; second reverse is `ALREADY_REVERSED`.
- *Historical compatibility:* legacy `source='recurring'` rows stay readable and count in spend once; they are never rewritten; no occurrence row is fabricated for them.

### 4.4 Authentication/isolation
Smoke covers bad password, missing Origin refusal, 401 when logged out, cross-user 404s. Not re-tested in 7C (reused).

### 4.5 Correctness problem found and fixed in this stage
`POST /transactions` with a reused idempotency key and a **different** body silently returned the first transaction (HTTP 2xx), so a client could believe its different request had been accepted. Now: when amount, type, fee, accounts, category or date differ the API returns **409 `IDEMPOTENCY_KEY_REUSED`** and posts nothing; identical or cosmetically different retries still replay the original; the reserved `recurring:` prefix keeps its own cycle semantics. The offline outbox classifies the message as a conflict (visible to the user, never marked synced). Test: `stage7b-offline-replay.db.test.ts`; full backend suite green (section 13). Commit `586ab23`.

---
## 5. Unresolved limitation: same-cycle repayment after a reversed recurring payment (Task 5)
Current behaviour: confirm/skip/link on that cycle -> 409 `RECURRING_PAYMENT_REVERSED`; occurrence, reversal and audit trail kept; the next cycle is unaffected.
- **Acceptable for initial release?** Yes, **P2 (not release-blocking)**, provided the user-facing message stays and the documented workaround is verified in smoke. Rationale: no money is lost or duplicated; the failure mode is a refusal, not wrong data.
- **Safe correction workflow today:** record the correct payment as a normal expense in Quick Add (category/account of the bill). It counts once in spend/budgets and balances; it is *not* linked to the cycle (the cycle shows closed, "no payment on record"). Known cosmetic gap: the bill history will not show the corrective expense against the cycle. Duplicate detection still flags near-matches for later cycles only.
- **Data-model change for a full fix:** a `recurring_occurrence_attempts` table (occurrence, attempt_no, transaction, status confirmed|reversed|superseded); occurrence stays unique per (item, due date) and points at the current attempt; reversal marks its attempt reversed; a *new, explicit* user action opens attempt n+1 with ledger key `recurring:<item>:<due>:<n>`; guard trigger accepts the suffix only from the confirm path; at most one `confirmed` attempt; backfill attempt 1 from existing occurrences.
- **Risk of changing occurrence history:** high - the posting guard keys, the unique constraint, reversal handling, legacy-key reconciliation, budgets/insights counting and the old-worker guard all depend on one-ledger-key-per-cycle. A mistake can double-post or hide a payment. Therefore not in this milestone; do not erase occurrences or add another posting path just to make the workflow pass. Requires its own migration, reconciliation tests and approval.

---
## 6. Database backup and recovery plan (Task 6) - unexecuted
**Unknowns (do not invent):** current RPO/RTO, real DB size, dump duration, backup storage location, encryption-key custody, retention policy, restore-drill history. The only known restore drill is `docs/operations/restore-drill-2026-09-13.md` (read it; it is not a Stage 7C certification). **The Stage 7B synthetic restore into a local container does NOT satisfy any production backup requirement.**

Measurable targets to be *filled by the owner* before release (candidate wording, not values): RPO = max tolerated data loss in minutes (for the release itself RPO is effectively zero because the pre-migration backup is taken inside a write freeze); RTO = max time to restore service; backup freshness <= `<n>` h; restore drill success within `<n>` min; every restore verified by oracle identity.

Procedure (placeholders `<...>`; run only after approval):
1. **Consistent backup** (writes frozen, section 3 step 6): `pg_dump -h <host> -U <backup_user> -d <db> -Fc --no-owner -f monikey-<UTC>.dump`; capture `SELECT now(), version();`.
2. **Integrity:** `pg_restore --list monikey-<UTC>.dump > toc.txt` (non-empty, entry count recorded); `sha256sum`.
3. **Encrypt:** `age -r <recipient> -o monikey-<UTC>.dump.age monikey-<UTC>.dump` (or openssl AES-256 + pbkdf2); key/passphrase in a different system than the backup; delete the plaintext after verification.
4. **Transfer off-host:** to `<independent destination>` (different failure domain than the K3s node/disk); verify sha256 at the destination from the destination side.
5. **Retention/access:** retention `<n>` days, immutable or versioned if available, read access restricted to named owners, access logged.
6. **Isolated restore:** fetch from the off-host copy (not the local file), decrypt, `createdb`, `pg_restore --no-owner --exit-on-error`, same PostgreSQL major version, no route to production.
7. **Schema/account reconciliation:** `_prisma_migrations` list equals production's; run `oracle.sql` on production (frozen) and on the restore: output must be byte-identical; every account `balanced`; counts of users/accounts/transactions equal.
8. **Failed deployment recovery:** section 8.
9. **Post-recovery-point writes:** before restoring over a damaged production, export `id|created_at|idempotency_key|title|amount_minor` of `transactions` (and bill occurrences) newer than the backup timestamp from the damaged DB if readable; after restore `comm` the lists (F7 method); the difference is the reconciliation list; notify affected users; replay only what is verified. Browser outboxes replay safely by idempotency key (runbook).
Evidence to retain: timestamps, versions, sizes, hashes, elapsed times, oracle outputs, reviewer name.

---
## 7. GitOps release strategy proposal (Task 7) - proposal only, no repo/registry/Argo action
1. **Images:** pin `ghcr.io/jeysibn/monikey-{api,web,migration}@sha256:<digest>` from a successful `publish.yaml` run of the reviewed `main` commit; the backend digest serves both API and worker. No `latest`, no SHA tags. (Today's manifests use `latest`: [A3] change required.) Image publish and the merge to `main` are separate approvals [A3].
2. **Ordering with Argo CD:** migration Job as a `PreSync` hook (or sync-wave `-1`) with `hook-delete-policy: BeforeHookCreation`, `backoffLimit: 0`, using the migration image (not `npx` in the runtime image). Wave 0: API; wave 1: worker; wave 2: web/ingress. The worker must not start before the migration completes.
3. **Old worker removal and no recreation:** the new worker Deployment must keep a distinct identity from anything old; remove old worker/CronJob manifests from the repo in the *same* change; with `automated.selfHeal=true` Argo would restore any manually scaled-down object, so before step 4 of section 3 switch the Application to **manual sync** (or disable `selfHeal`), and use `prune: true` only after review of the prune preview. After rollout verify no resource references an old image digest: `kubectl get pods,cronjob,job -A -o jsonpath=...imageID` grep for the old digest.
4. **Compatibility:** API, worker and migration are built from one backend context and carry the same 4 migrations; never run an old API/worker digest against a migrated DB (their writes to recurring bills fail by design).
5. **Probes:** API readiness `/api/v1/health/ready` (checks DB), liveness `/api/v1/health/live`; worker: startup log/`worker_jobs` heartbeat check; `maxUnavailable: 0`, `replicas: 1` for the worker (single poster of reminders).
6. **Manual sync gate:** Application `syncPolicy` without `automated` for this release; the operator presses sync only after each verification point; approval recorded per wave.
7. **Smoke after sync:** section 10 + `curl` readiness, security headers, `/docs` policy, oracle reconciliation.
8. **Emergency stop:** (a) `RECURRING_CONFIRMATIONS_DISABLED=true` and restart the API (confirmation only); (b) scale worker to 0 with Argo auto-sync off; (c) ingress maintenance 503; (d) leave both DB triggers in place. Never re-enable an old worker, including via "Argo rollback".
9. **Known external config gaps to be fixed by the deployment owner before certification** (from the 2026-09-13 audit; re-verify): HTTP-only ingress, `NODE_ENV=development`, `SESSION_SECURE=false`, HTTP `APP_ORIGIN`, no backup CronJob/off-host wiring, `latest` tags, migration Job using `npx`. Production cookies/sessions would be insecure until corrected.
10. Do **not** auto-roll the previous image tag on failure (Argo `rollback`, `kubectl rollout undo`): the previous worker image is the auto-poster.

---
## 8. Rollback and forward-recovery plan (Task 8)
General rule: stop the writers, preserve evidence, investigate, recover forward with an approved compatible version; restore only when data is wrong; never revert to an old app image (the old worker is unsafe, the old API cannot mark bills paid or edit due dates once the guards exist).
| Situation | Response |
|---|---|
| Migration failure | Do not start apps. `prisma migrate status`; a failed migration rolls back its own transaction (F2: guard absent, financial data untouched). Fix forward by a corrected migration image, or restore the verified backup to a *fresh* database and re-migrate. Old app image is not an option for a half-migrated schema |
| API startup failure | Keep worker at 0 and maintenance on; read logs/readiness; roll forward to a fixed digest; the DB is unchanged by a failing start |
| Worker startup failure | API can run without the worker (F5: confirmations/reports work; reminders and snapshots lag); fix forward; do not start any other worker |
| Reconciliation mismatch | Freeze writes; diff oracle output tables to find the account/transaction; classify (metadata vs financial); if financial and unexplained -> stop release, restore to a fresh DB for comparison, never edit balances by hand; follow section 6.9 |
| Unexpected recurring posting | Immediately scale every worker to 0, enable `RECURRING_CONFIRMATIONS_DISABLED`, list `source='recurring'` rows newer than the migration without an occurrence, identify the binary by `pg_stat_activity` client address and `application_name`; reverse wrongly posted expenses through the normal reversal API (preserves audit trail), do not delete rows |
| Authentication/session failure | Check `SESSION_SECURE`/`APP_ORIGIN`/cookie domain config (known external gap) and secrets; fix configuration forward; users keep data (sessions are separate from financial data) |
| Missing/incorrect financial records | Compare to the pre-migration backup via oracle diff and the F7 `comm` list; restore only into an isolated DB first; corrections are new ledger entries/reversals, never history rewrites |
| Lost offline operations | Outbox lives in browsers: ask users to open Sync Center, replay is idempotent; a changed payload under an old key is a 409 conflict to resolve; cleared site data = unrecoverable (tell users to re-enter) |
| Partial deployment | Stop at the current wave (manual sync); verify which digests are live; ensure no old worker; complete the remaining waves forward or enter maintenance; never partially scale an old image back |
Writes after the backup (when a restore is unavoidable): use 6.9; bills confirmed since the backup are in the list as `source='recurring'` transactions with `recurring:<item>:<due>` keys - re-confirm them in the app after restore (idempotent), not by SQL.

---
## 9. Production data audit checklist (Task 9) - read-only, [A1], run only on an **isolated restored copy**
Use `oracle.sql` (all hashes, per-account balance equality) and `legacy-dry-run.ts`, plus:
| Area | Query/check | Expected / action |
|---|---|---|
| Schema prerequisites | `_prisma_migrations`: 26 baseline rows, none failed; PostgreSQL major version | else stop |
| Accounts/cards | stored balance vs `opening + sum(effects)`; card debt sign; `liquid - card debt` | equal; any mismatch is a stop |
| Transaction counts/IDs | counts per user/type/month and an `md5(string_agg(id order by id))` | recorded baseline for step 17 |
| Reversals | originals with `reversed_transaction_id` have a reciprocal row; pairs net to zero | list exceptions |
| Legacy auto-posts | `source='recurring'` and key `recurring:%` without occurrence | expected (legacy); count recorded, never backfilled |
| Paused recurring | `status<>'active'` with `updated_at` | owner decides which were auto-paused by an old worker |
| Month-end/anchor | monthly items with day 28-30 and null `anchor_day` (drift) | informational; fixed only by user edit |
| Stale cycles | max legacy-key date >= `next_due_date` | informational; confirm reconciles |
| Budget periods | end<start, not month-aligned, overlapping | informational; **no repair** |
| Categories | active bills on archived categories; null/foreign-user references (FK + `user_id` equality) | list |
| Archived accounts | active bills on archived accounts; favorites on archived accounts | list |
| Favorites | rank outside 1-4, duplicate rank per user, rank on archived account (the migration adds a check and unique index) | **must be 0 before migration or the constraint rejects**; otherwise decide handling |
| Duplicates | duplicate `(user_id, idempotency_key)` | must be 0 |
| Snapshots | gaps and net-worth inconsistencies | informational |
No query writes. Do not copy production data to a laptop or CI.

---
## 10. Final functional smoke checklist (Task 10)
Use a **dedicated throwaway user created for the release** (and, if approved, its own throwaway accounts). Read-only checks on real accounts need approval [A1]; **posting into real accounts is forbidden without separate authorization [A2]**. Expected figures for the synthetic dataset are in `smoke.ts`; in production, record the pre-change numbers and expect them unchanged.
1. **Login/session:** login, reload keeps the session, logout, wrong password is refused, no mutation without a session.
2. **Overview/Insights:** net position = liquid assets - card debt; income/expense exclude transfers, card repayments and reversals; card purchases count once; compare with oracle values.
3. **Activity:** history paginates with no overlap; filters (type, account, category, text) work; reversal rows visible.
4. **Accounts/favorites:** balances equal the oracle; set/clear favorites (max 4, no archived); [throwaway user only].
5. **Expense/income:** (throwaway) balance moves by exactly the amount; replay with the same key returns one row; same key + different amount -> 409.
6. **Transfer/card repayment:** (throwaway) balances move, income/expense totals do not.
7. **Planning/budgets:** category spend equals the oracle for the month.
8. **Recurring confirmation:** (throwaway bill) confirm once = one expense + schedule advances one cycle; repeat = replay; paused/not-due/archived-category refused with an explanation; reversed cycle -> 409 explanation.
9. **Skip Cycle:** no expense created; schedule advances; repeat is a no-op.
10. **Duplicate detection:** an existing matching expense yields the "may already be recorded" prompt and Link attaches it without a new expense.
11. **Sync Center:** offline then online replay creates one transaction; a conflict is visible and not marked synced.
12. **V3 opt-in / legacy:** legacy UI loads by default; V3 only after opt-in; legacy compatible pages (accounts, transactions) still work; legacy mark-paid/due-date edit is expected to fail (documented).
Then run oracle: every account balanced; hashes unchanged apart from authorized test rows.

---
## 11. Final defect register
| ID | Sev | Defect/limitation | Status |
|---|---|---|---|
| D1 | P1 | Old worker could advance a schedule when a legacy ledger row existed | **Fixed** (7B, migration `20261017000000`), tested |
| D2 | P1 | Idempotency key reuse with a different payload was silently accepted | **Fixed** (7C `586ab23`), tested |
| D3 | P2 | Same-cycle repay after reversing a bill payment unsupported (409, Quick Add workaround) | Open, accepted for initial release; design in section 5 |
| D4 | P2 | Old worker pauses due bills (incl. non-autopay) after guard rejection | Open, documented; operational step 18 |
| D5 | P2 | Old API mark-paid/due-date edit fails at DB (500 in old UI) after migration | Open, documented, intended |
| D6 | P2 | DB cannot stop an unknown binary posting recurring-style rows with other keys | Open, mitigated by inventory/least privilege (4.1) |
| D7 | P2 | Legacy rows with null `anchor_day` stay day-drifted until the user edits | Open, accepted |
| D8 | P2 | Duplicate-payment heuristic approximate | Open, accepted |
| D9 | P2 | Un-synced offline operations are lost if browser data is cleared | Open, inherent; user guidance |
| D10 | P2 | Legacy-shell Settings/Security issue (carried from 7A) | Open, non-blocking |
| D11 | **P1 (external, unverified)** | GitOps: `latest` tags, `npx` migration Job on runtime image, HTTP ingress, `NODE_ENV=development`, `SESSION_SECURE=false`, no backup CronJob (2026-09-13 audit) | **Release-blocking until re-verified/fixed by the deployment owner** |
| D12 | P1 (process) | No verified off-host backup, restore drill or real-data dry-run | Release-blocking, NOT TESTED |
| D13 | P3 | Rate-limit/lint warnings pre-existing; no change | Accepted |
No P0 known. P1 items D1 and D2 are fixed; D11 and D12 block release.

---
## 12. Release gate checklist (truthful statuses)
Status values: PASS / FAIL / NOT TESTED. **Synthetic results are never used for production-only items.**
| # | Gate (production blocker) | Status | Evidence / note |
|---|---|---|---|
| 1 | Verified off-host backup | **NOT TESTED** | Only a local synthetic container was used |
| 2 | Successful restore of a production backup to isolated infrastructure | **NOT TESTED** | Synthetic restore passed (not production) |
| 3 | Reviewed real-data legacy dry-run | **NOT TESTED** | Fixtures only |
| 4 | Complete old-worker inventory | **NOT TESTED** | Checklist ready (section 2) |
| 5 | Verified old-worker shutdown | **NOT TESTED** | Procedure rehearsed on disposable DBs only |
| 6 | Confirmed migration compatibility | **NOT TESTED** on production schema | PASS on synthetic baseline |
| 7 | No unresolved P0/P1 release-blocking defects | **FAIL** | D11 and D12 open (code-level P1s D1, D2 fixed) |
| 8 | Reconciled financial balances and histories | **NOT TESTED** on real data | PASS synthetic |
| 9 | Successful post-migration smoke tests | **NOT TESTED** in production | PASS synthetic (58 HTTP + 172 browser) |
| 10 | Approved GitOps rollout plan | **NOT TESTED** | Proposal in section 7; GitOps repo not inspected/changed |
| 11 | Explicit user approval | **NOT TESTED** | Not requested for execution |
Supporting (non-blocking, code-level, synthetic): migration rehearsal PASS; recurring-cycle correctness PASS; failure injection PASS; offline replay PASS; full automated suites PASS (section 13).

---
## 13. Verification in this stage
Changed code: idempotency conflict (`ledger.repository.ts`, `appError.ts`, one test). Full backend suite re-run on a fresh disposable PostgreSQL after the change; other results reused from Stage 7B (the frontend and browser code is unchanged since then, except it consumes the existing 409 path); see `EXECUTION_PLAN.md` section 18 for exact counts and which are reused.

## 14. Recommendation (Task 12)
**GO to request separate production-READ-ONLY-access approval** (gate items 3, 4, 5 and the section 2 inventory need it) and approval to create the off-host backup and isolated restore. **NO-GO for any production change, migration or deployment**: gates 1-11 are not satisfied, D11/D12 are open, and no release approval exists. Next steps in order: (1) deployment owner fixes/verifies the external GitOps gaps (D11) in their repo; (2) user approves read-only inventory (section 2); (3) off-host backup + isolated restore + real-data dry-run; (4) review; (5) a separate approval to execute section 3.
