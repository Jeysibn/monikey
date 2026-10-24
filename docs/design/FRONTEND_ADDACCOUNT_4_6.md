# Milestone 4.6 — Add account

**Status: implemented and verified; awaiting Codex review. Left uncommitted on purpose** (4.5b is committed as `84db10a`). Scope: `UI_UX_SPEC.md` §9 and journey U7. After this milestone **every v1 write works on the mock** and no screen or dialog is a stand-in. **Not built:** account editing or deletion (v1 has none by design), the load-error states, the real API client. No backend, database, CI/CD, Kubernetes or GitOps file was touched. **No dependency changed.**

Related: [`UI_UX_SPEC.md`](UI_UX_SPEC.md) §9, §12 (U7) · [`FRONTEND_EDITDELETE_4_5B.md`](FRONTEND_EDITDELETE_4_5B.md) · [`CODEX_REVIEW_BRIEF_4_6.md`](CODEX_REVIEW_BRIEF_4_6.md)

## 1. What was implemented
- **Add account dialog** (a bottom sheet on phones, 500px dialog from 768px), opened from Accounts → Add account, the dashed **+ Add credit card** slot (opens on *Card*), or the first-run prompt on Overview.
- **Four types** (Cash, Bank, E-wallet, Card). Cash/Bank/E-wallet: **Name** + **Current balance (₱)**. Card: **Name** + **Credit limit (₱)** + **Amount you owe today (₱)**. Plain helper text under each money field, as in the spec. Switching type keeps the name.
- **Rules** (`lib/accountForm.ts`, pure, tested): name required, at most 60 characters, unique ignoring case and surrounding spaces; balance and amount owed may be `0.00` but not negative ("Use 0.00 or more."); the limit must be more than zero ("Credit limit must be more than ₱0.00."); all other money messages reuse the Amount ones. The API names (`opening_balance`, `opening_debt`, `credit_limit`) stay in the code; people see the plain labels.
- **Same form habits as Quick Add:** errors on blur only for fields the person edited, all on submit; a failed submit shows "Fix N things to save" and moves focus to it; fields disabled while saving; a failed save keeps everything typed (`?demo=save-error` now fails the first save, delete or new account once); Escape and outside clicks ignored while saving; an outside click is ignored once something is typed.
- **Success:** the dialog closes, **"Account added: Cash on hand."** is the one message, and the new account is in every screen at once. First run: the first account unlocks *Add transaction* (U7).
- **Totals behave correctly:** a cash/bank/e-wallet account adds its balance to Money you have and to net position (and is **not** income); a card adds its debt (net position falls by it) and its limit, and Money you have does not change.
- **Cleanup:** the stand-in dialog and its state were removed from `App`; `MoneyInput` is shared by Quick Add and Add account.

## 2. Files
```
frontend/src/lib/accountForm.ts          new: values, validation, toAccountAction (pure)
frontend/src/lib/ledger.ts               + add-account action
frontend/src/lib/entryForm.ts            parseMoney(allowZero); parseAmount is parseMoney(text)
frontend/src/components/AccountForm.tsx, AddAccountDialog.tsx, MoneyInput.tsx   new
frontend/src/components/SegmentedControl.tsx  compact mode for four options
frontend/src/components/TransactionForm.tsx   uses MoneyInput
frontend/src/App.tsx                     accountForm state, saveAccount; stand-in removed
frontend/tests/accountForm.test.ts       new: 11 tests
frontend/scripts/verify-account.cjs      new browser harness (47 checks)
frontend/scripts/verify-accounts.cjs     stand-in checks updated to the real dialog
```

## 3. Verification (exact results)
- `npm test`: **103 tests, 103 pass, 0 fail** (11 new: money fields, negative/zero rules, only the chosen type's fields are checked, name rules, ledger effect on every total for each type, first-run unlock, message).
- `npx tsc -b --noEmit`: no errors. `npm run lint` (oxlint): no findings.
- Browser harnesses against the Vite dev server (Chromium on this machine): **account 47/47, edit 57/57, quickadd 83/83, activity 58/58, accounts 108/108, overview 177/177.**
- Browser facts: first-run → add Cash on hand ₱4,811.75 → Money you have ₱4,811.75, Add transaction enabled, a first expense works; adding a card (limit ₱50,000.00, owed ₱11,972.75) raises *Money you owe* from ₱21,050.00 to ₱33,022.75, leaves Money you have unchanged and lowers net position by ₱11,972.75; a new bank account appears in Quick Add with its balance.
- Not run: `npm run build`. Screenshots: `docs/design/screenshots/m4-6/`.

### Found and fixed by the checks
| Problem | Fix |
|---|---|
| At **360px**, selecting "E-wallet" wrapped its label onto two lines (the check mark left no room). My first width check measured clipping, not wrapping, so it passed | Four-option control has no check mark (the raised outlined pill still marks the choice) and `nowrap`; the harness now also detects wrapped labels |
| The accounts harness still expected the old stand-in dialog text | Updated to the real dialog |

## 4. Intentional differences from the spec
| Difference | Why |
|---|---|
| No check mark on the four-option type control | Not enough width at 360px; selection is still a raised, outlined surface (not colour alone) |
| Duplicate-name check runs in the mock (and again at save) | The API's 409 will replace it; the same message will be shown |

## 5. Not verified / limitations
- Real phones, Firefox/WebKit, screen readers.
- Everything is the mock; the opening balance, debt and limit are the only account inputs v1 has. No edit or delete of accounts by design.
- `?demo=` hooks ship in the bundle. No persistence.

## 6. Next
The frontend screens are complete on mock data. Remaining before the product works end to end: the typed API client and load-error states (after B1–B4 are settled with Codex and the backend exists), then a full accessibility/responsive pass and a real-device check.
