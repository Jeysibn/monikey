# Architecture

## Overview

```text
index.html
src/
  main.tsx               — React root, BrowserRouter, FinanceProvider
  App.tsx                — route table + Add Transaction modal state + Toast
  styles/
    tokens.css           — design tokens (colors, fonts, radii) as CSS custom properties
    global.css           — resets, base typography, focus states, and every
                            selector shared by more than one page (see "CSS
                            isolation" below)
  domain/
    finance.ts            — plain types only (Account, Transaction, Goal, …)
                             and mutation-input shapes. No mock values, no
                             calculation logic.
  services/
    financeRepository.ts   — the FinanceRepository contract: getInitialState
                             plus one function per mutation (addTransaction,
                             addManualAccount, addManualCreditCard,
                             addBudgetCategory, createGoal, addGoalFunds).
    mockFinanceRepository.ts — the only implementation today: in-memory,
                             synchronous, no fake network delay. Owns the
                             seed data and the shared category directory.
  state/
    FinanceProvider.tsx    — a useReducer-based provider. The repository is
                             an injectable prop (default: the mock). The
                             reducer itself is a trivial, pure `SET_STATE`
                             replacement that never throws. Each exposed
                             mutation is a `useCallback` that calls
                             `repository.<method>(stateRef.current, ...)`
                             directly on its own call stack — so a
                             repository validation throw propagates to the
                             caller normally, uncaught by the reducer — then
                             updates a `stateRef` and dispatches `SET_STATE`
                             with the result. Reading from `stateRef.current`
                             rather than a stale closed-over `state` means
                             back-to-back mutations issued before a
                             re-render each apply to the previous
                             mutation's result, never a stale render-time
                             snapshot.
    financeContext.ts      — the React context + its value type.
    financeSelectors.ts    — pure derived-calculation functions over
                             FinanceState (totals, budget status, goal
                             progress, category/account label lookups, …).
                             Independently testable; no React, no JSX.
  hooks/
    useFinance.ts          — the one hook pages use: state + mutations +
                             memoized selector results.
    toastBus.ts            — a tiny module-level pub/sub for the save-
                             confirmation toast (not a dependency, not a
                             context — usable from anywhere, including
                             plain event handlers).
  utils/
    currency.ts            — the one Intl.NumberFormat('en-PH','PHP') config;
                             every ₱ amount in the app goes through this.
    date.ts                — formats a transaction's stored ISO date/time for
                             display and defines the reporting-period helpers
                             (`monthPeriodContaining`, `isDateInPeriod`); the
                             one place that logic lives.
    money.ts               — the one money-input parser (`parseMoneyInput`)
                             every finance form validates through.
  components/              — shared, reusable UI: Card, ProgressBar,
                             StatusBadge/Tag, Sparkline, MoneyPosition, Toast,
                             AppShell (top nav + More menu + notification
                             bell + mobile nav), AddTransactionModal
  pages/                   — one file (+ its .css) per route: Dashboard,
                             Transactions, Accounts, Budget, Goals, Placeholder
e2e/                       — Playwright specs
```

Pages never import mock data directly — they call `useFinance()` and read
`finance.state`, the memoized derived values, or a mutation function. This is
the frontend data boundary described below, and it's what makes the Add
Transaction form (and every other local workflow) able to update what every
page displays without a page reload.

## The frontend data boundary

Earlier versions of this app had pages import synchronous arrays and
precomputed constants directly from a single `mockData.ts` module. That kept
numbers consistent across pages, but it meant nothing could ever be added
(a transaction, an account, a goal) without editing that module by hand, and
swapping in a real backend later would have meant touching every page.

The fix is a small, dependency-free layer:

- **`domain/finance.ts`** — the types. `Transaction` stores a `categoryId`
  and `accountId`/`fromAccountId`/`toAccountId` (stable ids), never a
  duplicated display label or category name.
- **`services/mockFinanceRepository.ts`** — the single source of seed data
  and the only place mutation logic lives. `addTransaction` derives the
  signed amount from the transaction type, keeps account/credit-card
  balances and the matching budget category's `spent` in sync, and enforces
  the product rule that transfers never count as income or expense.
- **`state/FinanceProvider.tsx`** — a plain `useReducer`, no external state
  library. Every mutation is synchronous (no fake `setTimeout` delay — this
  is a mock backend standing in for a future real one, not a simulation of
  network latency).
- **`state/financeSelectors.ts`** — every derived number (Net Cash Flow,
  Budget Used %, Spend Mix, goal progress, category/account display-label
  lookups) is a pure function of `FinanceState`. These are plain functions,
  not hooks, so they're testable without rendering anything.
- **`hooks/useFinance.ts`** — the one hook every page calls. It memoizes the
  selector results so components don't recompute totals on every render.

`e2e/cross-page-consistency.spec.ts` is the regression test for the bug class
this replaces: it asserts the same figure appears on both pages that display
it (Dashboard ↔ Transactions for Net Cash Flow, Dashboard ↔ Budget for Budget
Used %, Dashboard ↔ Accounts for Available Cash, Dashboard ↔ Budget for Spend
Mix's total). If someone reintroduces a second hardcoded value, this suite
fails.

## CSS isolation

Every page used to import its own `.css` file with no scoping, and several
pages defined their own copy of the same class name (`.kpi-row`, `.section-
head`, `.card-title-text`, `.mini-list`, `.add-link`, `.add-plus`, `.page-
head`/`.page-title`, `.tx-tag`/`.tx-acct`). Because plain CSS `@import`s are
global regardless of which component "owns" the file, this was a live bug,
not just a style-guide violation: `Dashboard.css` and `Accounts.css` each
defined `.acct-name`/`.acct-amt` differently, so whichever file the bundler
happened to concatenate last silently won for *both* pages.

The fix: every selector used by more than one page now has exactly **one**
definition, in `src/styles/global.css`. Page-specific selectors (`.budget-
row`, `.goal-card`, `.cc-plastic`, …) stay in their own page's `.css` file.
Dashboard's balance-card account-preview rows were renamed `.bal-acct-*` to
stop colliding with the Accounts page's `.acct-*` rows. The now-fully-dead
`KpiCard` component (never imported, but its CSS file happened to define
`.kpi-delta--up/down` too) was deleted rather than left as a second, unused
definition.

## Currency

`src/utils/currency.ts` is the one place currency formatting happens:
`Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })`. No
component, test, or form formats a peso amount by hand. Changing currency or
locale later (e.g. a user setting) means changing this one module.

## Honest interactions

Every enabled button performs a real action against the finance state layer:
Add Transaction, + Add funds, + New category, + Add account/card, Create
goal. Capabilities that don't exist yet — connecting a real bank/e-wallet/
card, OCR receipt processing, a live AI assistant, archiving or "continue
saving" on a completed goal — are real `disabled` controls labeled "coming
soon," not clickable-looking dead ends. The dashboard's AI card is labeled
"AI Assistant Preview" rather than claiming to be "online."

## Reporting period

All period-scoped totals (income, expense, transfers, budgets, trends) use a
single `ReportingPeriod` shape — an inclusive `start` and exclusive `end` ISO
date spanning one calendar month — produced by `monthPeriodContaining` in
`src/utils/date.ts`. The active period is the calendar month containing the
app's demo "today" (`DEMO_TODAY_ISO = '2026-08-29'`, see
`src/state/financeSelectors.ts`), not the browser's real date, so the demo
data reads consistently regardless of when it's opened. `isDateInPeriod`
applies the same inclusive-start/exclusive-end rule everywhere a date is
tested against a period, so a transaction on the 1st of the month counts and
one on the 1st of the next month does not. Every period-scoped selector
either defaults to this active period or accepts an explicit
`ReportingPeriod` argument, so the same aggregation code backs both "this
month" totals and any future period picker.

## Goal-funding model ("funded savings")

Adding money to a goal is a real transfer, not a label bump on a target
number. `addGoalFunds` in `mockFinanceRepository.ts`:

1. Debits the chosen source account's balance by the funded amount.
2. Credits the goal's `currentAmount` by the same amount — so cash leaving an
   account and savings accruing in a goal are always in balance; nothing is
   created or destroyed.
3. Records a normal ledger transaction for the debit (excluded from
   `transferCount`, since it isn't a between-accounts transfer), so it's
   visible in Transactions and correctly excluded from income/expense/trend
   totals via the same transfer-exclusion rule used elsewhere.
4. Rejects funding beyond the goal's remaining target (no overfunding) and
   auto-transitions the goal to completed exactly when `currentAmount`
   reaches `targetAmount`, recording a `reachedDate` distinct from the
   original `targetDate`. A completed goal rejects further funding.

`safeToSpendBreakdown` (Dashboard's "Estimated safe to spend") relies on this
model directly: a completed/inactive goal's `monthlyContribution` is ignored
in the projection, and a funded goal's `currentAmount` is never subtracted a
second time, because that money already left an account balance when it was
funded.

## Design decisions worth knowing

- **Assets Distribution is bar-based, not a radar chart.** The design QA
  brief preferred horizontal allocation bars or a donut over the radar chart
  used in the mockups; this is the real implementation, so the preferred
  final version was built directly — see `src/pages/Accounts.tsx`.
- **The Add Transaction modal's Income tab reuses Expense's field layout**
  (Category + Account), just with different labels ("Source / Description",
  "Deposit to"). A dedicated Income-specific layout was out of scope.
- **`<dialog>` for the modal**, native `<select>`/`<input>` for form
  controls, `<nav>`/`<a>` for navigation, and a disclosure pattern (button +
  plain link list) rather than an ARIA `menu` for the More menu and
  notification bell — since neither implements full arrow-key roving-focus
  menu behavior, claiming `role="menu"` would be a false accessibility
  promise.
- **Fluid layout, not a fixed canvas.** The original mockups were static
  1440×900 artboards; this app is responsive down to 390px (verified: zero
  horizontal overflow at 390/768/1024/1440), with a compact mobile nav menu,
  a reprioritized mobile dashboard card order, and a stacked mobile card list
  replacing the Transactions page's grid below the tablet breakpoint.

## No backend yet

`services/mockFinanceRepository.ts` is explicitly a stand-in for a real API/
service layer, and `FinanceProvider` takes it as an injectable `repository`
prop (defaulting to the mock) rather than importing it directly — a test, or
eventually a real adapter, can pass in its own `FinanceRepository`.

Being honest about the seam: `FinanceRepository` today is a **synchronous
in-memory state transformer**, not an HTTP-shaped contract. Every method
takes the current `FinanceState` and returns the next one (plus the created
record) immediately, with no `Promise`, no loading state, and no error
channel. That shape is a deliberate, correct fit for a mock phase with no
network — but it is *not* a drop-in target for real HTTP calls, which are
asynchronous and fallible. Backing this with a real API will require
widening `FinanceRepository`'s methods to return `Promise<...>` (or an
async-command interface) and adding loading/error handling in
`FinanceProvider` and every page that calls a mutation — `domain/finance.ts`
and `state/financeSelectors.ts` (pure functions over an already-resolved
`FinanceState`) are the only parts of this boundary expected to need no
change.

## Testing

### Unit tests

`npm run test` runs the Vitest suite (73 tests, no browser) over the pure
frontend logic: `financeSelectors.ts`, `date.ts`, `money.ts`,
`mockFinanceRepository.ts`, and `FinanceProvider.tsx` (its reducer and the
stale-closure/back-to-back-mutation behavior described above). This is the
first line of defense for the financial calculations; the Playwright suite
below still owns anything that depends on rendering, layout, or navigation.

### End-to-end tests

Playwright specs live in `e2e/` (57 tests) and cover:

- `navigation.spec.ts` — all five pages reachable, the More menu and
  notification bell open/close with correct focus management, the mobile
  nav replaces the desktop row below 760px, and a 390px horizontal-overflow
  sweep across all five pages.
- `cross-page-consistency.spec.ts` — the shared-state rule above, the
  Dashboard-shows-active-goals-only rule, and active-goals-only average
  progress.
- `add-transaction-modal.spec.ts` — opens/closes, tab switching, the
  From ≠ To account validation, rejecting a zero amount, saving a valid
  expense/income/transfer end-to-end (row appears and totals update without
  a reload), the form resetting on reopen, and Transactions page search/
  filtering.
- `budget-and-a11y.spec.ts` — Budget/Accounts/Goals wording, the new local
  workflows (+ New category, + Add account, + Add funds, Create goal), the
  disabled "coming soon" controls, progress-bar accessible names/clamped
  values, the notification panel's plain-list semantics, and basic
  accessibility assertions (real `<nav>`, a real `type="search"` input, an
  accessible dialog name, labeled icon-only buttons).
- `sr012-invariants.spec.ts` — end-to-end regression coverage, against the
  running app rather than the unit-tested selectors directly, for the
  reporting-period boundary, budget-category allocation, goal-funding
  completion, transfer-fee reconciliation, recurring-vs-manual source
  labeling, search-by-category/account, the Money Position placement and
  wording, the Add Transaction modal's mobile layout, and the 320px
  category-tag/account-column layout.

Run them with `npm run test:e2e`. `playwright.config.ts` starts the app
itself via its `webServer` option, so a normal `npx playwright install
--with-deps` followed by `npm run test:e2e` is all a new machine needs.

One sandbox-specific note (not something a normal dev machine needs): the
container this app was built in had a `libnspr4.so`/`libnss3.so` gap in its
Chromium install with no package-manager access to fix it, worked around at
the time by pointing `LD_LIBRARY_PATH` at an already-present Firefox build's
bundled copies of those libraries. This is not committed anywhere in the
repo — it was a one-off shell workaround for that environment, irrelevant
anywhere `playwright install --with-deps` succeeds normally.

## Known limitations (frontend, by design, not silently dropped)

- Investments, Recurring & Bills, Reports, and Settings remain honest
  "coming soon" placeholders behind the More menu — implementing them was
  explicitly out of scope for this pass.
- Portfolio prices are labeled "Sample data" and do not reflect a real
  market feed — there is no real market-data integration.
