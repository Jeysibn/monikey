# Milestone 4.9 — Loading, error and slow states (S2 of the API client plan)

**Historical milestone status:** implemented and verified at S2; committed as `6a04f46`. At the time of the original report, it was awaiting review and the working tree had HEAD `a7c1d37`. S3 is now implemented separately in [FRONTEND_API_CLIENT_S3.md](FRONTEND_API_CLIENT_S3.md). No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §4–§7 · [`FRONTEND_SEAM_4_8.md`](FRONTEND_SEAM_4_8.md) · [`CODEX_REVIEW_BRIEF_4_9.md`](CODEX_REVIEW_BRIEF_4_9.md)

## 1. What a person now sees
| Situation | What shows |
|---|---|
| A block cannot load | **Only that block** shows "Couldn't load your summary. **Last updated 09:14.**" (the time is left out when nothing ever loaded) and **Retry** (named, e.g. "Retry loading your summary"); the rest of the screen stays. Overview has four independent blocks: summary, credit cards, recent activity, and "This month", which says "Not available until your summary loads." instead of showing zeros. Activity shows the failure in the list with the filters still usable. Accounts shows it in both sections, and one Retry asks again for whatever failed |
| Retry | Asks again; the message goes while the request is out; a second failure shows it again (no spinner forever, no blank) |
| A list or a figure is being replaced | The previous data stays on screen; after **400 ms** a quiet "Updating…" appears (a fast answer shows nothing, so nothing flickers) |
| Before the accounts have loaded | **Add transaction is disabled** (bottom-bar Add and the header button) and still reads "Add transaction"; "Add an account first" is only for a ledger that really has no accounts |
| A save, delete or new account takes over **15 seconds** | A warning notice: "This is taking longer than usual. Keep this open; your entry is still here." (delete: "…Keep this open."). Save stays disabled, Escape and outside clicks stay ignored |
| The server refuses a write (422) | "Some details aren't valid. Check the highlighted fields." at the top, the refused field highlighted with "Check this field." and given focus; everything typed is kept; editing that field clears the mark |
| A duplicate name (409) | The server's message **under Name**, not repeated at the top |
| A write fails (5xx or no answer) | The spec's text for saving or deleting; no server details ever reach the screen |
| 404 | Add: "That account or category no longer exists. Reload and try again."; edit: "This entry was removed, maybe in another tab. Your changes are still here."; delete: "It was already deleted." and the dialog closes |

## 2. How it is built
- **`useResource`** now returns `retry()` and `updatedAt`; each request has a token (version and retry count), so a failure shows only while that request is the one wanted and is forgotten when a new one starts (`deriveResource`, tested).
- **`ErrorBlock`** and **`UpdatingStamp`** (`components/ErrorBlock.tsx`); `useDelayedFlag` makes a short wait show nothing.
- **`lib/apiErrors.ts`**: `describeWriteError(err, context)` turns an `ApiError` into a `WriteError` (message, form field, whether the message belongs under the field, whether the entry is gone); `loadFailureText`; the 15-second constants. **`lib/time.ts`**: `formatClock`.
- **`AddState`** (`ready`, `loading`, `no-accounts`) replaces the boolean that turned Add transaction off.
- **Forms** (`TransactionForm`, `AccountForm`, `DeleteConfirm`) show the slow notice; the two forms show a refused field.
- **Mock demos** (`createMockSource` options, chosen in `App` by `?demo=`):

| Demo | Behaviour |
|---|---|
| `load-error` | each distinct request fails once (its first answer), then works |
| `flaky` | the second answer of each kind fails once (shows "Last updated") |
| `offline` | every read and every write fails |
| `slow` | reads take 1.5 s, writes 16 s |
| `invalid` | the first save or new account is refused with a 422 and a field |
| `save-error` | (from 4.5) the first write fails once |

A request that is abandoned (React's development double-mount, a quick change of month) is **not counted**, so the demos behave the same in development and production.

## 3. Verification (exact results)
- `npm test`: **159 tests, 159 pass, 0 fail** (17 new: resource states incl. `updatedAt` and retry, the write-error mapping per status and context with no server details leaking, "Last updated", the clock, every demo behaviour of the mock including abandoned requests, 422 field, delays).
- `npx tsc -b --noEmit`: no errors. `npm run lint`: no findings. `npm run build`: succeeds.
- Browser harnesses: **states 71/71 (new)**, overview 177/177, accounts 108/108, activity 64/64, quickadd 83/83, edit 57/57, account 47/47. Audit (`audit-a11y.cjs`): **0 findings, 246 checks** (now also checks contrast of the failure blocks under `?demo=offline`).
- The `states` harness covers: each failed block alone and its Retry (Overview, Activity, Accounts); "Last updated" from the real clock; Retry failing again under `offline`; Add disabled while loading and not saying "account first"; no "Updating…" after 150 ms, "Updating…" after 600 ms with the old list kept, the stamp gone when the reply lands; a 16-second save showing the notice after 15 seconds with Save and Escape inert, then closing with the one message; a 422 on a transaction and on an account; failure blocks fit and Retry is 44px at 320, 375, 768 and 1280.
- Screenshots: `docs/design/screenshots/m4-9/`.

### Codex review fixes (before commit)
| # | Finding | Fix |
|---|---|---|
| 1 | **Retry could lose keyboard focus**: clicking it removes the failed block (a new request starts), unmounting the focused button | Retry first moves focus to a stable heading near the block (`focusAfter`: the card title, or the page `h1`) through `moveFocusTo`, which focuses at once and again after the re-render if focus was lost (the Accounts headings are re-created by that render). Card titles that serve as targets are focusable with `tabIndex={-1}`. Keyboard checks (Enter and Space on Retry) for Overview's three blocks, Accounts and Activity prove focus never lands on `body` |
| 2 | **A failure could show the wrong error and the wrong time.** The accounts and the categories were combined, and Accounts then combined that with the summary and called either failure "accounts", with a time from whichever request had succeeded; a categories failure hid account figures and looked like a credit-card failure | The screens now take the **accounts' figures** (`Resource<AccountsSnapshot>`) and the summary as separate resources; each failure and each time stays with the request that failed. A summary failure on Accounts shows the rows and cards and replaces **only the two totals** with "Couldn't load the totals. Retry" (no borrowed "Last updated"). A categories failure is its own banner ("Couldn't load the categories."); it keeps Add transaction off but never touches the figures. `?failing=summary|accounts|categories|activity` (with `load-error`, `flaky` or `offline`) makes only those reads fail |
| 3 | Accounts announced the same failure twice (two `role="alert"` copies) | Only one copy is live (`live` on `ErrorBlock` and `InlineFailure`); the second section's copy is silent. A browser check counts the live alerts |

### Found by the checks (my own bugs)
| Problem | Fix |
|---|---|
| `?demo=load-error` showed no failure: the demo counted React's abandoned development request as "the first call" | The mock counts only answers that are still wanted; "once" is per distinct request |
| Overview and audit harnesses read the page the instant it loaded, now catching Add transaction between disabled and enabled (a 150 ms colour fade) | Both wait for the page to settle |

## 4. Differences from the spec
| Difference | Why |
|---|---|
| "Not available until your summary loads." in *This month* when the summary fails | The spec's single message covers the summary; two Retry buttons for one failed request would be noise |
| "Check this field." under a refused field | The spec says "highlighted"; colour is never the only signal, so the field also says it in words |
| "Updating…" appears after 400 ms | Avoids a flash for fast replies |
| Slow-save wording (the spec gives only "This is taking longer than usual…") | Added "Keep this open; your entry is still here." |

## 5. Not verified / limitations
- The 15-second notice is proved in the browser for **Quick Add** only; Add account and Delete use the same hook and notice but were not run for 16 seconds each.
- A 409 under a field cannot be produced from the UI on the mock (the form blocks duplicates first); it is covered by the mapping tests and shares the 422 code path.
- At the time of this milestone, no timeout existed for a request that never answers; S3 now gives reads a 30-second timeout. Writes remain open after the slow-save warning because a client timeout cannot establish whether the server committed.
- Real phones, Firefox/WebKit, screen readers: still the checklist in `REAL_DEVICE_CHECKLIST.md` (including how the new alerts are read).
- The default mock build includes `?demo=` hooks. An HTTP production build now tree-shakes the mock and demo hooks, per F3 (verified in the S3 report).

## 6. Next
S3 is implemented in [FRONTEND_API_CLIENT_S3.md](FRONTEND_API_CLIENT_S3.md) and verified against synthetic responses. S4 still needs a running backend and shared fixtures for end-to-end verification.
