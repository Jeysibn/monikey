# Milestone 4.8 — The data-source seam (S1 of the API client plan)

**Historical milestone status:** implemented and verified at S1; later committed in `a7c1d37`. At the time of the original report, it was awaiting review and the working tree had HEAD `f3eb65f`. This report describes S1 only; S2/S3 are recorded separately. No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`API_CLIENT_PLAN.md`](API_CLIENT_PLAN.md) §3 · [`CODEX_REVIEW_BRIEF_4_8.md`](CODEX_REVIEW_BRIEF_4_8.md)

## 1. What changed
**Before:** `App` held the whole mock ledger and every screen and helper worked figures out from raw rows. **After:** screens read what a `DataSource` reports, and send it writes.

```
App ── useResource ──► DataSource ◄── createMockSource()   (demo/tests)
 │                          ▲
 └ dialogs ── saveEntry / deleteEntry / addAccount          ◄── httpSource (implemented in S3)
```

| Piece | What it is |
|---|---|
| `src/dataSource.ts` | The `DataSource` interface (`today`, `loadAccounts`, `loadCategories`, `loadSummary`, `loadActivity`, `saveEntry`, `deleteEntry`, `addAccount`), `ApiError` (`status`, `code`, `field`, safe `message`), `isNotFound`, and the spec's failure messages |
| `src/mockSource.ts` | The mock behind the seam: keeps the fictional ledger in memory, applies writes with the same reducer, answers on a later turn (so screens must cope with "not loaded yet"), can fail the first write once (`?demo=save-error`), throws `ApiError` 404 and 409 the way the API will |
| `src/useResource.ts` | One piece of server data: `useState` + `useEffect` + `AbortController` (TLD §4), fetch on a new key or a new `version` (after a write), ignore stale replies, keep the previous data on screen while the next arrives |
| `LedgerSnapshot` (types) | Accounts (`id`, `name`, `type`, **no opening values**), liquid balances, cards with `signedDebt`, `owed`, `credit`, `creditLimit`, `availableCredit`, and categories: the API's shape per Codex's answers (B4) |
| `ActivityItem.entry` | The stored entry in form shape, so Edit and Delete need no lookup |
| `lib/snapshot.ts` | Three lookups on a snapshot; nothing calculates |
| `lib/entryText.ts` | The confirmation message and the delete texts, now reading a snapshot (moved out of `lib/ledger.ts`) |

- **Rules, forms and messages** (`entryForm`, `accountForm`, `entryText`, the dialogs) read a snapshot, never `MockData`. `lib/finance.ts` and `lib/ledger.ts` are now the mock's engine only; `buildSnapshot()` is where the mock turns rows into the API's shape.
- **Writes** (spec §7): the source writes, the app **fetches the figures again**, builds the confirmation from the fresh ones, bumps a `version` so every screen refetches, then closes the dialog. No optimistic updates. Not-found on delete shows "It was already deleted."
- **State lives in `App`** per resource, so switching screens keeps the last data and does not flash a skeleton.
- **Account filter, month and page size** stay in `App` (page size resets when a filter changes, as before).

## 2. The one deliberate visible change
The credit-crossing wording in a delete confirmation is now labelled, as the owner decided for F1 (Q4 extended to these texts): "Everyday Card goes from ₱13,200.00 card credit to ₱6,800.00 owed **(estimate)**." Only that case; texts that are exact do not carry the label. Besides that, the first paint now shows the loading skeleton for a moment while the first figures arrive (the same skeleton `?demo=loading` already showed).

## 3. Verification (exact results)
- `npm test`: **142 tests, 142 pass, 0 fail** (13 new in `tests/dataSource.test.ts` for the seam, 23 more for the review fixes below: reads in the API's shape with no opening values, answers arrive on a later turn, activity paging and filtering with the entry carried, writes visible in the next reads, the confirmation from fresh figures, 404 and 409 as `ApiError`, `failNextWrite` once per write kind, no change when a write fails; the two rule test files, `entryForm.test.ts` and `accountForm.test.ts`, were moved onto snapshots and still prove every rule; the delete text test now expects "(estimate)").
- `npx tsc -b --noEmit`: no errors. `npm run lint`: no findings. `npm run build`: succeeds (363 kB JS).
- Browser harnesses against the Vite dev server, **unchanged**: overview 177/177, accounts 108/108, activity 64/64 (6 new checks for the row cap), quickadd 83/83, edit 57/57, account 47/47. Audit (`audit-a11y.cjs`): 0 findings, 243 checks.
- Apart from the new row-cap checks, the harnesses and the audit pass without edits; that is the evidence of "no visible change"; it is not a pixel comparison.

## 3a. Codex review fixes (before commit)
| # | Finding | Fix |
|---|---|---|
| 1 | `formatPeso` refused values above 2^52 − 1, but a display-only estimate (for example a delete that adds a payment to a card holding the largest credit) can legitimately exceed the bound and would have thrown during render | The bound now applies to values that **enter** the client (`isMoney`, for the S3 mapper); `formatPeso` needs only a safe integer, so any intermediate result prints exactly (`2^53` is still refused). Boundary tests: sums of two accepted values, a delete text beyond the bound |
| 2 | New mock entries had the `Z` sliced off, against contract B3 (ISO 8601 with a UTC offset) | New entries use the full `toISOString()`; all seeded timestamps now end in `.000Z`; the activity sort uses `compareTimestamps` (`lib/timestamp.ts`): whole seconds are compared as instants with the UTC offset applied, then the fractional digits are compared digit by digit (up to nanoseconds, missing digits count as zeros), so **microseconds (PostgreSQL `TIMESTAMPTZ`) are never rounded away**. A first version used `Date.parse` (millisecond precision); Codex's second review caught that two entries differing only below a millisecond tied and fell through to the source tie-break, out of order. Tests: every stored timestamp matches the format; an entry added now sorts newest among same-day entries; and `tests/timestamp.test.ts` (9 tests: `.123100Z` against `.123900Z` across a transaction and a payment in both orders, offsets, day and month boundaries, ties, text fallback), proved to fail on the `Date.parse` version |
| 3 | A resource's error stayed visible while the next request was pending | A failure is tied to its key and version (`deriveResource`, tested: a different key or a new version hides it and shows the next request as pending) and is forgotten as soon as a new request starts |
| 4 | "Load more" had no end, beyond the agreed API maximum | `nextPageSize` stops at 1000 rows; at the cap the footer says "Showing the latest 1000. Choose a month or an account to narrow this." `?demo=huge` (1,218 entries) proves it in the browser |

## 4. Not verified / limitations
- No pixel-for-pixel comparison with 4.7; real devices, Firefox/WebKit and screen readers still unchecked (see `REAL_DEVICE_CHECKLIST.md`).
- Loading is a skeleton with no timeout, no error screen and no "Updating…" stamp: S2. `useResource` already records `error` and `stale`, but nothing shows them yet.
- While accounts load, **Add transaction** is enabled and does nothing until they arrive (a moment with the mock); S2 disables it with a reason.
- `?demo=` hooks and the mock are still in the production bundle (decision F3: compile out when the real client is chosen).
- The previously stale-looking figure when a month changes (old month's numbers for the instant before the new reply) is invisible with the mock; S2 labels it.

## 5. Next
This original next-step note is superseded: S2 is implemented in [Milestone 4.9](FRONTEND_STATES_4_9.md), and S3 is implemented in [FRONTEND_API_CLIENT_S3.md](FRONTEND_API_CLIENT_S3.md). S4 requires a running backend for end-to-end verification.
