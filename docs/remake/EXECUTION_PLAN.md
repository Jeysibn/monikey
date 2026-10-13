# MoniKey V3 Remake — Execution Plan

Status: Milestone 1 (preflight + dormant dock tests). Source of truth for scope is the approved
MVP/UX spec v1.1 and Phase 1 audit (Codex handoff pack, 2026-10-13); where a mockup and the
written spec disagree, the written spec wins. Nothing here authorizes production access,
destructive migrations, GitOps edits, merges to `main`, or deployment.

## 1. Verified baseline (2026-10-14)

| Item | Finding |
|---|---|
| Branch | `feature/monikey-v3-foundation-20261013`, tracks `origin/...`; contains `origin/main` (`72f45c6`). |
| Branch delta vs main | `frontend/src/components/V3Dock.tsx`, `V3Dock.css` only (2 commits). |
| `origin/dev` | `5ab2644` — 3 commits behind `origin/main` (G3 still open; reconcile in a separate operation). |
| Local `main` | Stale (`3ecda80`); always compare against `origin/main`. |
| V3Dock mounted? | No. Enforced by a test that fails if any other source file references `V3Dock`. |
| Repo `AGENTS.md` | Absent (template exists in handoff pack; not added in this milestone). |

## 2. Existing-code findings

**Routes** (`frontend/src/App.tsx`): `/`, `/transactions`, `/accounts`, `/budget`, `/goals`, `/recurring`,
`/rules`, `/reconciliation`, `/imports`, `/security`, `/tags`, `/reports`, `/crypto`, `/settings`, `/sync`,
`/investments` → `/crypto`. No `/activity` or `/planning` yet.

**Ledger**: Prisma `BigInt` minor-unit columns (`currentBalanceMinor`, `amountMinor`, …); API transports
minor units as strings. `LedgerRepository.postTransaction` honours per-user `idempotencyKey`. Tests:
`backend/test/integration/ledger.db.test.ts`, `unit/ledgerService.test.ts`, `e2e/finance-contract.spec.ts`.
Frontend selectors (`state/financeSelectors.ts`) mix BigInt with some `Math.round(x * 100)` fallbacks
for legacy numeric fields — flag for Stage 2 review. No balance-adjustment event exists (G6 gap).

**Offline outbox / recovery**: `localFirstStore` (IndexedDB) statuses `pending|syncing|synced|failed|conflict`;
`outboxSync.syncPendingOutbox` replays only `create_transaction`, `crypto_activity`, `capture_receipt`;
other types are marked failed. Conflicts are detected by regex on the error message
(`/conflict|duplicate|idempotency/i`) — fragile. `pages/SyncCenter.tsx` (`/sync`) is the only retry/discard UI,
so it must stay reachable (G5). `docs/product/pwa.md` ("online-only writes") contradicts source.

**Recurring bills — blocker for Stage 6 (G4)**: `backend/src/modules/recurring/recurring.worker.ts`
selects every `status: 'active'` item with `nextDueDate <= today` and posts an expense, **without
filtering on `autopay`**; `worker.ts` invokes it per user. So today a due date alone posts a transaction,
which violates the spec invariant "due date alone never posts". The manual `POST /recurring/:id/mark-paid`
uses the same idempotency key (`recurring:<id>:<dueDate>`), so worker and manual paths dedupe against
each other. The UI labels autopay as "charged automatically", implying non-autopay items should not post.
Needs an explicit product decision (see Risks) before any change; not touched in M1.

**Tests present**: frontend 27 Vitest files; 11 Playwright specs (`navigation`, `finance-contract`,
`offline-compose`, `recurring-reports`, `backend-compose`, …); backend unit + `*.db.test.ts` integration
(`recurring.db.test.ts`, `ledger.db.test.ts`, `budget.db.test.ts`, …) needing PostgreSQL.

## 3. Milestones and acceptance criteria

Each stage = one reviewable (draft) PR into a branch based on current `origin/main`. Never auto-merge.

| # | Scope | Acceptance criteria | Commands |
|---|---|---|---|
| 0/M1 | Preflight, this plan, V3Dock unit tests | Dock tests pass; dock unreferenced; app behaviour unchanged | `npm run lint:frontend`, `typecheck`, `test:frontend`, `build:frontend` |
| 1 | Tokens, responsive dock, shell scaffold behind flag | Old routes untouched; screenshots at 390/768/1280/1440; keyboard, focus, reduced-motion, ≥48px mobile targets, contrast checked in browser | frontend suite + `test:e2e:mock` |
| 2 (done, see §6) | Ledger characterization tests | Backend tests for expense, income, transfer, card charge, card repayment, idempotency, budget exclusion; no production code changes | `test:backend` on isolated PostgreSQL |
| 3 | Account-first Overview + Insights | Four favorites; 3-column desktop; liquid / card owed / net position distinct from `safeToSpend`; no fabricated history | frontend + mock e2e + backend-mode e2e |
| 4 | Activity + Accounts | Inline expansion, account-filtered Activity, edit/reversal preserved | same |
| 5 | Quick Add + Quick Picks | Required-field validation, no double submit, queued state never shown as saved | same + `offline-compose` |
| 6 | Planning (budgets, recurring) | Resolve worker auto-post decision; confirmation posts once; budgets exclude transfers/repayments/adjustments | backend integration + e2e |
| 7 | Auditable balance adjustment | Additive migration only; reason + audit; excluded from expense/budget | backend db tests |
| 8 | Route retirement + recovery UX | Legacy redirects; `/sync` recovery reachable; export/security kept; no data deleted | e2e route audit |
| 9 | Staging, restore drill, release request | G1–G8 cleared; owner approval; GitOps handled separately | real-backend e2e |

## 4. Risks and open decisions

1. **Worker auto-posts all due recurring items** (above). Options: (a) filter worker to `autopay = true` and make non-autopay manual-only; (b) keep as is and relabel. Need owner decision; (a) changes live behaviour and needs backfill thinking for items already auto-posted.
2. **`dev` behind `main`** — reconcile separately (G3).
3. **Backups/restore/GitOps state unverified** (G1, G2); out of scope for Codex-style work here.
4. **Sync Center is the only recovery UI** — cannot hide `/sync` until Settings > Pending Operations parity exists (G5). Conflict detection by message regex should be characterized before relying on it.
5. **Balance adjustments do not exist** (G6); schema extension needs design review.
6. **Doc drift**: `pwa.md` vs offline source; update after verification.
7. **Money in selectors**: floating-point fallbacks in `financeSelectors.ts` need characterization before Stage 3 reuse.
8. **Multi-currency**: non-PHP records must not be silently summed.
9. Dock CSS currently hardcodes tokens (`#0866d9`) and uses Manrope; tokenization is Stage 1.

## 5. Out of scope until separately approved

Production/staging access, GitOps repo, schema changes, deletion or hiding of dormant data, merges, deployment.

## 6. Stage 2 results — ledger characterization (2026-10-14)

**Test environment.** Disposable `postgres:18-alpine` container (`monikey-stage2-testdb`, bound to
127.0.0.1 only, `--rm`), database `monikey_stage2_test`; `prisma migrate deploy` + system seed applied; the
new suite refuses to run unless `current_database()` matches `/test/i`. No production or homelab
connection was made. Run with `DATABASE_URL`/`TEST_DATABASE_URL` pointing at it:
`npm run test:backend` (or `npx vitest run test/integration/stage2-ledger-characterization.db.test.ts`).

**Results.** New file `backend/test/integration/stage2-ledger-characterization.db.test.ts`: 33 tests pass
(stable over repeated runs). Full backend suite: 55 files / 415 tests pass; baseline before the new file
was 54 / 382. Frontend build passes after `npm ci --prefix frontend` (lockfile unchanged); frontend
Vitest 278 pass. Not run: Playwright, real-API browser e2e.

**Verified-correct behaviour (matches V3 spec).** Expense/income balance effects and ledger-sum
consistency; transfers (incl. fee) are zero income/expense/budget; card purchase = liability + one expense;
card repayment lowers cash and owed with no expense; overpay/overdraft/credit-limit/zero-balance guards;
idempotency (retry, cross-user keys, concurrent same key → one row); reversal restores balances and is
single-use; budget actuals exclude pending, other categories, transfers; BigInt exactness above 2^53;
cross-user account/category access rejected (404).

### Existing behaviours that CONFLICT with the V3 spec (each pinned by a `V3 CONFLICT` test)

| ID | Behaviour today | Spec requirement | Severity |
|---|---|---|---|
| C1 | Recurring worker posts every due `active` item, ignoring `autopay`, and catches up one missed cycle per run | Due date alone never posts; manual confirmation only | High |
| C2 | `mark-paid` takes no body: amount/account/date cannot be confirmed or corrected | Confirm actual amount, account, date | High |
| C3 | `mark-paid` has no due check, so future bills can be pre-paid and repeated clicks pay successive cycles | Confirm exactly the due occurrence | Medium |
| C4 | After the worker posts a cycle, `mark-paid` pays the *next* cycle early | No double-posting | High |
| C5 | A manually entered payment is not matched, so confirming the bill posts it again | Do not duplicate a manual payment | High |
| C6 | Reversal creates a compensating transaction of the same type (`expense`, cleared, positive amount, dated *today*); budgets/reports sum it as another expense, so a reversed expense counts twice | Reversal must net out of spending/budgets | **High (financial)** — fixed in Stage 2b (§7) |
| C7 | `POST /budgets` shifts a date-only period one day early (stored `2026-08-31`..`2026-09-29` for Sep 1–30): Aug 31 spend is counted, Sep 30 spend is missed | Month boundaries follow the user's local calendar | **High (financial)** — fixed in Stage 2b (§7) |
| C8 | `/reports/budget-performance` returns 404 for a budget created through the API for that month (consequence of C7) | Truthful budget vs actual | Medium — fixed in Stage 2b (§7) |
| C9 | Concurrent duplicate `mark-paid` calls: one 201, the rest 500 `INTERNAL_ERROR` (no double post) | Idempotent replay | Low |
| C10 | `mark-paid` posts, then updates the schedule in separate steps (not one DB transaction); a crash between them leaves the cycle posted but still due, and the next click replays safely via the idempotency key | Atomic confirmation | Medium |
| C11 | No balance-adjustment event type exists (unchanged from M1) | Auditable adjustments | Gap |

C6 and C7 are not recurring-specific and affect existing users' budget/report numbers today; they should be
triaged independently of the V3 UI work.

### Worker ↔ `mark-paid` interaction (verified)

Both use the idempotency key `recurring:<itemId>:<dueDate>`, so racing for the same cycle posts once.
They do not coordinate on the schedule: the schedule is advanced by whichever finishes, computed from the
row each read earlier, so the same-cycle race converges (asserted). The unsafe interleaving is
sequential, not concurrent (C4).

### Proposed smallest safe correction (Stage 6, not implemented)

1. Worker: stop posting. Replace with a read-only "due" state (items with `nextDueDate <= today`), and
   leave posting to confirmation. Keep `autopay` column untouched (no schema change) and decide its fate
   separately; until then ignore it in the V3 UI. Behind an env flag defaulting to the old behaviour so
   rollout is reversible.
2. `mark-paid` → confirm endpoint accepting `{ amountMinor?, accountId?, paidOn? }` defaulting to the
   schedule; reject when `nextDueDate` is in the future beyond a configurable horizon; keep idempotency
   key `recurring:<id>:<dueDate>` for the due occurrence regardless of overrides.
3. Run post + schedule advance inside one `prisma.$transaction` via the existing ledger service seam.
4. Map the idempotency-race unique violation to an idempotent replay (fixes C9).
5. Optional duplicate guard: warn (not block) when a same-account, same-amount expense exists within ±3 days.
6. Existing data: do not rewrite already auto-posted history. Items that were auto-posted keep their ledger rows.

Tests to rewrite with that change: every `V3 CONFLICT` recurring test (C1–C5, C9, C10).

### Recommended next milestone

Because C6 and C7 misstate budget and report totals for existing data, propose **Stage 2b: fix C7 then
C6 with failing-test-first changes** (date-boundary storage for budget periods; exclude reversed/reversal
pairs from spend aggregation), each as its own small PR with owner sign-off, **before** the V3 visual
work. If you prefer to keep Stage 2 strictly characterization-only, go to Stage 1 (tokens + dock behind a
flag) next and track C6/C7 as parallel bug fixes.


## 7. Stage 2b results — financial reporting corrections (2026-10-14)

Two local commits on `feature/monikey-v3-foundation-20261013` (not pushed): Task A `8624caf`, Task B `921c143`.
No schema change, no ledger/balance-effect change, recurring worker untouched, no production data touched.

### C7/C8 — root cause and change (Task A)
`budget_periods.period_start/end`, `transactions.occurred_on` and `daily_finance_snapshots.snapshot_date` are
`@db.Date` (calendar dates). `POST /budgets` and `/reports/summary` / `/reports/budget-performance` converted
local dates into timezone **instants** (`getUTCDateForLocalDateTime`) and Prisma truncated them to their UTC
date, which is one day early for UTC+ users (Asia/Manila stored `2026-08-31`..`2026-09-29` for Sep 1–30;
`/reports/summary` for September included Aug 31). The budget-performance lookup then required
`periodStart <= Sep 1 && periodEnd >= Sep 30`, so API-created budgets 404'd.
Contract now: a period is a pair of calendar dates, **inclusive end**, stored literally (UTC midnight of the
submitted date); report boundaries are calendar dates (end = day before the next period). Changes:
`budget.routes.ts` (literal storage), `reports.routes.ts` (calendar boundaries), frontend
`resolveCurrentBudgetPeriod` (sends last day of month instead of first of next month) and
`projectPeriodEndSpend` (inclusive end). Existing rows are not rewritten.

### C6 — root cause and change (Task B)
Reversal posts a same-type compensating transaction and links the pair via `reversedTransactionId`; every
income/expense aggregation counted both rows. New shared predicate `excludeReversalPairs`
(`ledger/reportingSemantics.ts`, `reversedTransactionId: null`) is applied to budget actuals, report summary,
cash-flow, spending by category/tag, budget performance, AI insights context and the weekly-summary email.
Both rows stay in the ledger; balance effects, reconciliation and card-debt/net-worth calcs are unchanged
(they read balance effects/snapshots, which already net to zero). Income reversals use the same predicate.
A genuine refund is an independent `income` row without `reversedTransactionId`, so it is still reported
(tested). Cross-month reversals net out in the original month and add nothing in the reversal month (tested).
Note: a reversed transaction is excluded from the report even if the user considers a reversal a
"correction" dated today — by design.

### Test results
- Before fix (new failing-first tests): 15 failed in the Stage 2 file for Task A (C7/C8 across Asia/Manila,
  UTC, America/Los_Angeles, Pacific/Auckland), 3 failed for Task B (C6); the 3 old `V3 CONFLICT` tests for
  C6–C8 were rewritten to assert corrected behaviour.
- After: Stage 2 file 47/47; full backend 55 files / 429 tests passed; backend `tsc` clean; backend lint
  warnings pre-existing only; frontend 27 files / 279 tests, typecheck clean, lint pre-existing warnings only.
- Not run: Playwright/mock e2e, real-API e2e, frontend `build`, any non-disposable database.

### Historical-data impact (assessed from code; no real data inspected)
Existing `budget_periods` rows come in two shapes: (a) API/legacy-created rows are one day early on both
ends (`start-1`, `end-1`); (b) frontend-created rows have `start` = last day of previous month and
`end` = last day of the month (the frontend sent next-month-first, which shifted to the month's last day).
Consequences after this change: (b) rows still satisfy the lookup `start <= first && end >= last`, so
budget-performance finds them and actuals over-count only the previous month's last day; (a) rows end a
day early and are not matched by budget-performance; actuals use the row's own dates. The frontend picks
`budgetPeriods[0]` (latest `periodStart`) as the current period, so a new correctly-dated row for the
current month can sort above/beside a legacy row and appear empty until allocations are re-entered.
Nothing was rewritten automatically.

Proposed repair (documented only, **not run**; needs owner approval and a backup):
1. Audit (read-only): list rows where `period_start` is not the 1st or `period_end` is not a month end,
   with allocation counts, and detect collisions with the unique `(user_id, period_start, period_end)`.
2. Normalise, per row, inside a transaction: `start' = date_trunc('month', start + 1 day)`,
   `end' = (date_trunc('month', start + 1 day) + 1 month - 1 day)` only for rows whose derived month is
   unambiguous (spans one month ± 1 day). Skip any row whose target tuple already exists; for those, move
   allocations into the existing row (`ON CONFLICT (budget_period_id, category_id) DO NOTHING`) and report
   leftovers for manual review. Idempotent: normalised rows are no longer selected.
3. Re-run the audit; expect zero rows; keep the pre-image in a backup table.

### Remaining risks / blockers
- Historical budget rows need the owner-approved repair above; until then some existing months may show a
  one-day offset or be hidden behind a newer empty period.
- Custom (non-month) budget ranges are still inclusive end-dates; clients sending an exclusive end will be
  off by one day.
- `reversedTransactionId` is `@unique` on each side; any future partial-reversal feature must revisit the
  predicate (partial reversals are not supported today).
- Daily snapshot generation and net-worth were not changed (balance-based, unaffected by reversals).
- Recurring (C1–C5, C9, C10) remain unfixed by design.
