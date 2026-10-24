# Milestone 4.5b — Edit and Delete

**Status: implemented and verified; awaiting Codex review. Left uncommitted on purpose** (4.5a is committed as `2a0d6a0`). Scope: `UI_UX_SPEC.md` §10 (and the edit parts of §7). **Not built:** Add account (still a stand-in), the 404 paths in the browser (unit-tested only: a mock has no second tab). No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §10, §12 (U4, U5) · [`FRONTEND_QUICKADD_4_5A.md`](FRONTEND_QUICKADD_4_5A.md) · [`CODEX_REVIEW_BRIEF_4_5B.md`](CODEX_REVIEW_BRIEF_4_5B.md)

## 1. What was implemented
- **Edit** (same `TransactionForm`, `mode="edit"`): opens from a phone row tap or a desktop row's Edit icon, titled "Edit expense / income / card payment", fields pre-filled, the type shown as a label (not a switch). Footer: **Delete** (text, negative colour, left) · **Cancel** · **Save changes**. The double-count hint, **Pay full**, "Owed now", the estimate preview and the warnings are **hidden** (they would include the entry being edited), and account options show names only, not balances, for the same reason.
- **Save** keeps the entry's id and creation time; one confirmation ("Expense saved: …", built from the post-save figures); focus returns to the same row; if the change moves the entry out of view, "It's hidden by your filters." + **Show it** (same message as 4.5a).
- **Delete confirmation** (`DeleteConfirm`): names the entry (`Lunch with team · −₱385.00 · Oct 24, 2026 · GCash`) and what changes, in the spec's words per kind (expense on cash / on a card, income, card payment). The "this month's …" clause is left out for an entry outside the month being viewed. **Cancel has focus first**; the delete button is "Delete expense / income / payment" in the error colour.
- **Two ways in:** from the edit form, Delete **swaps the content** of the same dialog (no second dialog); Cancel returns to the form with everything typed still there and focus on its Delete button. From a desktop row's Delete icon the dialog opens **straight on the confirmation**; Cancel or Escape closes it and focus returns to that icon.
- **After delete:** "Expense deleted." / "Income deleted." / "Card payment deleted."; the opener row is gone, so focus moves to the page heading.
- **Failure and stale entries:** `?demo=save-error` now fails the first save **or** delete once ("Couldn't delete. Nothing was changed. Try again." keeps the dialog open). In the code, saving an entry that no longer exists throws "This entry was removed, maybe in another tab. Your changes are still here."; deleting one says "It was already deleted." and closes.
- **Ledger:** `update-transaction`, `update-payment`, `delete-transaction`, `delete-payment`; an update or delete of a missing id leaves the data untouched (the reducer returns the same object).

## 2. Files
```
frontend/src/lib/ledger.ts               + edit/delete actions, toUpdateAction, toDeleteAction, targetOf, entryExists, entryValues, deleteSummary
frontend/src/lib/entryForm.ts            accountOptionLabel(withFigures)
frontend/src/lib/finance.ts              + formatDate
frontend/src/components/TransactionForm.tsx  edit mode, hidden prop, Delete button
frontend/src/components/DeleteConfirm.tsx    new
frontend/src/components/QuickAddDialog.tsx   hosts form and confirmation; session = { mode, values, target?, confirmFirst? }
frontend/src/App.tsx                     session state, openEdit, saveEntry(target), deleteEntry; stand-ins removed
frontend/tests/entryForm.test.ts         + 9 tests
frontend/scripts/verify-edit.cjs         new browser harness (57 checks)
frontend/scripts/verify-activity.cjs     stand-in check updated to the real confirmation
```

## 3. Verification (exact results)
- `npm test`: **92 tests, 92 pass, 0 fail** (10 new: loading values, edit re-derives balances and totals, moving an expense to a card, editing a payment keeps expenses and net position, **add then delete returns exactly to the starting figures**, missing-entry detection, the delete wording per kind, the monthly clause, **cards in credit**).
- `npx tsc -b --noEmit`: no errors. `npm run lint` (oxlint): no findings.
- Browser harnesses against the Vite dev server (Chromium on this machine): **edit 57/57, quickadd 83/83, activity 58/58, accounts 108/108, overview 177/177.**
- Facts checked in the browser: editing an expense changes the right balance and the month's expenses by the difference; editing a payment leaves expenses and net position alone; deleting an expense lowers expenses and raises net position by its amount; deleting a payment leaves expenses and net position unchanged, raises Money you have and the card's owed by the amount.
- Not run: `npm run build`. Screenshots: `docs/design/screenshots/m4-5b/`.

### Found and fixed by the checks
| Problem | Fix |
|---|---|
| Codex: the delete text said a card's "owed" moves by the full amount, which is false when the card is in credit before or after (e.g. `?demo=overpaid`: deleting the ₱20,000 payment leaves ₱6,800 owed, not +₱20,000) | When the card is on one side of zero the plain wording stays (exact); otherwise the text states the real before and after ("goes from ₱13,200.00 card credit to ₱6,800.00 owed"); unit tests cover credit-crossing and exactly-zero cases |
| Codex (nice-to-have): deleting a missing id returned a new object | The reducer now returns the same object, asserted in a test |
| (Test bugs only) a wrong expected figure for an edited payment; selectors matching the hidden form's duplicate Cancel button and footer; one check that could never fail | Corrected: the check now asserts focus lands on the page heading |

## 4. Intentional differences from the spec
| Difference | Why |
|---|---|
| Account options in edit mode show names only | Balances and available credit already include the entry being edited |
| The warnings (not only preview and Pay full) are hidden in edit mode | Same reason |
| The form stays mounted (hidden) behind the confirmation | So Cancel can return to it with the typed changes intact |

## 5. Not verified / limitations
- The 404 messages are only unit-tested at the reducer/`entryExists` level and wired in `App`; they cannot occur in a one-tab mock.
- Real phones, Firefox/WebKit, screen readers; the confirmation-over-form swap was not checked with a screen reader.
- Deleting is permanent (no undo, per v1 decision F5). No persistence.

## 6. Next
Add account (§9), then the load-error states and the real API client. Before integration, settle B1–B4 with Codex.
