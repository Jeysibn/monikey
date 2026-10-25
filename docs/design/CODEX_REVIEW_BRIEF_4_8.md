# Review Brief for Codex — Milestone 4.8 (the data-source seam)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**Second round:** your four items were fixed (§3a of the record): `formatPeso` accepts any safe integer while `isMoney` guards incoming values; new mock entries carry a full ISO timestamp with `Z` (seed data too; the sort compares instants); `deriveResource` ties a failure to its key and version; "Load more" stops at 1000 rows with the narrowing prompt. The merge comparator now keeps microseconds (`lib/timestamp.ts`, `tests/timestamp.test.ts`, including `.123100Z` against `.123900Z` across the two sources and a non-UTC offset). Please re-check those and the tests that cover them.

**What to review:** `git diff HEAD` plus the new files (`dataSource.ts`, `mockSource.ts`, `useResource.ts`, `lib/snapshot.ts`, `lib/entryText.ts`, `tests/dataSource.test.ts`). HEAD is `f3eb65f`. Record: `docs/design/FRONTEND_SEAM_4_8.md`. Plan: `docs/design/API_CLIENT_PLAN.md` §3 (step S1). It is a refactor: nothing should look different.

## Evaluate
1. **Does the seam match your contract answers?** `LedgerSnapshot` and `AccountsSnapshot` (liquid `balance` signed; cards `signedDebt`, `owed`, `credit`, `creditLimit`, `availableCredit`; no opening values), `FinancialSummary` incl. `cardCredit`, `ActivityItem` carrying the stored entry, `ApiError { status, code, field }` and the codes the mock throws (`not_found`, `duplicate_account_name`, `internal_error`). Anything that cannot be filled from the API as you specified it (B1–B4, N1–N8)?
2. **Financial correctness** — nothing computes a balance or a debt from rows outside `mockSource`/`finance`/`ledger`. The remaining browser arithmetic is display-only: previews, notices, and the delete/edit before-and-after text (now labelled "(estimate)" when it is worked out). Is there any place where a saved or shown total is still derived in the browser?
3. **Write flow** (`App.saveEntry`, `deleteEntry`, `saveAccount`) — write, then fetch the figures again for the confirmation, then bump `version`; what happens if the re-fetch fails after a successful write (it says "Saved." and the screens retry)? Not-found on delete; a failed write keeps the dialog open with its message.
4. **`useResource`** — keys, `version`, abort and stale-reply handling, keeping previous data while the next arrives, `null` key meaning "not needed". Any race or leak (for example the same key re-fetched after a write while an older reply is in flight)? Is `loader` held in a ref and updated in an effect acceptable here?
5. **Where state lives** — resources in `App` (so switching screens does not flash a skeleton), filters and page size in `App`. Is `App` getting too large, or is this the right place until S2?
6. **Module boundaries** — `lib/ledger.ts` is now the mock's reducer only; the text helpers moved to `lib/entryText.ts`; `mockSource` imports relative `.ts` paths so Node's test runner can load it. Any leftover coupling of UI code to `MockData`?
7. **Tests** — do the new tests prove the seam (shapes, later-turn answers, paging with the filter before the limit, 404/409/500, nothing changes when a write fails), or do they mostly re-test the mock? What is missing before the real client replaces the mock?

## Known limitations (not discoveries)
No error, slow or "Updating…" states yet (S2); Add transaction is enabled while the first figures load; the mock and `?demo=` hooks are still in the production bundle (F3); no real-device, other-browser or screen-reader testing; no pixel comparison with 4.7.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
