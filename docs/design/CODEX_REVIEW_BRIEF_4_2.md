# Review Brief for Codex — Milestone 4.2 (application shell and Overview)

**You are the reviewer. Read-only.** Do not edit files, install anything, run `shadcn`, or change `backend/`, `database/`, CI/CD or GitOps. Claude Code owns the working tree; **do not run a build or test that writes into `frontend/dist` or `node_modules` while Claude Code is editing** (running `npm test` and `npx tsc -b --noEmit` is safe). Report findings only. Nothing has been committed.

**Scope under review:** `frontend/` — the app shell, typed mock data, financial helpers, and the Overview page. Activity, Accounts and Quick Add are **not** built (placeholders only).

## Read first
1. `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`
2. `docs/design/UI_UX_SPEC.md` §3 (shell) and §4 (Overview); `docs/design/FRONTEND_OVERVIEW_4_2.md` (what was built, decisions, verification)
3. Code, in this order: `frontend/src/types.ts` → `src/lib/money.ts` → `src/lib/finance.ts` → `src/mockData.ts` → `frontend/tests/finance.test.ts` → `src/components/*.tsx` → `src/views/*.tsx` → `src/App.tsx`
4. The approved visual reference: `docs/design/preview/app.html` (a throwaway mock; do not expect its code to be reused)

## Evaluate

### 1. TypeScript correctness
- Is `tsc -b` strictness adequate (TS 6 defaults; no explicit `strict` flag in the tsconfigs)? Any unsafe casts, non-null assertions, or `any`?
- Do `lib/*.ts`, `types.ts` and `mockData.ts` import with explicit `.ts` extensions so Node can run them for tests, while app code uses the `@/` alias? Is that split clean and safe with `erasableSyntaxOnly` / `verbatimModuleSyntax`?

### 2. Financial calculation accuracy (most important)
Check `src/lib/finance.ts` against TLD "Financial calculation definitions":
- non-card balance = opening + income − expenses − payments sent;
- card signed debt = opening debt + expenses on the card − payments received;
- available credit = limit − signed debt (not cash; may be negative);
- net position = liquid − **signed** debts; outstanding debt = Σ max(signed, 0); card credit = Σ max(−signed, 0);
- monthly income/expenses by category type and date; **payments never counted**;
- income entered on a card account is ignored (TLD: out of scope) — is ignoring it right, or should it throw?
- activity ordering: date → `createdAt` → entries before payments → id (all descending). Compare with the contract you suggested earlier (date, created_at, source-and-ID tie-breaker). Is this equivalent?
- money is whole centavos; `formatPeso` throws on non-integers. Any place where a float could sneak in (e.g. `Math.round(owed * 100 / limit)` for the track width — display only)?
- `tests/finance.test.ts` (40 tests incl. seeded random invariants). Did the author miss a rule? Mutation testing was done (6 deliberate breaks, all caught).

### 3. Component simplicity
- Is the component count (AppShell, PageHeader, MonthSelect, MoneyText, EmptyState, TransactionItem, CreditCardSummary, OverviewView, PlaceholderView) right? Anything to inline or anything over-split? `OverviewView.tsx` is ~250 lines — acceptable?
- Is the `?demo=` URL hook in `App.tsx` acceptable, or should rare-state scenarios live only in tests?

### 4. Unnecessary dependencies
- `package.json` should be unchanged from Milestone 4.1 (no new packages in 4.2). Confirm. A `test` script and `tests` in `tsconfig.node.json` were added; the test runner is Node's built-in `node:test`.

### 5. Accessibility
- Landmarks (two `nav aria-label="Main"`, one visible at a time), `aria-current`, focus moved to the `h1` after navigation, focus restoration after the stand-in dialogs (Radix only restores to a `DialogTrigger`; `App.tsx` restores it manually — correct and robust?).
- Colour never the only cue (sign, marker icon, hidden word per row); labelled regions; `role="img"` tracks; disabled Add states with a visible reason; `aria-busy` + status text while loading.
- Touch targets ≥44px on phones; visible focus ring.

### 6. Design consistency
- Compare to `DESIGN.md` and the mock; differences are listed in `FRONTEND_OVERVIEW_4_2.md` §6 (content margin 24px vs the mock's 32px; h1 24/28px vs the mock's 26/30px; zero never signed). Agree they are intentional?

### 7. Architecture compliance
- No router, store, data library, chart, animation library, storage, auth. State = view, month, stand-in dialog. Anything hidden that breaks ADR-013/015 or the "mock only" boundary (backend stays authoritative)?

## Known limitations (do not report as discoveries)
Activity, Accounts, Quick Add and the load-error state are not built; the Add/Pay/Add-account actions open stand-in dialogs; no real device, Firefox/WebKit or screen-reader testing; fonts measured on Chromium/Linux only.

## How to report
Most severe first; each with **file + line**, what is wrong, why it matters, a concrete fix, and **blocker / should-fix / nice-to-have**. Say what you could not check.
