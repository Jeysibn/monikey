# Review Brief for Codex — Milestone 4.5a (Quick Add and Pay card)

**Read-only.** Do not edit files or install anything. **Do not run `npm run build` or `npm ci` in `frontend/` while Claude Code may be editing.** Safe: `git diff HEAD`, `git status`, `npm test`, `npx tsc -b --noEmit`, `npm run lint`.

**What to review:** `git diff HEAD` plus new files (`lib/entryForm.ts`, `lib/ledger.ts`, `TransactionForm.tsx`, `QuickAddDialog.tsx`, tests, `verify-quickadd.cjs`). 4.4 is committed (`cbaf492`). Record: `docs/design/FRONTEND_QUICKADD_4_5A.md`. Spec: `UI_UX_SPEC.md` §7–§8.

## Evaluate
1. **Financial correctness (most important)** — `ledgerReducer`, `toAction`, `saveMessage`. A card purchase is an expense and raises debt; a card payment lowers the paying account and the debt and is NOT an expense. Net position, monthly expenses and "money you have" after each kind. Overpayment becomes card credit (not negative "owed"). Any path where a payment could be counted as an expense, or money added in the browser as a total?
2. **Amount handling** — `parseAmount`: string arithmetic, ≤2 decimals, limits (`NUMERIC(12,2)`), comma rules, `Number(digits) * 100` for up to 12 digits (safe integers?). Edge cases I missed?
3. **Form rules** — `validate`, `switchKind`, `accountsFor`: a card can never be the payer or a deposit target; a payment's counterpart is always a card; category type must match the kind.
4. **Display-only estimates (owner decision Q4)** — `previewFor` and `notices`: whole-centavo comparisons only, never saved, labelled "estimate". Wording and the overpay/credit case.
5. **Accessibility** — focus (Amount first; summary on failed submit; return to opener; `h1` fallback), `aria-invalid`/`aria-describedby`, radios for type and category, disabled fieldset while saving, status message live region, 44px targets (close button changed), the blur-validation rule (only edited fields) and why.
6. **Closing and saving rules** — Escape/outside click while saving or dirty; failed save keeps input; `?demo=save-error`.
7. **Architecture** — `useReducer` in `App` (no store library), account filter lifted to `App`, no dependency, no persistence; is the split between pure rules and components right? Anything over-built (e.g. `SegmentedControl`, `InlineNotice`, `describedBy.ts`)?
8. **Contract** — does this shape (action objects, a confirmation built from post-save data) map cleanly onto `POST /api/transactions` and `POST /api/credit-card-payments` plus a re-fetch? B1–B4 are still unconfirmed with the backend.

## Known limitations (not discoveries)
Edit, Delete and Add account are not built (4.5b+); no real-device, Firefox/WebKit or screen-reader testing; no persistence; 15s "slow save" notice not built; `?demo=` hooks in the bundle.

## Report format
Most severe first: file + line, what is wrong, why it matters, a concrete fix, blocker / should-fix / nice-to-have. Say what you could not check.
