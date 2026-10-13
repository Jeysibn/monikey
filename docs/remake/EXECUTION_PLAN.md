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
| C6 | Reversal creates a compensating transaction of the same type (`expense`, cleared, positive amount, dated *today*); budgets/reports sum it as another expense, so a reversed expense counts twice | Reversal must net out of spending/budgets | **High (financial)** |
| C7 | `POST /budgets` shifts a date-only period one day early (stored `2026-08-31`..`2026-09-29` for Sep 1–30): Aug 31 spend is counted, Sep 30 spend is missed | Month boundaries follow the user's local calendar | **High (financial)** |
| C8 | `/reports/budget-performance` returns 404 for a budget created through the API for that month (consequence of C7) | Truthful budget vs actual | Medium |
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
