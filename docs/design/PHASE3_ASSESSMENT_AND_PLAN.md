# Phase 3 preparation — dashboard branch assessment and plan (2026-11-12)

## A. What already exists (important)

`feat/financial-analytics-dashboard` (PR #28, closed) is part of a linear stack that was **consolidated into open Draft PR #25** (`feat/frontend-moki-integration` → `main`, mergeable, not approved). PR #25 contains, on top of `main`: mobile navigation (Overview, Dashboard, Activity, More, Add), category icons (migration 008, ADR-023), a Dashboard with `/api/analytics` (ADR-024), cross-screen polish and Moki mascot assets. Phase 2 (this branch) was cut from `origin/main`, so it has none of that. A trial `git merge-tree` of this branch with PR #25's branch is **conflict-free**.

## B. Dashboard branch vs the approved redesign

| Area | On the branch | Verdict |
|---|---|---|
| `GET /api/analytics` (range, ≤366 days, account filter, decimal strings, half-open SQL, previous-period totals, month series, category totals, Kakeibo actuals, complete-month plan comparison) | Sound, bounded, backend-authoritative; has backend and browser tests | **Reuse as the base**; extend (§C of ADR-025) |
| Two independent date scopes (reporting month vs analysis range) | One period selector drives everything | **Gap** — main spec requirement |
| Daily series with zero-spend days, weekday occurrence averages, daily Kakeibo, More Insights | Absent | **Gap** — backend + UI work |
| KPI set (income, expenses, surplus, ratio with income=0 → not available) | Income, expenses, net with previous-period delta | **Partial** — add ratio, reframe as monthly |
| Charts | CSS bars + small SVG line, sr-only table, no library | Works; conflicts with the owner's Recharts preference → decided by ADR-025 |
| Category icons (`icon_key`, 12 Lucide keys, migration 008, CHECK allowlist) | Done, tested, ADR-023 | **Reuse**; no color yet |
| Navigation (5 columns with More dialog) | Done, with browser test | **Reuse** (matches spec §2 / mockup) |
| Categories screen | Icon picker added to the existing inline form | **Rework** to dialogs, colors, usage counts, sort (§D) |
| Financial rules | Transfers/payments excluded; card purchases once; no balance history | **Consistent** with invariants |
| Conflicts | `TransactionForm.tsx` (+2 lines icon) vs Phase 2 rewrite; `App.tsx`, `AppShell.tsx` possible | Trial merge clean; re-verify after merge |

Reusable: migration 008 and its tests, `categoryIconRegistry`/`CategoryIcon`, `/api/analytics` and tests, `AppShell` navigation, `wire`/`httpSource`/mock plumbing for icons, `finance.ts` helpers (`coversFullCalendarMonth`). Not reusable as-is: `DashboardView` (single scope).

**Recommendation:** do **not** cherry-pick pieces and do **not** redo them. Use PR #25's branch as the baseline for Phase 3 and layer redesign work on it, with Phase 2 merged in (clean) as the first step. This needs your decision because #25 is an unapproved draft and you asked for `origin/main` as baseline: either (1) base on `feat/frontend-moki-integration` (recommended, avoids rewriting migration 008/icons/nav), or (2) re-implement the same pieces on `main` (duplicate work, diverging migrations).

## C. Categories contract (see `docs/architecture/proposed/ADR-026-DRAFT-category-appearance-and-usage.md`)

New ADR **is required** (new column, widened CHECK, new derived field). Migration `009` on top of 008. Propagation checklist: PostgreSQL (009 + `database/tests/*` before/after fixtures + runner list), FastAPI (schemas, validation, serializers, tests), `types.ts`, `wire.ts`, `httpSource`, `mockData`/`mockSource`, `docs/api-fixtures/categories-list.json`.

## D. Phase 3 implementation plan (local commits, nothing pushed)

Blocked until: ADR-026 approved, base branch decided. ADR-025 only blocks the Dashboard phase.

1. Merge Phase 2 into the chosen base on a new local branch `feat/ui-redesign-categories-nav` (re-run all checks).
2. Migration 009 + DB tests; API fields, validation, usage count + backend tests.
3. Frontend contract: types, wire, http/mock sources, `categoryColors.ts` (key → contrast-checked pair), unit tests.
4. Shared dialog patterns: standard form dialog, compact confirmation (replaces `window.confirm`), reused by Categories first.
5. Categories page: Expenses/Income/Archived tabs, search, filters, sort (most used, A–Z), rows with icon/color/envelope/usage, Add/Edit dialog with icon + color pickers, Kakeibo default (expense only), appearance preview, archive/restore/delete confirmations; mobile 320/360/390 and desktop.
6. Appearance in Quick Add category chips and Activity rows (from persisted data only); Dashboard legends later.
7. Navigation: keep the existing five-column bar with More; verify Dashboard placement, active state, 320px; no extra tabs.
8. Tests: unit, backend, migration rehearsal, Playwright (new categories spec + axe), screenshots at 320/360/390/768/1024/1440.

Later phases (unchanged order): Dashboard rebuild after ADR-025; Overview polish; Kakeibo tabs and removal of the duplicate suggestions editor only after Categories works; Accounts toolbar/details drawer; Activity integration.

## E. Branch dependency map

```
main ── PR #25 (feat/frontend-moki-integration: nav, icons/008, dashboard, Moki)  [draft, open]
          └─ merge ◄── feat/ui-redesign-transaction-dialog (Phase 2, local)   [clean trial merge]
                └─ feat/ui-redesign-categories-nav (Phase 3: 009, Categories, nav)   [needs ADR-026]
                      └─ feat/ui-redesign-dashboard (Phase 4a: two scopes, charts)    [needs ADR-025]
```
