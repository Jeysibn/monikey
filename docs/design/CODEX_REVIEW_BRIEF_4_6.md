# Review Brief for Codex — Milestone 4.6 (Add account)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**What to review:** `git diff HEAD` plus new files (`lib/accountForm.ts`, `AccountForm.tsx`, `AddAccountDialog.tsx`, `MoneyInput.tsx`, tests, `verify-account.cjs`). 4.5b is committed (`84db10a`). Record: `docs/design/FRONTEND_ADDACCOUNT_4_6.md`. Spec: `UI_UX_SPEC.md` §9.

## Evaluate
1. **Financial correctness (most important)** — `add-account` in `ledgerReducer` and `toAccountAction`: cash/bank/e-wallet opening balance feeds Money you have and net position and is not income; a card's opening debt feeds debt and net position and not Money you have; limit only for cards, null otherwise; `opening_balance = 0` for cards and `opening_debt = 0` for the others. Does this match the TLD's four-table model and the API's `opening_balance` / `opening_debt` / `credit_limit`?
2. **Validation** — `validateAccount`, `parseAccountMoney`: zero allowed for balance and owed, not for the limit; negatives refused with the spec wording; names (required, ≤60 after trimming, unique ignoring case and spaces — does that match what the database constraint will enforce?); only the chosen type's fields are validated.
3. **Reuse and simplicity** — `parseMoney(text, allowZero)` with `parseAmount` as a wrapper; `MoneyInput` shared with Quick Add; `AccountForm` follows the `TransactionForm` pattern (some duplication of the summary/saving/blur logic). Worth extracting a shared hook, or leave it?
4. **Accessibility** — focus (Name first; summary on failed submit; back to the opener, or the page heading when the first-run button disappears), `aria-invalid`/`aria-describedby` including the always-present helper, the four-option control without a check mark at 360px (is a raised outlined pill enough as a non-colour cue?), 44px targets.
5. **Closing and saving rules** — same as Quick Add; `?demo=save-error` fails the first write of any kind.
6. **Scope** — no account edit/delete, no new dependency; the stand-in dialog is gone from `App`.
7. **Contract** — does this map onto `POST /api/accounts` plus a re-fetch, with a 409 shown as the duplicate-name message?

## Known limitations (not discoveries)
No real-device, Firefox/WebKit or screen-reader testing; no persistence; API client and load-error states not built; B1–B4 unconfirmed with the backend.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
