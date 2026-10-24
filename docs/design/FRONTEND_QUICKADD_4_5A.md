# Milestone 4.5a — Quick Add and Pay card (first write path, on mock data)

**Status: implemented and verified; awaiting Codex review. Left uncommitted on purpose** (4.4 is committed as `cbaf492`). Scope: `UI_UX_SPEC.md` §7 and §8 for **adding** an expense, income or card payment. **Not built (4.5b):** the edit form, the delete confirmation (Edit and Delete still open stand-ins), Add account. No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §7–§8, §12 (journeys U1–U3, U8) · [`DESIGN_REVIEW.md`](DESIGN_REVIEW.md) (Q4 approved) · [`CODEX_REVIEW_BRIEF_4_5A.md`](CODEX_REVIEW_BRIEF_4_5A.md)

## 1. What was implemented
- **State:** `data` moved from `useState` to `useReducer(ledgerReducer)` in `App`. The reducer stands in for the API's writes; every screen reads the same data, so a save updates Overview, Activity and Accounts together. A reload restores the starting data (no persistence).
- **One form, three kinds** (`TransactionForm`): Expense / Income / Pay card segmented control; fields per kind in the spec's order; category as tap-to-select chips; native date; note.
- **Rules** (`lib/entryForm.ts`, pure and tested): amount parsing with string arithmetic (no floats), the spec's validation messages word for word, type switching (keeps amount, date, note; clears category; clears an account that no longer fits), account lists per field (a card can pay nothing, a payment goes only to a card).
- **Help before saving:** the "Use Pay card" double-count hint; helper lines; **Pay full ₱X** (from the owed figure); a labelled **estimate** preview for a card payment and for a purchase on a card; non-blocking warnings (overpay becomes card credit, source below zero, over available credit). All display-only (owner decision Q4).
- **Validation UX:** errors on blur of a field the person has **edited**, and on submit; a failed submit shows "Fix N things to save", moves focus to it, and each item moves focus to its field; fields get `aria-invalid` and `aria-describedby`.
- **Submission lifecycle:** fields disabled and "Saving…" while saving; Escape and outside clicks ignored while saving; a failed save keeps everything typed and shows the spec's notice (`?demo=save-error` makes the first save fail so this can be seen); success closes the dialog, returns focus to the opener and shows **one** confirmation built from the post-save figures, e.g. "Card payment saved: ₱5,000.00 from Main Savings to Blue Card. Blue Card now owes ₱9,250.00. Card payments don't count as expenses and don't change your net position."
- **Remembered for this visit only:** the last account used and the last "pay from" account; the category is deliberately not remembered.
- **Closing rules:** a click outside closes only an untouched form; Cancel and ✕ always close (not while saving).
- **Hidden by filters:** on Activity, a saved entry outside the month or account filter appends "It's hidden by your filters." to the same message with a **Show it** button. The account filter moved from `ActivityView` into `App` for this.
- **Close button** of every dialog is now 44px (was 36px) after the touch-target check.

## 2. Files
```
frontend/src/lib/entryForm.ts            new: parse, validate, switch, preview, notices (pure)
frontend/src/lib/ledger.ts               new: reducer, toAction, saveMessage (pure)
frontend/src/lib/describedBy.ts          new: aria-describedby ids
frontend/src/components/TransactionForm.tsx  new: the form (add mode)
frontend/src/components/QuickAddDialog.tsx   new: dialog + closing rules
frontend/src/components/SegmentedControl.tsx, FormField.tsx, InlineNotice.tsx, StatusMessage.tsx   new, small
frontend/src/App.tsx                     reducer, opener/focus, saveEntry, status message, demo=save-error
frontend/src/views/ActivityView.tsx      account filter now a prop
frontend/src/components/ui/dialog.tsx    close button 44px
frontend/src/components/CreditCardSummary.tsx  spacing fix (see §4)
frontend/tests/entryForm.test.ts         new: 29 tests
frontend/scripts/verify-quickadd.cjs     new: browser harness (83 checks)
frontend/scripts/verify-overview.cjs     stale placeholder check updated
```

## 3. Verification (exact results)
- `npm test`: **82 tests, 82 pass, 0 fail** (29 new: amount parsing and exactness, every validation message, type switching, account lists, preview, notices, reducer effects, confirmation messages).
- The accounting facts from §8 are asserted in both the unit tests and the browser: after a card payment **expenses and net position are unchanged**, Money you have falls by the amount, the card's owed falls by the amount; a card purchase raises expenses and lowers net position by the amount and does not change Money you have; the payment is an Activity "Payment" row, never an expense.
- `npx tsc -b --noEmit`: no errors. `npm run lint` (oxlint): no findings.
- Browser harnesses against the Vite dev server (Chromium on this machine): **quickadd 83/83, overview 177/177, accounts 108/108, activity 58/58.**
- Not run: `npm run build`.
- Screenshots: `docs/design/screenshots/m4-5a/`.

### Found and fixed by the checks
| Problem | Fix |
|---|---|
| **The first tap after opening was lost.** Leaving the untouched, empty Amount showed an error; the bottom-anchored sheet grew upward and moved the tapped control from under the finger. | Blur validates only fields the person has edited; submit still shows everything. |
| Dialog close button was 36px | 44px |
| My 4.4 over-limit icon change dropped the space before "·" ("Limit ₱30,000.00· Over your limit"); found only because I re-ran the 4.3 harness | Icon is now inline, space restored |
| Overview harness still expected the old Activity placeholder | Check updated |

## 4. Intentional differences from the spec
| Difference | Why |
|---|---|
| "Show it" instead of "Clear filters" after a hidden save | It must also move the month to the entry's month, so "clear" would be inaccurate |
| Blur validation only for edited fields | Avoids the layout-shift bug above |
| The 15-second "taking longer than usual" notice is not built | The mock answers at once; add with the real client |
| Preview/warnings only in add mode (edit does not exist yet) | Per spec they are hidden in edit mode anyway |

## 5. Not verified / limitations
- Real phones (virtual keyboard, `dvh`, scroll lock for the bottom sheet), Firefox/WebKit, screen readers. An error appearing on blur of an **edited** field can still move the sheet; only a real-device test will show whether that is a problem.
- Everything is the mock: the reducer does the accounting. FastAPI stays authoritative; the confirmation text will come from re-fetched server figures.
- No persistence; a reload resets the data. `?demo=` hooks ship in the bundle.
- Native `<select>` option groups and the native date input look different per browser.

## 6. Next
**4.5b — Edit and Delete** (the same form in edit mode, the delete confirmation with its per-kind effect text, 404 handling), then Add account. Before real integration settle B1–B4 with Codex.
