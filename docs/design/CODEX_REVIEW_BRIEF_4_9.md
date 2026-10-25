# Review Brief for Codex — Milestone 4.9 (loading, error and slow states)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**Second round:** your three items were fixed (§3a of the record): Retry moves focus to a stable heading (`lib/focus.ts`, `focusAfter` on `ErrorBlock`/`InlineFailure`); the screens read the accounts' figures and the summary as separate resources so each failure and time stays with its own request (categories fail on their own, in a banner); only one copy of a repeated failure is a live alert. Please re-check those and the checks in `verify-states.cjs` ("Failures stay with the request that failed", "Retry keeps keyboard focus").

**What to review:** `git diff HEAD` plus the new files (`components/ErrorBlock.tsx`, `lib/apiErrors.ts`, `lib/time.ts`, `useDelayedFlag.ts`, `components/addState.ts`, `tests/apiErrors.test.ts`, `scripts/verify-states.cjs`). HEAD is `a7c1d37`. Record: `docs/design/FRONTEND_STATES_4_9.md`. Spec: `UI_UX_SPEC.md` §4–§7.

## Evaluate
1. **`useResource` correctness** — tokens (version and retry count), a failure shown only for the request that is wanted, the render-phase reset of the failure when a new request starts, `retry`, keeping previous data while the next arrives. Any race (a reply for an abandoned request, a retry while one is in flight, the same key after a write)? Is `deriveResource` still sound with `updatedAt` taken from the data on screen, which may belong to an older request?
2. **Error mapping** (`describeWriteError`) — status to message per context against the spec's table and N1; nothing from a 5xx or a thrown network error reaches the screen; 404 on delete closes the dialog; the field names a form can show (`inline` for a 409, highlighted for a 422). Do the form field names (`amount`, `name`, …) need a wire-name mapping that S3 must own?
3. **Failure blocks** — `ErrorBlock` (role `alert`, named Retry, "Last updated" only when data ever loaded), per-block independence on Overview (summary / cards / recent / "This month" note), the combined snapshot resource in `App` (accounts and categories as one), Accounts showing one failure for two requests. Anything that hides a failure or shows stale numbers as current?
4. **Add transaction states** — `AddState` (`ready`, `loading`, `no-accounts`): disabled with no reason while loading, "Add an account first" only for a ledger with no accounts; the demo `loading` also keeps it disabled. Is a disabled control with no text reason acceptable while loading (it lasts as long as the first answer)?
5. **Timing** — "Updating…" after 400 ms and the slow notice after 15 s through `useDelayedFlag` (cleanup resets the flag); Save, Escape and outside clicks stay inert while saving. Anything that can leave the dialog stuck (a write that never answers; there is no timeout yet)?
6. **The mock's demo behaviours** — `once` per distinct request, `second` per kind, `always`, abandoned requests not counted; are they faithful enough to trust the harness, and not leaking into production behaviour?
7. **Accessibility** — alerts announced once, Retry targets 44px, the failure blocks in the audit (`?demo=offline`), focus after Retry and after a refused field, the status regions that stay in the page.
8. **Scope** — no new dependency; the API client is untouched.

## Known limitations (not discoveries)
The 15-second notice is browser-tested for Quick Add only; no request timeout yet; the mock and `?demo=` hooks are still in the production bundle (F3, with S3); no real-device, other-browser or screen-reader testing.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
