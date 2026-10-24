# Milestone 4.4 — Activity screen (list, filters, paging)

**Status: implemented and verified; awaiting Codex review. Left uncommitted on purpose** so it can be reviewed as `git diff HEAD` (4.3 is committed as `651d732`). Scope: `UI_UX_SPEC.md` §5. **Not built:** Quick Add / Pay card / edit form / delete confirmation (Edit and Delete open stand-in dialogs; 4.5), the load-error state, the "Updating…" stamp (there is no network yet). No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §5, §10 · [`DESIGN_REVIEW.md`](DESIGN_REVIEW.md) §5 (B1–B3) · [`CODEX_REVIEW_BRIEF_4_4.md`](CODEX_REVIEW_BRIEF_4_4.md)

## 1. What was implemented
- **Activity list** for one month, newest first, grouped by day (`Sat, Oct 24` headings, each an `h2` with its own `ul`).
- **Two native selects:** Month (shared with Overview) and Account ("All accounts", then cash/bank/e-wallet, then cards). Nothing else.
- **Count line** (`18 entries · October 2026`; `Latest 50 entries · …` when capped). It only counts; the browser never adds money.
- **Paging:** 50 per page; **Load more** adds 50 more. Changing month or account starts again at one page. Focus moves to the first new row so it is not lost when the button disappears.
- **Rows:** reuse `TransactionItem`. Phones: whole row is a button that opens Edit. From 768px: plain row with visible **Edit** and **Delete** icon buttons with specific names (e.g. "Delete Lunch with team, ₱385.00"). Both variants exist in the DOM but only one is displayed, so there is one control per action and no nested buttons.
- **States:** loading (6 grey rows, `aria-busy`), empty month ("No activity in October 2026." + Add transaction), empty filters ("Nothing matches these filters." + Clear filters), first run (disabled "Add an account first").
- **Stand-ins:** Edit/Delete open the same dialog as Quick Add, titled "Edit expense/income/card payment" or "Delete …", and focus returns to the exact button. The opener is passed in explicitly because Safari does not focus a button on click.

## 2. Files
```
frontend/src/views/ActivityView.tsx          new: the screen
frontend/src/components/TransactionItem.tsx  Activity mode (Edit/Delete)
frontend/src/components/MonthSelect.tsx      optional className
frontend/src/lib/finance.ts                  buildActivity(accountId), activityPage, dayHeading, groupByDate
frontend/src/mockData.ts                     demo scenario "many" (58 October entries)
frontend/src/App.tsx                         renders ActivityView; Edit/Delete stand-ins
frontend/src/views/PlaceholderView.tsx       removed (no longer used)
frontend/tests/finance.test.ts               +5 tests
frontend/scripts/verify-activity.cjs         browser harness (58 checks)
```

## 3. How the API contract (B1–B3) is honoured in the mock
| Contract | Where |
|---|---|
| B1 account filter on the server, **before** the limit; for a payment either side matches | `buildActivity(..., accountId)` filters raw rows before sorting and slicing |
| B2 ask `limit + 1`, show `limit`, extra row decides "Load more" | `activityPage()` |
| B3 order by date → `created_at` → source and id | unchanged tie-break in `buildActivity` (entries before payments, then id, all descending) |

Replacing the mock with the API changes `activityPage` only, not the view.

## 4. Verification (exact results)
- `npm test`: **53 tests, 53 pass, 0 fail** (5 new: account filter incl. both payment sides, filter-before-limit, paging and `hasMore` boundaries, empty results, day headings and grouping).
- `npx tsc -b --noEmit`: no errors. `npm run lint` (oxlint): no findings after removing one unused variable in the new script.
- Browser harness `scripts/verify-activity.cjs` against the Vite dev server (Chromium on this machine): **58/58 passed**. It covers values and order, filters, phone tap-to-edit, desktop buttons, focus return, Load more (50 → 58, rows do not move, focus on first new row), loading, first run, empty month, Overview → Activity, no overflow at 360/375/768/1280, no external request, no console error.
- `npm run build` was **not** run for this milestone.
- Screenshots: `docs/design/screenshots/m4-4/` (full-page captures draw the fixed bottom bar mid-page; that is an artefact).

### Found and fixed by the checks
| Problem | Fix |
|---|---|
| On desktop the empty-month state showed **two** filled primary buttons (header and empty block) | The empty-block button is secondary (same rule as 4.3) |
| Codex: after Load more, going to another month and back restored the old page size (58 rows, not 50) | The saved page size is reset in the same render when the month or account changes; harness now checks away-and-back |
| Codex: empty results had no count line | The count line shows for every loaded state, e.g. "0 entries · September 2026" |
| My first run reported 20 failures: a stale server on the port was still serving the old placeholder | Not a code bug; re-ran on a fresh port |

## 5. Not verified / limitations
- Real phones, Firefox/WebKit, screen readers; contrast not re-measured (same tokens as Overview).
- Load-error and "Updating…" states are not built. Edit and Delete are stand-ins; no data changes.
- `Overview`'s empty state has the same two-primary pattern on desktop (header + block); not changed here.
- The `Bar` loading helper now exists in three views; promote it to a component when a fourth needs it.
- `?demo=many` ships in the production bundle (tiny).

## 6. Next
**4.5 — Quick Add / Pay card / edit / delete**, the first work that changes data. Decide first to lift `data` into `useReducer` in `App`, and settle B1–B4 with Codex.
