# Review Brief for Codex — Milestone 4.3 (Accounts screen)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**What to review:** `git diff HEAD` (the Milestone 4.1–4.2 state is committed at `HEAD`; 4.3 is the uncommitted working tree: 5 modified + 3 new files). Record: `docs/design/FRONTEND_ACCOUNTS_4_3.md`. Spec: `docs/design/UI_UX_SPEC.md` §6.

## Evaluate
1. **Financial correctness** — `liquidAccounts()` in `src/lib/finance.ts`: only cash/bank/e-wallet, ordered Cash → Bank → E-wallet then id, balances from `liquidBalance`; the section subtotals come from `summarize()` (money you have = Σ non-card balances; money you owe = Σ max(signed debt, 0)); an overpaid card shows credit but is not subtracted from "owed". Check the 8 new tests in `tests/finance.test.ts` and the two new demo scenarios (`over-limit`, `paid-off`) in `src/mockData.ts`. Is `available_credit ≤ 0 → "No credit available"` consistent with the TLD whichever sign the API uses?
2. **TypeScript** — strict is now explicit; any unsafe casts? (`AccountRow` narrows `account.type` with `as keyof typeof types`: acceptable, or should the type exclude `credit_card`?)
3. **Simplicity** — one new view and one new row component; `CreditCardSummary`, `MoneyText`, `EmptyState` and `PageHeader` are reused unchanged. Anything over-built? Is the duplicated "Add account" button (own row on phones, header from 768px, one hidden by CSS) acceptable?
4. **Dependencies** — expect none; `package.json` and the lockfile are unchanged from `HEAD`.
5. **Accessibility** — labelled regions, real list, text equivalents on the limit tracks, "Below zero" is words + icon, the "₱21,050.00 owed" spacing fix, disabled Pay card states with a visible reason, first-run single primary, focus return to the exact opener after the stand-in dialogs.
6. **Design consistency** — differences from the mock are listed in §4 of the record (Add account row on phones, compact card tile, first-run primary). Agree they are intentional?
7. **Architecture** — still no router, store, data library or persistence; stand-ins only; backend stays authoritative.

## Known limitations (not discoveries)
Activity, Quick Add and the load-error state are not built; Add/Pay actions are stand-ins; no real-device, Firefox/WebKit or screen-reader testing; the `?demo=` hook is in the bundle.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, and blocker / should-fix / nice-to-have. Say what you could not check.
