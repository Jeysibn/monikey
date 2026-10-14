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

## 8. Stage 3 results — V3 design system and application shell (2026-10-14)

Frontend only. No backend, database, ledger, recurring, GitOps or deployment change; no legacy route removed.

### What was built
- **Tokens** `frontend/src/styles/v3-tokens.css`: scoped to `.v3-root` (never `:root`/`body`). Blue accent `#0866D9`,
  canvas/surface/raised/overlay hierarchy, ink/muted text (muted 7.4:1), status colours, four account-card
  gradients, type scale (body 14–16px, secondary 12–14px), 4px spacing scale, radii, shadows, 44/48px
  control/touch sizes, focus ring, `--v3-dock-clearance`.
- **Primitives** `v3-primitives.css`: type, tabular `.v3-figure`, card, buttons (primary/secondary/ghost), field/input,
  link, account card, skeleton. All selectors are prefixed `.v3-root` to out-rank legacy global element rules.
  One legacy change: `global.css` input rules gained `:not(.v3-input)` (only narrows matching; legacy inputs unchanged).
- **Dock** `V3Dock`: completed with Left/Right/Home/End focus movement (all controls stay in the Tab order),
  subtle neighbour magnification (hover-capable pointers only), reduced-motion removes all transforms.
  Safe-area and 48px touch targets were already in place and are now tested.
- **Shell** `src/v3/`: `V3Shell` (skip link, utilities nav with Sync Center / Settings / Security / Exit preview,
  main, dock, bottom clearance), `V3Workspace` (accounts → position → activity in DOM order: 1 column on
  mobile with accounts first, 2 columns from 768px, 3 columns from 1200px), structural pages for Overview,
  Activity, Accounts, Planning (skeleton regions and links to the classic pages, no ledger data read), and
  `/v3/design` specimen (labelled sample values only).
- **Opt-in**: `?v3=1` (persisted in localStorage) or `VITE_V3_PREVIEW=true`; `?v3=0` / "Exit preview" turns it off.
  Default is the legacy UI; `/v3/*` redirects to `/` unless opted in. Legacy AppShell shows a "V3 preview" link only
  when opted in. Quick Add from the dock reuses the existing modal.

### Verification (exact)
- Frontend unit: 29 files / 292 tests passed (new: dock keyboard + mounting guard, `v3Preview`, shell/opt-in routing).
- Typecheck clean; lint: pre-existing warnings only, none in V3 files; build and `verify:privacy` passed.
- Playwright mock suite (`--grep-invert @backend-compose`): 127 passed, 0 failed, 0 skipped, including 26 new
  `e2e/v3-shell.spec.ts` tests: opt-in/out, Sync Center and Settings reachability, dock current-page/keyboard/Add,
  hover magnification and reduced motion, mobile/tablet/desktop/1000px layout, dock non-occlusion, 48px targets,
  no horizontal overflow, and axe (0 violations) on 5 V3 routes × 3 viewports.
- Not run: `@backend-compose` / real-API e2e, other browsers (Chromium only), real-device safe-area testing.
- A first axe run caught a real defect (legacy dark `input` rule overriding `.v3-input`); fixed as above.

### Screenshots
`docs/remake/screenshots/stage3/`: `{mobile,tablet,desktop}-overview.png` and `{mobile,tablet,desktop}-design-system.png`
(390×844, 820×1180, 1440×900). Regenerate with `V3_SCREENSHOTS=1 npx playwright test e2e/v3-shell.spec.ts`.

### Risks / follow-ups
- Legacy global CSS (`a`, `input`, `body`) is still loaded under V3; primitives defend by specificity. New V3
  elements (select, textarea, checkbox) will need the same treatment or a cascade-layer migration later.
- The opt-in flag is runtime and user-controlled; it only exposes placeholder pages plus links to existing pages.
- Placeholder pages deliberately show no financial data; real Overview/Activity/Accounts/Planning are next milestones.

## 9. Stage 4 — Functional Overview & Insights (opt-in V3 preview)

### Built
- `/v3` is now the real Overview (`frontend/src/v3/V3Overview.tsx`, `overviewModel.ts`, `V3Overview.css`), still behind the opt-in flag.
- **Summary**: four favorite account cards (link to `/accounts`), position card (liquid, card debt, net tracked position), monthly spent/income plus budget meter, recent activity (links to `/transactions`). Mobile is one column, accounts first; 768px+ two columns; 1200px+ three columns.
- **Insights**: net tracked position history, spending by category, budget vs actual, and a Monthly/Quarterly/Yearly selector. Budget vs actual is monthly only, and the UI says so.
- Accessible tablist (arrow keys, Home/End, roving tabindex); offline banner; 48px targets; credit cards show `Owed` + "Outstanding debt", never available credit.
- Data: existing `useFinance()` state in both modes. All money is exact BigInt minor units. Reversal pairs are hidden and never counted; transfers and card repayments are excluded from spending/income; investments and crypto are outside the position.
- Mock repository fix: the compensating reversal row now sets `reversedTransactionId`, matching backend semantics so pairs are recognised in mock mode.

### Verification (exact)
- Unit: 31 files / 314 tests passed before the final test additions; `src/v3` alone: 4 files / 33 tests passed after. New: `overviewModel.test.ts`, `V3Overview.test.tsx`.
- Typecheck clean; lint has pre-existing warnings only, none in `src/v3`; build and `verify:privacy` passed.
- Playwright mock suite (`--grep-invert @backend-compose`): 137 passed, 0 failed, 0 skipped, incl. 10 new `e2e/v3-overview.spec.ts` tests plus axe on Summary and Insights at mobile/tablet/desktop (0 violations), no overflow, dock non-occlusion, keyboard navigation to existing pages.
- Not run: backend-compose / live-API checks (disposable DB left stopped; history fetch is covered only by mocked-fetch unit tests), non-Chromium browsers, real devices.

### Screenshots
`docs/remake/screenshots/stage4/{mobile,tablet,desktop}-{summary,insights}.png` (`V3_SCREENSHOTS=1 npx playwright test e2e/v3-overview.spec.ts`; full-page, so the fixed dock appears mid-image on mobile).

### Data APIs/selectors that cannot safely support the approved UX
1. **Favorite accounts**: no persisted flag in the domain or API. Selection is deterministic (first bank, e-wallet, cash, card, then fill). Needs a favorites field or setting.
2. **Net position history**: the frontend gateway does not expose `/reports/net-worth`; Insights fetches it directly (as Reports does). Snapshot scope (whether it matches liquid minus card debt, and excludes investments) is unverified, and history may be sparse. Mock mode has none, so an unavailable state is shown. The `*TrendSample` selectors were deliberately not used.
3. **Existing selectors** `totalAvailableCash` / `totalExpenses` / `totalIncome` use floats and do not exclude reversal pairs, so V3 uses its own BigInt model. These should be consolidated later.
4. **Mock seed**: budget `spent` values are hand-set and do not reconcile with seed transactions, so budget and category spending differ in demo mode. In backend mode the budget figure covers budgeted categories only.
5. **Bootstrap transactions**: it is unverified whether the backend bootstrap returns full history; quarterly/yearly category spending relies on it. A report-endpoint-backed path (`/reports/spending-by-category`) is the safer follow-up.
6. Negative money renders as `₱-8.20` (existing `formatMinorUnits`); left unchanged.

### Risks
- History chart is a minimal SVG with a text summary; there are no per-point tooltips.
- Activity and account rows link to classic pages until their milestones.

## 10. Stage 4.1 — Overview data integrity (2026-10-14)

### Data-contract findings and corrections
1. **Net tracked position history.** `/reports/net-worth` (stored daily snapshots) is unreliable: `rebuildSnapshot` takes the last-*posted* effect's `balanceAfterMinor`, which is wrong for backdated entries (characterized: returns 98500 where 99500 is correct); it includes archived accounts and opening balances from before account creation; snapshots are written only by the daily worker, so there is no backfill and existing rows go stale. Endpoint left untouched.
   - **New** `GET /reports/net-tracked-position?from&to` (commit `80a504d`): exact, ledger-derived, BigInt/minor-unit strings. Per day = opening balance + cumulative `delta_minor` by `occurred_on`; liquid (checking/savings/ewallet/cash) minus credit-card liability; archived accounts excluded; accounts appear from their creation date (no fabricated earlier days); no days after the user's local today; span capped at 731 days (400 `INVALID_RANGE`). Card repayments and transfers leave net unchanged; reversals handled.
   - V3 Insights now uses it. Demo mode has no history and says so.
2. **Spending analytics.** Stage 4 computed quarterly/yearly totals from the bootstrap list, which is capped at 1,000 transactions with no truncation flag. In backend mode V3 now uses `/reports/summary` (total) and `/reports/spending-by-category`; the difference is shown as **Uncategorized** (the category endpoint omits uncategorized expenses). Verified with a 1,200+ transaction backend test including transfer, pending, reversal pair and uncategorized noise.
3. **Budget consistency.** The mock seed's budget `spent` values are static demo numbers unrelated to the seeded transactions; the gap is a seed artefact. In the UI the metrics are now never under one label: **All spending** (every cleared expense) vs **Budgeted categories: X of Y** (only categories with a budget). Backend mode takes budgets from `/reports/budget-performance?period=YYYY-MM` (404 → "No budget set"). Mock model and API both count cleared rows only.
4. **Account cards.** Heading/aria renamed **Featured accounts**; four cards remain on mobile. The heuristic (first bank, e-wallet, cash, card) is not user configuration.
   - **Requirement for the Accounts milestone:** persistent, user-selectable favorite accounts (API field + UI).
5. **Money formatting.** `formatMinorUnits` now renders negatives as `-₱8.20` (shared helper, BigInt, tested in `currency.test.ts`).

### Results
- Frontend: typecheck, lint (warnings pre-existing), build, `verify:privacy` pass; vitest 32 files / 319 tests; Playwright mock suite 137 passed.
- Backend (disposable PostgreSQL): 56 files / 436 tests, `api:openapi:check` pass.
- Viewport screenshots: `docs/remake/screenshots/stage4_1/` (mobile, tablet, desktop × Summary, Insights).

### Risks / blockers
- Backend-mode Overview is verified by mocked-fetch component tests plus backend integration tests of each endpoint; a live browser run against a local backend was not performed (no `@backend-compose` run).
- Existing `/net-worth` snapshots remain wrong for backdated data; consider rebuilding or deprecating.
- Backend-mode "Budgeted categories" on Summary still reads bootstrap budget state; Insights uses the authoritative endpoint.
- Quarterly/yearly Summary-vs-Insights use report endpoints only in backend mode.

## 11. Stage 5A — Activity & Accounts (2026-10-14)

### Implemented (all opt-in V3; legacy routes untouched)
- **Backend:** `GET /transactions` gains a literal-safe `q` search (title/note, `%`/`_`/`\` escaped). No schema change, no ledger-semantics change. OpenAPI and the generated client were regenerated.
- **Activity (`/v3/activity`):** mobile date-grouped list, desktop (≥900px) sortable table, debounced search, collapsible filters (type, account, category, date range, sort, show-reversed). Filters, sort and the selected transaction (`?tx=`) live in URL params, so Back/Forward works and links are shareable. Server-side cursor paging (50 rows, "Load more"). Kind badges: Expense, Income, Transfer, Card charge, Card repayment (never expense/income). Reversal pairs are hidden by default and shown, badged and cross-linked, under "Show reversed (audit trail)". Edit reuses the existing modal, reverse reuses the confirm dialog. Explicit loading, error (with retry), empty, offline and pagination-error states. Sorting other than date-desc applies to loaded rows only, and the UI says so while more pages exist.
- **Accounts (`/v3/accounts`):** physical-card-style grid with a distinct tone per account within each kind. One expanded account at a time (`?account=ID`, deep-linkable, history-aware). Credit cards show **outstanding debt**, limit, limit used, due date and minimum payment; remaining credit is stated as a limit, not cash. The expanded panel lists the 5 most recent transactions and links to `/v3/activity?account=ID`. Add account, add credit card, edit (name, institution, last four only) and archive (confirm) go through the existing gateway; **balances cannot be edited** (no ledger bypass). Edit/archive are hidden without a backend.
- **Navigation:** Overview account card → `/v3/accounts?account=ID`; Overview recent row → `/v3/activity?tx=ID`; Accounts → filtered Activity; Activity account links → Accounts. No fifth nav item; Settings/Security/Sync Center unchanged.

### Favorite accounts — implemented in Stage 5A.1 (see §12); original proposal kept below
`UserPreferences` has only notification/AI/hide-cents toggles; no table or column can store a per-user favorite list. The Overview keeps the deterministic heuristic ("Featured accounts").
- **Proposed model:** nullable `favorite_rank SMALLINT` (1–4) on `financial_accounts`, with a partial unique index on `(user_id, favorite_rank) WHERE favorite_rank IS NOT NULL AND archived_at IS NULL`. Chosen over a JSON preferences field so ownership, archival and uniqueness are enforced by the database.
- **API:** `PUT /api/v1/accounts/favorites` with body `{ accountIds: string[] }` (0–4 unique, owned, non-archived, otherwise 400/404); `favoriteRank` exposed on the account view and in bootstrap. Archiving an account clears its rank.
- **Migration plan:** additive, nullable, no backfill; app falls back to the heuristic when no ranks are set. Roll back by dropping the column and index.

### Stage 4.1 follow-ups
- Archived accounts are excluded from the whole net-tracked history (documented behaviour, tested). 1,500-transaction history computes exactly (BigInt) in under 3 s. Backdated and reversal cases remain covered by the Stage 4.1 tests.
- Summary and Insights keep distinct labels for all-category spending versus budgeted-category spending.

### Results (actual)
- Frontend vitest: 35 files / 338 tests pass. Typecheck, build and `verify:privacy` pass. Lint: warnings only (vendored tesseract and existing pages), no errors.
- Backend (disposable PostgreSQL): 57 files / 442 tests pass; `api:openapi:check` and typecheck pass.
- Playwright mock suite: 142 passed, 9 skipped (the real-backend spec, which needs `V3_BACKEND_LOCAL=1`).
- **Real-backend browser run** (local API on :3000, disposable DB, Vite dev server with `VITE_FINANCE_BACKEND=true`, test-only registered user, 60+ seeded transactions): 9 of 9 passed. Covered: register and load; Overview and Insights; card owed 1,500.00 (never available credit); paging across 60+ rows; literal `%` search; type filter with Back/Forward; reversal hidden and shown in audit view; card charge and repayment labels; reverse via confirm; account create, edit (no balance field), archive; account → filtered Activity and back; error state with retry and recovery; axe (WCAG 2 A/AA) and no horizontal overflow at mobile, tablet and desktop.
- Screenshots (actual viewport, backend-backed): `docs/remake/screenshots/stage5a/`.
- Test cleanup: the disposable container and dev servers are stopped after the run.

### Remaining defects / risks
- Favorites are not persisted (above). Sort other than date-desc is per loaded page set.
- Category shows "System Groceries" for every seeded row only because the test data used one category.
- The desktop table runs under the floating dock while scrolling (clearance exists at page end).
- Add credit card sends minimum payment 0; editing due date, limit and minimum payment is not in this stage.
- Credit-card "Payment due" shows day and month only.

### Recommendation for Stage 5B (Quick Add)
Proceed after review. Reuse `useActivityFeed` refresh and the Activity/Accounts URL patterns; build on the existing add-transaction modal and idempotency keys rather than new ledger paths; decide favorites first, since Quick Add's account picker should honor them.

## 12. Stage 5A.1 — Favorite Accounts & UX corrections (2026-10-14)

### Backend
- **Migration `20261014000000_favorite_accounts`** (additive, hand-written SQL, verified against a disposable PostgreSQL, no unrelated drift): `financial_accounts.favorite_rank SMALLINT NULL`; `CHECK (favorite_rank IS NULL OR favorite_rank BETWEEN 1 AND 4)`; partial unique index on `(user_id, favorite_rank) WHERE favorite_rank IS NOT NULL`; `user_preferences.favorites_configured BOOLEAN NOT NULL DEFAULT false`. Existing rows migrate to *no rank, unconfigured*. Rollback: drop the index, constraint and the two columns.
- **`favorites_configured`** is the minimal preference field that separates "never configured" (Overview suggests accounts) from "intentionally empty" (Overview shows none).
- **`PUT /api/v1/accounts/favorites`** `{ accountIds: uuid[] (max 4) }` → `{ favorites: AccountView[] }` in rank order. One transaction: the user's preference row is upserted and locked `FOR UPDATE`, every rank is cleared, then ranks are assigned `index + 1`. Concurrent replacements serialise and the final state is always exactly one submitted list. Errors: schema/more than four → 400; duplicate ids → 422 `VALIDATION_ERROR`; unknown or another user's account → 404 `UNKNOWN_ACCOUNT`; archived → 422 `ACCOUNT_ARCHIVED`; unauthenticated → 401. Failure leaves the previous selection untouched.
- **Archiving clears the rank.** `favoriteRank` is on the account view and `favoritesConfigured` is under bootstrap `settings`.
- **Global sorting:** `GET /transactions` accepts `sort=date|amount` and `dir=asc|desc`. Keyset cursor includes the sort key (`amountMinor`, `occurredOn`, `createdAt`, `id`), so paging is stable across the whole matching set with filters and `q`. Amount sorts by **magnitude** (exact bigint). The legacy id-only cursor still works.

### Frontend
- **Accounts (`/v3/accounts`, backend mode):** an "Overview favorites" panel (`N of 4 selected`, ordered list with Move up / Move down / Remove buttons, live status message, error alert) and a per-card toggle (`aria-pressed`, `★ Favorite 2`; disabled with "Favorites full" once four are chosen). Every change is one `PUT` that replaces the list; local state updates only after the server accepts it. Mock mode has no persistence, so the controls are hidden (as edit/archive already are).
- **Overview:** unconfigured → the existing four suggestions; configured → only the selection, in rank order, fewer than four stays fewer, empty shows "No favorite accounts selected" with a link. Credit cards keep the "Owed … Outstanding debt" presentation. Archived accounts are not in state, so they cannot appear. No balance or calculation code changed.
- **Activity sorting:** only **Date** and **Amount** are sortable (both server-side). Description, Category, Account and Type sorts were removed because they cannot be paged correctly across pages; the "sorted within loaded transactions" notice is gone. Sort lives in the URL (`sort`, `dir`), unknown values fall back to date, Back/Forward restore it. Under an amount sort the date headings are omitted and each row carries its date.
- **Dock:** no layout bug reproduced: the shell already reserves `--v3-dock-clearance`. Viewport tests now enforce it (mobile 390, tablet 820, desktop 1280/1440): last row and last action end above the dock, the action is the topmost element at its centre and clickable, the detail panel opens, and the dock keeps its fixed floating, rounded, blurred style.
- **Credit card:** "Payment due" now reads "The 20th of each month" (the backend stores only a due day; the old label implied a calendar date built from the current month). Minimum payment shows **Not set** with a caption when it is 0, instead of being hidden or implied as verified. The edit form states that credit limit, due day, minimum payment and network cannot be changed yet.

### Unsupported credit-card edit fields (later milestone)
`PATCH /accounts/:id` and the V3 edit form cover name and last four only. Credit limit, due day, minimum payment and network need a card-detail update path with ledger-neutral validation; not started here.

### Results (actual)
- Backend (disposable PostgreSQL, 127.0.0.1:58321): 58 files / 448 tests pass, including the new `stage5a1-favorites-sorting.db.test.ts` (migration defaults, order/reorder/clear, empty vs unconfigured, duplicate / over-four / invalid / foreign / archived ids with state unchanged, DB constraint rejection, archive clears rank, 12 concurrent PUTs ending in one valid list, 15 transactions walked in pages of 4 for amount/date asc/desc with ties and filters). `tsc`, `api:openapi:check` pass.
- Frontend: 36 files / 348 vitest tests pass; `tsc -b`, build and `verify:privacy` pass; lint has warnings only (pre-existing).
- Playwright mock suite: 151 passed, 18 skipped (the two real-backend specs), including the new viewport dock spec.
- Real-backend Playwright (local API + Vite, test-only user): `v3-backend-local` 9/9 and `v3-favorites-backend` 9/9: unconfigured suggestions; select/order/limit of four; reload and a brand-new login session persist the selection; archive removes a favorite; clearing all stays empty after reload; axe clean; card due/minimum presentation; amount sort across 75 rows (largest first on page 1, smallest only after Load more, no duplicates), URL/reload/Back/Forward; sort plus account filter; dock clearance and detail open with 75 rows at three viewports.
- Screenshots (real backend data): `docs/remake/screenshots/stage5a1/`.
- Cleanup: dev servers and the disposable container are stopped after the run.

### Remaining issues
- Favorites cannot be reset to "unconfigured" (by design: an empty selection is a deliberate choice).
- Mock mode has no persisted favorites; Overview uses suggestions there.
- Amount sort orders by magnitude, so income and expenses of the same size interleave.
- Card edit fields above are still unsupported; `dueDate` in the frontend model is still a synthetic current-month date (only the day is shown).
- No migration was applied anywhere except the disposable database; nothing was pushed or deployed.

### Stage 5B readiness
Ready for review. Quick Add can rely on the favorites order for its account picker and on the Activity refresh pattern; Quick Add itself is not started.

## 13. Stage 5B — Quick Add (2026-10-14)

### Features
- The V3 dock Add button opens a V3 composer: native `<dialog>`, bottom sheet on mobile, compact 480px dialog at ≥720px. The legacy modal is untouched and still serves legacy routes and editing from V3 Activity.
- Four actions: Expense, Income, Transfer, Card Payment. Main form shows only required fields (amount, account, category, from/to, pay-from + card); description, date, time, note and transfer fee sit in an expandable "optional details" section that auto-opens on an error inside it. Dates default to Asia/Manila.
- Account pickers: favorites first (`favoriteIds` order), then others by label; archived excluded; income and transfer never offer cards; card payment offers only cards with an amount owed; similar names get the institution/last-4 appended; works with zero favorites.
- Quick picks: recent account and category chips, and "Reuse an earlier one" (draft from a loaded transaction, dated today). No new tables, rules or AI.
- Reliability: double-submit lock, stable idempotency key across retries, field-level validation with focus/aria, data preserved on recoverable errors, discard-confirmation on Escape/close with unsaved input.
- Offline: network failure enqueues to the existing outbox with the SAME key and shows "Queued — pending sync, not posted yet" plus a Sync Center link; a shell banner shows pending counts. 5xx/unknown errors keep the entry and say it may already be saved (same key reused); 4xx maps to field errors.
- Empty states in Overview and Activity offer "Add a transaction".

### Reused logic (no second posting path)
`asyncFinance.addTransaction` / gateway `POST /transactions`, `createIdempotencyKey`, `localFirstStore` outbox + `syncPendingOutbox`, Sync Center retry, `useFieldErrors`, `FinanceApiError`/`FinanceValidationError`, `favoriteIds`, `formatMinorUnits`, `parseMinorUnitInput`. Card Payment is `type:'transfer'` to the card. No backend or schema change.

### Correctness and offline findings
- Response lost after the server posted: queued under the same key; Sync Center retry posts exactly once (balance changes once).
- If the post succeeds but the follow-up reload throws a network error, the UI conservatively says "queued"; replay is idempotent.
- Overpayment is blocked client-side and by the server (`CARD_PAYMENT_EXCEEDS_OWED`); card limit and overdraft rules come from the server.
- There is no auto-sync on the browser `online` event (pre-existing); the user presses Retry sync.

### Tests
- Frontend: 38 files / 381 vitest tests pass (33 new: model 22, component 11); `tsc -b`, build, `verify:privacy` pass; oxlint only pre-existing warnings.
- Playwright mock suite: 151 passed, 30 skipped (real-backend specs).
- Real backend (disposable Postgres, local API + Vite): `v3-quickadd-backend` 12/12, `v3-backend-local` 9/9, `v3-favorites-backend` 9/9. One stale locator in `v3-backend-local` (matched a category `<option>` once categories were seeded) was scoped to list rows.
- Backend suite not re-run (no backend change; last run 448 passing).

### Screenshots
`docs/remake/screenshots/stage5b/`: mobile expense/income/transfer/card-payment, card-payment error, validation error, offline queued; desktop expense, card payment, optional details.

### Remaining issues
- No auto-sync on reconnect.
- Reused drafts come only from loaded transactions (the bootstrap page in backend mode).
- Editing still uses the legacy modal.
- No client request timeout; a hung request stays pending until the browser fails it.

### Stage 6 readiness
Ready for review. Planning and recurring-payment work not started.

## 14. Stage 6A — Planning & Budgets (2026-10-14)

Commits: `987d504` (Quick Add reliability), `6d225da` (planning model), `c2c0ecd` (Planning page, Overview consistency), plus the real-backend spec/screenshots commit and this doc. No backend, schema, OpenAPI or recurring-worker change.

### Quick Add reliability (Task 0)
- A. Posted + refreshed: "Transaction saved"; balances, Activity, Accounts and Overview update.
- B. Posted + refresh failed: `PostedRefreshError`; panel `v3-qa-saved-stale` says "Transaction saved, but the latest balances couldn't be loaded.", keeps the confirmed id, enqueues nothing, and "Refresh balances" retries only the refresh.
- C. Uncertain (network error, lost response, timeout): the same idempotency key is kept; the transaction is queued in the existing outbox (checked first so no duplicate record) and described as "not shown as posted … will be checked when it syncs". Sync Center retry replays with the same key.
- D. 4xx: real server error shown, form kept, nothing queued. 5xx: "may have been saved" with the key reused.
- Gateway requests have a bounded timeout (20 s). `RequestTimeoutError extends TypeError` so a timeout is an uncertain outcome; caller aborts are not timeouts.

### Planning
- `v3/planningModel.ts` (pure BigInt), `usePlanningBudgets.ts`, `V3Planning.tsx/.css`. Month navigation −12/+1 months (backend mode; demo mode is the current month only). Summary, category rows with accessible progress bars and Over/Near-limit (≥80 %) states, unbudgeted categories, read-only recurring bills, empty/loading/error/offline states.
- Spend values are the server's `spentMinor` (cleared expenses, reversal pairs excluded, inclusive month bounds); transfers and card repayments are not spending and card purchases count once. "Spent in budgeted categories" is shown separately from "All spending this month" (outside-budget = total − budgeted, clamped at 0).
- Budget semantics: `POST /budgets` is an upsert that resets `incomePoolMinor`, so a period is created only when the month has none and never re-posted. Period selection: exact month, else covering period. No allocation-delete endpoint exists, so "remove" saves 0 and a 0 allocation is treated as unallocated.
- Overview consistency: `MonthlySnapshot` used bootstrap's most recent period (possibly another month); it now uses `/reports/budget-performance?period=` like Planning. Verified equal in the real-backend spec (700.00 of 1,800.00).
- Recurring bills are read-only: no buttons, no `mark-paid`, no schedule changes. Wording: reference only; MoniKey may record a bill by itself once due, so check Activity before paying. Opening Planning does not post (verified: transaction count and `nextDueDate` unchanged).

### Verification (executed)
- Frontend: `tsc -b` clean; Vitest 40 files / 410 tests passed; build and `verify:privacy` passed; oxlint: 17 warnings, all pre-existing (none in Planning files).
- Playwright mock suite: 151 passed, 38 skipped (backend-gated specs, incl. the 8 new real-backend tests).
- Real backend (disposable Postgres, API :3000, Vite :5173): `v3-planning-backend` 8/8, `v3-quickadd-backend` 12/12, `v3-backend-local` 9/9, `v3-favorites-backend` 9/9. Planning spec covers create/allocate/edit, expense, card purchase once, repayment ignored, reversal, month boundary (prior month last day excluded), Planning = Overview = report, active/paused/overdue bills with no posting, error recovery + Back/Forward, Quick Add refresh failure, axe (no serious/critical), overflow and dock clearance.
- Backend tests/typecheck were not re-run (backend untouched; last known 58 files / 448 tests).
- Screenshots: `docs/remake/screenshots/stage6a/`.

### Remaining issues
- No allocation-delete endpoint (0 used instead); no auto-sync on reconnect.
- Gateway `setCategoryBudget` (legacy/demo path) re-posts the period and resets the income pool.
- Recurring items load once at provider mount; Planning does not refresh them.
- Demo-mode month is the current month only.
- Planning's spend refresh key is a heuristic (transaction count + first id).
- The 20 s request timeout is fixed.
- Desktop dock floats over the bottom of scrolled content (padding clears it at the end of the page).

### Stage 6B proposal (not implemented)
Requirement: a recurring due date must never automatically create an expense; only explicit user confirmation posts one.

Current behaviour (facts): `processDueRecurringItems` (separate process `backend/src/worker.ts`) posts an expense for every active item with `nextDueDate <= today` and a non-archived account regardless of `autopay`, key `recurring:${id}:${dueDate}`, `source:'recurring'`; it then advances `nextDueDate` (UTC `setUTCMonth`, month-end drift) and sets `lastPaidDate` in a separate, non-atomic step; failures auto-pause the item.

1. Disable auto-posting: remove the posting path from the worker (keep it as a due/overdue marker only) behind a feature flag defaulting off, then delete after rollout.
2. `autopay`: stop honouring it; keep the column for compatibility, force false on write, hide from UI, and drop in a later migration.
3. Confirmation: `POST /recurring/:id/confirm` with `{amountMinor, accountId, paidOn, idempotencyKey}`, pre-filled with the scheduled values, so the user confirms the actual amount, account and date.
4. Atomicity: one DB transaction creates the ledger transaction and advances the schedule (`nextDueDate`, `lastPaidDate`), with row lock on the recurring item.
5. Idempotency/concurrency: key `recurring-confirm:${id}:${dueDate}` plus `SELECT … FOR UPDATE`; a second request returns the first result; a stale `dueDate` is rejected with 409.
6. Previously auto-posted payments: leave them untouched (no history repair); label by `source:'recurring'`; optional report of items whose last auto-post is within N days so the user can check.
7. Duplicate detection: warn (not block) when a cleared expense with similar amount, account and merchant/category exists within ±N days of the due date, including prior auto-posts.
8. Missed cycles/overdue: never back-post. Overdue bills stay overdue with a "confirm, skip or reschedule" choice; skipping advances without a ledger entry. Replace UTC month arithmetic with clamped end-of-month logic in the user's timezone.
9. Migration/compat: no schema change is strictly needed (an optional `skippedThrough` or audit table is the only candidate and needs approval); older clients calling `mark-paid` must keep working, routed through the same confirm path.
10. Tests: worker never posts; confirm posts once and advances atomically; concurrent and replayed confirms; failure mid-transaction rolls back both; skip; month-end/leap/timezone advance; duplicate warning; legacy `mark-paid` compatibility; real-backend Planning confirm flow.
11. Rollout: ship worker-off flag first and verify no `source:'recurring'` rows appear; back up before any migration; stage on a copy of production-shaped data; announce the behaviour change; keep the flag as a kill switch; monitor ledger counts for two cycles.

### Stage 6 readiness
Stage 6A complete and ready for review. Stage 6B proposal above is superseded by §15.

## 15. Stage 6B — Manual Recurring Payment Confirmation (2026-10-14)

**Rule:** a recurring bill's due date never creates an expense. Only an explicit, user-confirmed payment creates a ledger transaction. Local only; no migration has been run anywhere but a disposable database.

### Paths that could create recurring expenses (found)
- Worker `processDueRecurringItems` (job `daily-finance-maintenance`) posted for every active due item regardless of `autopay`, key `recurring:${id}:${dueDate}`, non-atomic advance (`setUTCMonth`), auto-pause on failure. **Removed**: the worker no longer posts; it only enqueues reminders.
- Legacy `POST /recurring/:id/mark-paid`: no body, no due check. **Now delegates to the safe service.**
- `POST /transactions` with `source:'recurring'`: user-initiated; unchanged.
- `enqueueDueBillNotifications`: non-financial reminder; unchanged.

### Behaviour
- `POST /recurring/:id/confirm-payment` (`expectedDueDate`, amount, account, `paidOn`, `allowPossibleDuplicate`): item row locked `FOR UPDATE`; ledger transaction, `recurring_occurrences` row and next due date advance in one DB transaction. `paidOn` must be ≤ today (user timezone) and the cycle must be due.
- Also: `skip-cycle` (API only, no UI), `link-payment`, `GET payment-candidates`.
- `anchor_day` (nullable) keeps month-end clamping (Jan 31 → Feb 28 → Mar 31, leap years).
- Kill switch `RECURRING_CONFIRMATIONS_DISABLED` returns 503 for confirm, link and mark-paid. It can only disable; nothing can re-enable auto-posting.
- Duplicate warning: cleared, un-reversed, unlinked expenses from due−10 days to today matching amount or merchant; 409 with up to 5 candidates unless `allowPossibleDuplicate`.

### Idempotency
Ledger key `recurring:${itemId}:${dueDate}` (same as the legacy worker) plus unique `(recurringItemId, dueDate)`. An identical retry returns 200 `replayed`; different details return 409 `RECURRING_ALREADY_CONFIRMED`. A cycle already posted by the old worker is linked and advanced (`reconciled_existing`). Missed cycles are never back-posted; each request pays only the cycle it names.

### Legacy compatibility
`mark-paid` now: 422 if not yet due, 409 on possible duplicate, 404 if paused, 503 under kill switch. `autopay` is a note only and inert (UI label and tag reworded). This is an intentional break for old clients.

### Frontend
V3 Planning "Record payment" (overdue and due-today active bills, online only). Dialog states: form, submitting, duplicate (inspect / link / record new), uncertain (Check again resends the identical payload), confirmed. "Paid" is never shown before the backend confirms. Refresh uses an explicit `financeVersion` counter instead of the heuristic; if posting succeeds but refresh fails, a confirmed state offers "Retry refresh", which never re-posts.

### Rollout sequence (not executed)
1. Back up the database. 2. Apply additive migration `20261015000000_recurring_occurrences` (adds table and nullable `anchor_day`) on a production-shaped copy first. 3. **Stop/replace the old worker before anything else**: a still-running old worker would keep auto-posting. 4. Deploy new worker, then API, then frontend. 5. Optionally deploy with the kill switch on first and verify no new `source='recurring'` rows appear.

### Reconciliation checks
- `source='recurring'` transactions vs `recurring_occurrences` (every recurring-key transaction should have an occurrence after reconcile).
- Items whose `next_due_date` is not past the latest legacy-key transaction date.
- No transaction after rollout whose key starts with `recurring:` and has no occurrence row.

### Rollback
Set `RECURRING_CONFIRMATIONS_DISABLED`; the table and column are additive and harmless to older code, but older code must not be run (it auto-posts).

### Remaining risks
- Skip has no UI. Legacy rows may have a drifted anchor day. The duplicate heuristic can miss or over-flag. Worker `processDate` uses Manila rather than the user timezone. Other surfaces (Activity/Overview) refresh by remount or `financeVersion`.
- A bug found by real-backend Playwright and fixed: the duplicate check missed expenses with a NULL idempotency key (SQL three-valued logic); regression test added.

### Verification (local, disposable PostgreSQL)
Backend: 59 files / 462 tests passed, typecheck clean, lint pre-existing warnings only, `api:openapi:check` passes. Frontend: Vitest 41 files / 419 passed, `tsc -b` clean, oxlint pre-existing warnings only, build and `verify:privacy` pass. Playwright mock: 151 passed, 47 skipped (backend-only specs). Real-backend: planning, quickadd, backend-local, favorites and the new confirm spec: 47 passed. Screenshots: `docs/remake/screenshots/stage6b/`.

## 16. Stage 7A — Release Readiness (2026-10-15)

Local commits only (nothing pushed, merged or deployed; no production/homelab access). Runbook: `docs/remake/STAGE7A_RUNBOOK.md` (prepared, NOT executed).

### 16.1 Audit results
Journeys exercised on a real backend + disposable PostgreSQL (`e2e/v3-journey-backend.spec.ts`, 32 tests): create account in V3 → Quick Add expense → set budget → recurring confirm + replay → Overview/Insights equal a raw-ledger sum → reload persistence → failed report shows an alert; then 3 viewports (mobile 390×844, tablet 820×1180, desktop 1440×900) × 8 screens with touch-target, overflow and axe (serious/critical) checks, reduced motion, Quick Add focus trap/Escape. Auth, Activity, Accounts/favorites, Quick Add types, Planning, confirm/skip and Settings/Security/Sync are covered by the other real-backend specs and backend suites. V3 stays opt-in; legacy default verified.

### 16.2 Defect register
| Sev | Defect | Repro (before fix) | Status |
|---|---|---|---|
| P1 | Old/running worker or API binary could keep auto-posting recurring expenses after migration | Run old worker after rollout | Fixed: DB guard trigger (`c574b9e`). Old workers still must be stopped |
| P1/P2 | Concurrent same-key `POST /transactions` → 500 | 10 parallel identical requests | Fixed (`22a5f9c`, advisory lock) |
| P2 | Forged `recurring:` idempotency key → 500; amount beyond BIGINT → 500 | POST with such payload | Fixed (`22a5f9c`) |
| P2 | Stale bill reminders sent for paid/skipped cycles | Pay bill after reminder enqueued | Fixed (`99c739c`) |
| P3 | Float money formatting in emails; inaccurate enqueue count | large/odd amounts | Fixed (`99c739c`) |
| P2 | Legacy header overflowed at 390px with V3 opted in; icon-only Add had no accessible name | open /v3 on mobile/tablet, axe | Fixed (`d1849d5`) |
| P2 | Inline links in V3 paragraphs failed contrast/link-in-text-block | axe on Overview/Planning | Fixed (`d1849d5`); underline regression on cards re-checked in `journey-05-overview.png` (none) |
| P3 | Record payment and Skip buttons touched | Planning bills row | Fixed (`e1a3778`) |
| P2 | Sync Center, Settings, Security open in the legacy dark shell | click header links in V3 | Open, known limitation (visual discontinuity) |
| P3 | Mobile V3 header ≈190px tall; Overview favorites card blank space; half-width budgeted card on wide Planning; fixed-width account card; legacy mobile header "V3 preview"/"Sign out" labels wrap in Settings | view screenshots | Open, cosmetic |

### 16.3 Recurring safety findings
Guard trigger blocks `recurring:*` keys without the confirmation flag (P0001 `RECURRING_AUTOPOST_BLOCKED`); forged keys rejected at API; same-key concurrency posts once; confirm/skip idempotent; skip creates no ledger row and is not "paid". Kill switch (default `RECURRING_CONFIRMATIONS_DISABLED=false`) controls confirmation only; the new worker has no posting switch. Old worker hitting the guard auto-pauses the bill (resume afterwards). Evidence: `stage7a-recurring-safety.db.test.ts` (21), `recurring-confirmation.db.test.ts`.

### 16.4 Reconciliation evidence
`stage7a-reconciliation.db.test.ts` (6 tests): independent oracle from raw rows matches API for balances, spend, income, budgets, net position; leap day, year boundary, ₱90bn BIGINT, transfer/card repayment excluded from income/expense, reversal not inflating spend, favorites not affecting totals, 10 concurrent identical requests. No mismatches.

### 16.5 Legacy migration assessment
`backend/scripts/legacy-dry-run.ts` (SELECT-only inside a READ ONLY transaction; `legacy-dry-run.db.test.ts` proves it flags seeded legacy favorites anomalies, archived refs, odd budget periods, legacy auto-posts without occurrence, drifted/stale due dates, paused bills, snapshot gaps/inconsistency, and changes nothing; legacy `source='recurring'` rows stay readable). Offline outbox is client-side IndexedDB and not visible to SQL. Nothing is normalized. Balance-adjustment: not launch-required; design-only in the runbook (separate non-expense ledger event, never a balance overwrite).

### 16.6 Screenshots
`docs/remake/screenshots/stage7a/` (34 files): `audit-{mobile,tablet,desktop}-*`, `desktop-skip-*`, `mobile-planning-skip-button`, `journey-*`. Viewed with Read: skip dialog (desktop/mobile), skip success, mobile/tablet/desktop audit screens (overview, insights, activity, accounts, planning), mobile settings, journey overview, legacy tablet/mobile sync. Not individually viewed: remaining settings/security and journey-0x images (covered by axe/overflow assertions).

### 16.7 Test results (this stage, disposable DB)
- Backend: 62 files / 491 tests passed, 0 skipped; `tsc` clean; `api:openapi` regenerated with no diff; `api:openapi:check` clean; oxlint warnings pre-existing only.
- Frontend: Vitest 42 files / 426 passed; `tsc -b` clean; oxlint warnings only (Crypto.tsx); build OK; `verify:privacy` passed.
- Playwright mock suite: 151 passed, 86 skipped (backend-only specs), 0 failed.
- Real-backend suite (`scripts/e2e-real-backend.sh`, fresh DB each run): run 1 = 86 passed; run 2 = 86 passed (≈4.2 min each); no flakes or failures. Axe scans are inside these specs.

### 16.8 Deployment and rollback runbook
See `docs/remake/STAGE7A_RUNBOOK.md` (not executed): reverting to an old auto-posting worker is not a safe rollback; the kill switch controls confirmation only; old workers must be stopped during rollout even with the guard.

### 16.9 Known limitations
Backward `nextDueDate` edit onto a confirmed/skipped cycle sticks; reversed payment not re-payable for that cycle; skip has no kill switch (no ledger effect); legacy rows without `anchor_day` stay drifted until edited; duplicate heuristic approximate; legacy auto-posted cycles lack occurrence rows; unknown body fields stripped; no rate-limit change (default limits unchanged, E2E uses per-spec `X-Forwarded-For` via trusted loopback, no bypass); error responses use the `{error:{code,message}}` envelope and logs were not found to include credentials in reviewed paths (review of tests/code, not a full log audit).

### 16.10 Stage 7B go/no-go
**Conditional GO** for a rehearsal in an isolated environment following the runbook; **NO-GO** for production until: off-host backup/restore is verified, all old workers are confirmed stopped, and the dry-run is run on a copy of real data and reviewed. Open P2 (legacy-shell Settings/Security) is non-blocking.

### 16.11 Local commits
`c574b9e` guard; `22a5f9c` ledger concurrency/bounds; `99c739c` notifications; `fa795c7` reconciliation + safety tests; `e1a3778` Skip Cycle UI; `d1849d5` UI fixes; `57de4ae` E2E runner/specs; `eb4e61d` legacy dry-run; `4184ea4` runbook; `99bb1d6` runner spec list + screenshots; plus the §16 docs commit.

## 17. Stage 7B: isolated migration and recovery rehearsal

Scope: rehearsal only, on disposable PostgreSQL 18.6 containers with synthetic data. No production or homelab access, no `homelab-gitops` change, no push, merge or deploy. Evidence: `docs/remake/stage7b/`; scripts: `backend/scripts/rehearsal/`; runbook: `docs/remake/STAGE7B_RUNBOOK.md`.

### 17.1 Environment and revisions
Fresh `postgres:18-alpine` containers (source, restore, and an alpine "vault"); the Stage 7A DB container was verified removed; unrelated containers untouched. Legacy baseline schema = the 26 migrations up to `20260913100000_crypto_activity_sequence`, applied with `prisma migrate deploy`; synthetic data from `legacy-seed.sql` (2 users, 7 accounts incl. credit card and an archived account, 6 categories incl. archived, 20 transactions incl. 3 reversal pairs, transfers, a card repayment, legacy `source='recurring'` rows, 7 recurring bills incl. drifted, stale, paused, archived-account, archived-category and overdue non-autopay, 3 budget periods incl. an odd-date one, 3 snapshots incl. a gap and an inconsistency). Legacy worker revision: `2f8b119` (last commit before manual-only recurring). App revision under test: this branch HEAD (see 17.10).

### 17.2 Migration rehearsal (deliverable 1)
Four additive migrations since the baseline (`favorite_accounts`, `recurring_occurrences`, `recurring_posting_guard`, new `recurring_schedule_guard`) applied in about 1 s. `migration-validation.log`: new columns empty, both guards present, constraint probes (favorite rank range/uniqueness, schedule edit without flag blocked, forged `recurring:` key blocked, ordinary insert OK) behave, dry-run counts on the fixtures: archived-account bills 1, archived-category bills 1, odd budget period 1, overlapping periods 1, legacy auto-posts without occurrence 4, drifted due dates 1, stale due date vs legacy key 1, paused bills 1, snapshot gaps 2, inconsistent snapshot 1. Nothing was normalized.

### 17.3 Backup/restore (deliverable 2) - `backup-restore-drill-01.log`
2026-10-14T18:32:35Z, PostgreSQL 18.6: `pg_dump -Fc` 0.18 s (122,318 bytes); TOC integrity check parsed 267 entries; AES-256 (pbkdf2) encrypted, sha256 identical after transfer to the vault container and after copy-back; decrypted copy byte-identical; `pg_restore` 1.15 s; oracle output of source and restore byte-identical (users, accounts, transactions, totals, ids, recurring state). **The vault is a local container, not an off-host location: this is a rehearsal of the procedure, not an independently verified production backup.** No failures. The restored DB was then migrated (`oracle-04`) and runs the app (smoke below).

### 17.4 Old-worker guard compatibility (deliverable 3) - `old-worker-compat.log`
Worker entrypoints: `node dist/worker.js` (`npm run start:worker`, legacy `src/worker.ts`); inventory found no running workers or other sessions on the rehearsal DBs. Control (legacy-complete schema, no guard): the old worker posted a recurring expense (balance 12,089,125 -> 12,080,125, +1 transaction), advanced Gym and Weekly water, and processed a bill with `autopay=false`. Guarded DB (all four migrations): no ledger row, no balance change, no schedule advance, nothing marked paid; the only change is the old worker pausing the two due bills (its error handler) plus derived snapshots. **Defect P1 found and fixed:** with only the 7A posting guard an old worker could still advance `next_due_date` when a legacy ledger row for the cycle existed (replay succeeded, no payment); migration `20261017000000_recurring_schedule_guard` blocks it (`P0001 RECURRING_SCHEDULE_WRITE_BLOCKED`); the new API sets the allow flag inside `RecurringService.lockItem`. Consequences: old API mark-paid/due-date edits fail at the DB; the old worker still auto-pauses due bills (review after shutdown). Normal ledger posting still works (probe + smoke).

### 17.5 Financial reconciliation (deliverable 4)
`oracle.sql` is independent of the app (SQL on legacy-baseline columns; balances re-derived from transaction rows with reversal rows inverted; md5 of every financial table). Pre-migration (`oracle-01`) = restored pre-migration (`oracle-02`) = after all four migrations (`oracle-03`), byte-identical. After migrating the restored copy (`oracle-04`) the only differences are the 8 seeded system categories (authorized metadata change; categories hash only). Anchors: Main Checking 12,089,125; Ana liquid 14,939,225; card debt 120,075; net position 14,819,150 (liquid minus card debt); October income 4,500,000 / expense 287,025 (transfers, card repayment and reversals excluded, card purchase once); Groceries October 275,025; Ben 945,000. The API reported the same numbers (smoke checks compare to the oracle values, not to the app). After the smoke run (`oracle-05`): 7/7 accounts balanced with only the deliberate deltas. Metadata changes: favorites ranks, system categories, synthetic password hashes, snapshots, worker pauses; none are financial mutations.

### 17.6 Recurring lifecycle defects (deliverable 5)
1. Due-date edit onto a confirmed/skipped cycle left the bill stuck -> now refused `409 RECURRING_SETTLED_CYCLE` with an explanation; later dates and no-op edits allowed. 2. Reversed confirmed payment blocked correction -> confirm/skip/link now return `409 RECURRING_PAYMENT_REVERSED` explaining the cycle stays closed and the correct payment goes through Quick Add; the occurrence, reversal and audit trail are untouched, duplicates impossible. A true same-cycle repay needs a data-model change (attempt model designed in the runbook) and was **not** implemented. Tests: `stage7b-lifecycle.db.test.ts` (8) and V3 confirm-dialog tests for both 409 messages (2).

### 17.7 Recovery and failure injection (deliverable 6) - `failure-injection.log`, 0 failures
F1 before migration, F2 during migration (broken 3rd migration; partial state shown, restore into a fresh DB and re-migrate, oracle identical, guards present), F3 after migration before API, F4 worker `kill -9` and restart, F5 API-only and worker-only, F6 backend terminated mid-confirmation (atomic, retry posts once, replay thereafter), F7 restore-point loss (the 2 writes after the backup were listed for reconciliation, nothing invented, restored DB balanced). The old worker was never used for recovery.

### 17.8 Offline and browser data
Documented in the runbook. `stage7b-offline-replay.db.test.ts` (8 tests): replay after commit, commit lost by restore, concurrent replays, replay after reversal, changed payload keeps the first content, per-user keys, logged-out 401, reserved prefix. IndexedDB contents are not in a PG backup; clearing site data loses un-synced operations. Existing frontend outbox/Sync Center tests and the real-backend specs ran green.

### 17.9 Test results (deliverable 7)
- HTTP smoke on the restored+migrated DB (`smoke-restored-db.log`): 58 passed, 0 failed (auth incl. bad password and missing Origin, Overview/Insights vs oracle, Activity filters/pagination/reversal rows, favorites, Quick Add four types + replay + reverse, Planning/budgets, confirm/replay/reconcile/refused cases, skip, link, legacy PATCH status, user isolation).
- Backend: 64 files / 507 tests passed, 0 skipped (Stage 7A: 62/491; +2 files, +16 tests: lifecycle 8, offline replay 8); `tsc` clean; `api:openapi` regenerated with no diff, `api:openapi:check` clean; lint warnings pre-existing only.
- Frontend: Vitest 42 files / 428 tests (7A: 426; +2); `tsc -b` clean; oxlint warnings only (Crypto.tsx, pre-existing); build OK; `verify:privacy` passed.
- Playwright mock suite: 151 passed, 86 skipped (backend-only specs), 0 failed.
- Real-backend browser suite (`scripts/e2e-real-backend.sh`, fresh DB): 86 passed. Same 7 specs against the restored and migrated rehearsal DB (API on that DB, Vite V3): 86 passed. Includes axe and the journey spec. No screenshots were added; the regenerated stage 5-7A screenshots were reverted with `git checkout`.
- Failure injection 0 failures; backup/restore drill 0 failures.

### 17.10 Local commits (deliverable 10)
`22e72b7` schedule guard + lifecycle fixes; `46f1944` synthetic dataset, oracle, backup/restore and old-worker scripts with evidence; `e165728` migration validation + post-migration oracle; `d381761` rollout rehearsal and smoke; `318e786` failure injection; `8ff4bf6` offline replay tests; `39b7261` V3 409 message tests; `4d3883a` runbook; plus the §17 docs commit. Not pushed.

### 17.11 Stage 7C release gate checklist (deliverable 9)
| Gate | Status |
|---|---|
| Independent off-host production backup verification | **NOT YET AUTHORIZED - not done.** Rehearsal used a local container only |
| Actual production-backup restore drill | **NOT YET AUTHORIZED - not done** (synthetic restore passed) |
| Real-data legacy dry-run | **NOT YET AUTHORIZED - not done** (synthetic fixtures only) |
| Old worker inventory and verified shutdown procedure | Procedure written and rehearsed; **production inventory not done** |
| Migration rehearsal success | Done (synthetic) |
| Financial reconciliation success | Done (synthetic): zero unexplained differences |
| Recurring-cycle correctness | Done: guards, refusal messages, regression tests; same-cycle repay after reversal is a documented limitation |
| Emergency stop and recovery procedure | Written and failure-injected (synthetic) |
| Outstanding P0/P1/P2 | P0: none known. P1: none open (schedule-advance hole found and fixed). P2: no same-cycle repay after reversal (design ready); old worker pauses due bills incl. non-autopay (review after shutdown); old API mark-paid/due-date edits fail at DB; legacy-shell Settings/Security (carried over); legacy rows without `anchor_day` remain drifted until edited; duplicate-payment heuristic approximate; offline operations in a browser whose site data is cleared are unrecoverable |
| GitOps rollout and smoke-test plan | Not done: needs the homelab-gitops change (out of scope, not modified). Smoke plan = `smoke.ts` + oracle + e2e specs; migration job must run before API/worker rollout |

### 17.12 Stage 7C go/no-go (deliverable 9)
**Conditional GO to PLAN Stage 7C; NO-GO for any production execution** until the user authorizes and completes: off-host production backup verified, a real restore drill, the real-data dry-run reviewed, a production inventory with all old workers confirmed stopped, and a GitOps plan reviewed. Synthetic results are not evidence for those items. Stage 7C was not started.

## 18. Stage 7C: production release readiness (planning only)

Deliverable: `docs/remake/STAGE7C_RELEASE_PLAN.md` (evidence review, worker/architecture inventory commands, 20-step migration procedure with authorization levels, financial safeguards review, recurring limitation classification, backup/recovery plan, GitOps proposal, rollback/forward-recovery matrix, real-data audit checklist, smoke checklist, defect register, release gate). Nothing was executed against production, the homelab, a registry or GitOps; no data was copied; nothing pushed.

### 18.1 Code change made (one correctness fix)
Reusing an idempotency key with a materially different `POST /transactions` body used to return the first transaction silently. Now `409 IDEMPOTENCY_KEY_REUSED` (type, amount, fee, accounts, category or date differ); cosmetic differences still replay; the `recurring:` prefix keeps its cycle semantics. The offline outbox treats it as a conflict. Commit `586ab23`; `STAGE7B_RUNBOOK.md` corrected.

### 18.2 Test results
- NEW this stage: backend full suite on a fresh disposable PostgreSQL (migrated + system seed): 64 files / 507 tests passed, 0 skipped (count unchanged: the "keeps first content" test was replaced by the 409 test); `tsc --noEmit` clean; `api:openapi` regenerated with no diff and `api:openapi:check` clean; lint 22 warnings, all pre-existing.
- NEW this stage: real-backend browser suite (`scripts/e2e-real-backend.sh`, fresh DB): first run 77 passed, 1 failed, 8 did not run - the first spec's `beforeAll` (user registration) timed out at 30 s while a backend lint was running concurrently; the clean rerun on an idle machine: **86 passed** (4.2 min). Treat the first failure as a load-related flake, not proven root cause.
- REUSED from Stage 7B (frontend code unchanged since): frontend Vitest 42 files / 428 tests, `tsc -b`, oxlint (Crypto.tsx warnings only), build, `verify:privacy`; Playwright mock suite 151 passed / 86 skipped; HTTP smoke 58 passed; failure injection 0 failures; backup/restore drill; old-worker compatibility; real-backend suite on a restored DB 86 passed.
- Not re-run: the HTTP smoke and the restored-DB browser run after the 409 change (the full backend suite and a fresh-DB browser run cover it).

### 18.3 Gate status (details in the plan, section 12)
All production blockers are NOT TESTED, and "no unresolved P0/P1" is FAIL because the external GitOps gaps (D11) and the missing production backup/restore/dry-run evidence (D12) are open. Code-level P1s D1 (schedule advance) and D2 (idempotency conflict) are fixed. Recurring same-cycle repay (D3) is P2, accepted for initial release with the Quick Add workaround.

### 18.4 Recommendation
GO to request separate approval for production READ-ONLY inspection, an off-host backup and an isolated restore plus real-data dry-run. NO-GO for any migration, deployment or production change.

## 19. Stage 8A: production read-only infrastructure preflight

Deliverable: `docs/remake/STAGE8A_PRODUCTION_PREFLIGHT.md`. Read-only; nothing was executed against production.

- **Access:** no kubectl, argocd, helm or kubeconfig on the workstation, so every live-state item (pods, replicas, digests, Argo status, PVC/cert status, PostgreSQL version, `_prisma_migrations`, backup evidence, drift) is **NOT VERIFIED**. No attempt was made to bypass this.
- **GitOps evidence:** homelab-gitops `main` is still `0c6399b` (read via the GitHub API); it has not advanced since the 2026-09-13 audit.
- **D11-A** present in Git: migrate Job runs `npx prisma migrate deploy` on `monikey-api:latest`, whose runtime image strips npx and Prisma; the published `monikey-migration` image is not used.
- **D11-B** present in Git: `NODE_ENV=development`, `SESSION_SECURE=false`, `APP_ORIGIN=http://…`, no Ingress TLS (Traefik redirects 80 to 443 globally; the only issuer is self-signed and unreferenced).
- **D11-C/D12:** no backup CronJob, script, Longhorn recurring job or off-host target in GitOps. Not configured, not observed, not verified by restore.
- **New P1s:** D14 (api, worker and migrate share the mutable `latest` tag, so the running worker version is unknown and may be pre-V3) and D15 (Argo `automated`+`prune`+`selfHeal` plus a Sync-hook migration: a Git push re-runs migrations, and a stopped worker would be restored). New P2/P3: D16 postgres pinning/recovery, D17 secret custody, D18 API docs exposure.
- **Gate:** "no unresolved P0/P1" remains FAIL (open P1: D11-A, D11-B, D11-C/D12, D14, D15).
- **Recommendation:** NO-GO for every operational change; GO only to obtain read-only cluster access (or user-run read-only commands) and to approve a GitOps fix proposal. The refined 16-step sequence is in the report, section 11.

## 20. Stage 8B: live infrastructure verification (NOT PASSED: no live access)

Deliverable: `docs/remake/STAGE8B_LIVE_PREFLIGHT.md`. No kubectl/kubeconfig/argocd/helm and no authorized read-only environment exists on this machine, so no live evidence was collected and no live item was verified. The package API returned 403 (no `read:packages` scope).

- New non-cluster evidence: Longhorn is configured with 1 replica on a single node and no backup target; exposure is LAN-only per Git; the last successful backend image publish was 2026-09-14 (`a49d294`), later backend/web publishes failed or were web-only, and `origin/main` contains none of the V3 migrations. **Inferred (not verified):** `monikey-api:latest` is a pre-V3 build, so the running worker is very probably the legacy auto-posting worker.
- The minimal operator read-only command set (sections A-F) and redaction rules are in the report; the blocker matrix keeps D11-A, D11-B, D11-C/D12, D14 and D15 as P1 FAIL (Git/CI) with live NOT VERIFIED. D16/D17 (P2) and D18 (P3) remain NOT VERIFIED.
- Recommendation: NO-GO for any operational step; GO only for the operator running the read-only commands. Dependency order: live evidence, backup, image provenance and digest pins, migration artifact, HTTPS/sessions, Argo window procedure, then dry-run and release.
