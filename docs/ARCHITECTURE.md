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
    financeRules.ts       — the finance invariants (amounts, ids, dates,
                             category/type applicability, asset overdraft,
                             credit limit, card payment, goal overfunding)
                             as shared validators, plus the
                             `FinanceValidationError` (stable `code` +
                             `field`) every rejection throws. The repository
                             calls these; forms only surface what they
                             reject. See "Finance invariants" below.
  services/
    financeRepository.ts   — the FinanceRepository contract: getInitialState
                             plus one function per mutation (addTransaction,
                             addManualAccount, addManualCreditCard,
                             addBudgetCategory, createGoal, addGoalFunds).
    mockFinanceRepository.ts — the only implementation today: in-memory,
                             synchronous, no fake network delay. Owns the
                             seed data and the shared category directory.
  state/
    financeStore.ts        — the state container: a plain external store
                             (`getState`/`subscribe`/`run`) with no React in
                             it. `run` executes one repository mutation on
                             the caller's own stack against the store's
                             latest state, installs the result, and notifies
                             subscribers; if the mutation throws, nothing is
                             installed and no listener fires.
    FinanceProvider.tsx    — the provider. It creates one store per instance
                             and reads it through `useSyncExternalStore`;
                             the repository and the `AppClock` are both
                             injectable props (defaults: the mock repository
                             bound to the demo clock). Because the store —
                             not a render-phase ref — holds the
                             authoritative state, back-to-back mutations
                             issued before a re-render each apply to the
                             previous mutation's result, a validation throw
                             propagates synchronously to the calling form,
                             and nothing is read or written during render
                             (which is what made the previous `stateRef`
                             approach unsafe under concurrent rendering).
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
    clock.ts               — the one application clock (`AppClock`),
                             `fixedClock`/`systemClock`, and
                             `resolveAppClock` (the `?today=` override).
                             Injected once in `main.tsx`. See "The
                             application clock" below.
    currency.ts            — the one Intl.NumberFormat('en-PH','PHP') config;
                             every ₱ amount in the app goes through this.
                             Module-level and non-reactive — see "Currency".
    date.ts                — strict validation and normalization of stored
                             calendar values, the reporting-period helpers
                             (`monthPeriodContaining`, `isDateInPeriod`), and
                             the display formatters; the one place that logic
                             lives. It never reads a clock.
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
component, test, or form formats a peso amount by hand.

Honest scope: that configuration is **module-level and non-reactive**.
`formatMoney` is a plain function and nothing subscribes to the config, so
calling `setCurrencyConfig` at runtime does not re-render anything — already-
rendered amounts keep the old currency until something else happens to
re-render them. **Runtime currency switching is therefore unsupported** until
a Settings page exists; making it work means moving the config into React
state/context (a provider plus a formatter hook) so a change re-renders every
consumer, the same shape `AppClock` uses today. `setCurrencyConfig` is for
one-time setup before the first render, and for tests.

## Honest interactions

Every enabled button performs a real action against the finance state layer:
Add Transaction, + Add funds, + New category, + Add account/card, Create
goal. Capabilities that don't exist yet — connecting a real bank/e-wallet/
card, OCR receipt processing, a live AI assistant, archiving or "continue
saving" on a completed goal — are real `disabled` controls labeled "coming
soon," not clickable-looking dead ends. The dashboard's AI card is labeled
"AI Assistant Preview" rather than claiming to be "online."

## The application clock

There is exactly **one** clock, and it is injected. `AppClock`
(`src/utils/clock.ts`) has a single method, `todayIso()`, returning a strict
`YYYY-MM-DD` local date. `main.tsx` resolves it once and passes it to
`FinanceProvider`, which exposes it as `todayIso` on the finance context;
`useFinance()` then passes that value into every time-dependent selector.

Everything time-dependent reads that one value: the active reporting period,
the Add Transaction form's default date, the "today" expense figure and every
trend bucket, budget days remaining, goal target-date validation, and the
dates stamped on goal-funding transfers and goal completion. **No component,
selector, or repository calls `new Date()` to ask what day it is.** The
earlier bug this replaces was two clocks — a fixed `DEMO_TODAY_ISO` for
reporting and a live `new Date()` for the form default — which agreed only
while the real calendar stayed inside August 2026.

Runtime mode: a **fixed demo clock** (`DEMO_TODAY_ISO = '2026-08-29'`), the
date the seed dataset is written around, so the demo reads consistently
whenever it is opened. Because that date is fixed rather than live, the UI
labels the reporting window with its real month — "August 2026", from
`formatPeriodLabel` — instead of an ambiguous "this month".

`?today=YYYY-MM-DD` overrides the clock for the whole app (invalid values
fall back to the demo clock, never to the machine clock). Since one value
drives everything, that single parameter moves the period label, its totals,
the chart buckets, budget days remaining, and the form's default date
together — which is how `e2e/tr-remediation.spec.ts` observes month rollover
without waiting for the calendar. Unit tests inject `fixedClock('…')`
directly, so no test depends on the machine's date or timezone.

## Reporting period

All period-scoped totals (income, expense, transfers, budgets, trends) use a
single `ReportingPeriod` shape — an inclusive `start` and exclusive `end` ISO
date spanning one calendar month — produced by `monthPeriodContaining` in
`src/utils/date.ts`, anchored on the clock's `todayIso()`. `isDateInPeriod`
applies the same inclusive-start/exclusive-end rule everywhere a date is
tested against a period, so a transaction on the 1st of the month counts and
one on the 1st of the next month does not. Every period-scoped selector takes
an explicit `ReportingPeriod` argument, so the same aggregation code backs
both the current window and any future period picker.

## Stored date and time formats

Calendar values are strict at the storage boundary and human-readable only at
the rendering boundary:

- **Dates** are `YYYY-MM-DD`, validated syntactically *and* by round-trip, so
  an impossible date is rejected rather than rolled over: `2026-02-31` is not
  quietly accepted as March 3rd, and `2026-13-01` is not accepted as January
  2027. Leap years fall out of the round-trip check for free.
- **Times** are 24-hour `HH:mm` with hours `00`–`23` and minutes `00`–`59`;
  `24:00` and `12:60` are rejected instead of being reformatted.
- **Seed data uses the same formats as records the app creates.** Seed
  transaction times are `HH:mm` (not `'9:14 AM'`), and seed goal target/
  completed dates and credit-card due dates are ISO dates (not `'Mar 2027'`
  or `'Sep 15'`). `formatTimeLabel`, `formatGoalDate`, and
  `formatDueDateLabel` turn them into display text at render time.
- `monthPeriodContaining` **throws** on an invalid anchor. It used to fall
  back to `new Date()`, which silently substituted the machine's clock for
  the app's reporting window.

## Finance invariants

`src/domain/financeRules.ts` is the authority on what a valid mutation is,
and `mockFinanceRepository` calls it before building any new state — so a
rejected mutation returns the caller's state completely untouched, and the
rules hold for a call that arrives from a test adapter or a future API client
with no form involved. Rejections are a `FinanceValidationError` carrying a
stable `code` and the `field` at fault, which is what lets each form place the
message on the exact control that caused it.

The documented balance rules:

1. **Asset overdraft — not supported.** No mutation may drive a checking/
   savings/e-wallet/cash balance below zero: not an expense, not the debit
   side of a transfer, not a transfer fee, and not goal funding. Accounts
   also cannot be created with a negative starting balance.
2. **Credit limit — hard.** A card charge may not push the amount owed above
   the card's limit, and a card cannot be created already over its limit
   (`CreditCard.balance` is amount owed, so `balance <= limit` always).
3. **Credit-card payment — capped at the amount owed.** Paying a card is an
   asset → card transfer; paying more than is owed would leave a negative
   "owed", which this model has no representation for. The reverse direction
   (card → asset, a cash advance) is not a supported transfer at all.
4. **Goal overfunding — not supported.** `currentAmount` may never exceed
   `targetAmount`, for seed goals as well as user-created ones.
5. A transaction must reference a known account/card and a category that
   applies to its type (Salary is income-only, Housing is expense-only);
   transfers carry no category, need two different accounts, and cannot be
   made to or from an unknown id.

## Credit cards and Money Position's commitment horizon

A credit card carries a real ISO `dueDate` and a `minPayment` from the moment
it is created — the Add Card form collects both — so a newly added card can
participate in Money Position immediately instead of being stored as
`'Not set'` / `0`.

The documented commitment horizon is **30 days**: `safeToSpendBreakdown`
counts a card's minimum payment only when its due date falls within
`[today, today + 30 days]`, so "due soon" is a real date filter rather than a
figure of speech. A card with no valid stored due date contributes nothing.

Paying a card is recorded through the ordinary transfer path with an asset
source and a card destination: the source balance and the card's amount owed
both fall by the payment. It keeps full transfer semantics — excluded from
income, expenses, net cash flow, and budget spend — and the transaction row
says so via `cardPaymentReconciliationLabel`.

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
4. Rejects funding beyond the goal's remaining target (no overfunding) *and*
   beyond the source account's available balance (no asset overdraft) — the
   Add Funds form offers at most `maxFundableAmount`, the smaller of the two.
   It auto-transitions the goal to completed exactly when `currentAmount`
   reaches `targetAmount`, recording a `completedDate` (the clock's today)
   distinct from the original `targetDate`. A completed goal rejects further
   funding.

A goal's `monthlyContribution` is a **planned** contribution, not an
automated one: nothing transfers it on a schedule. The UI says "Planned
Monthly Contribution" / "Monthly plan" / "planned" everywhere, and Money
Position describes it as a plan the user still has to act on.

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

`npm run test` runs the Vitest suite (no browser) over the pure
frontend logic: `financeSelectors.ts`, `clock.ts`, `date.ts`, `money.ts`,
`mockFinanceRepository.ts` (including the repository-enforced invariants
above, proven without any UI), `financeStore.ts`, the `FinanceProvider`
wiring (validation throws and back-to-back mutations, run twice — once
plainly and once under React Strict Mode), the clock-rollover behavior across
month and year boundaries, the `useFieldErrors` accessibility contract, and
the Add Transaction modal's default date and error behavior. The whole suite
runs under a pinned non-UTC timezone (`TZ=Asia/Manila`, set in
`vitest.config.ts`), which proves the local-calendar date handling never
depends on the machine's offset being zero. This
is the first line of defense for the financial calculations; the Playwright
suite below still owns anything that depends on rendering, layout, or
navigation.

### End-to-end tests

Playwright specs live in `e2e/` and cover:

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
- `tr-remediation.spec.ts` — the third-review remediation: that the suite is
  running against freshly built production output, that overriding the one
  clock moves the period label, its totals, the chart window, budget days
  remaining and the form's default date together, that every expense-chart
  title names the exact range its buckets cover (with per-bucket date ranges
  exposed to assistive technology), the credit-card workflow (Add Card's due
  date and minimum payment, that minimum reaching Money Position, a
  bank-to-card payment moving cash and credit owed without touching cash-flow
  totals, and cash advances staying unavailable), goal funding refusing to
  overdraw its source account, seed data satisfying the no-overfunding rule,
  form errors being focused and programmatically associated, a sweep proving
  no essential text renders below 12px, and a 200% zoom smoke test.
- `sr012-invariants.spec.ts` — end-to-end regression coverage, against the
  running app rather than the unit-tested selectors directly, for the
  reporting-period boundary, budget-category allocation, goal-funding
  completion, transfer-fee reconciliation, recurring-vs-manual source
  labeling, search-by-category/account, the Money Position placement and
  wording, the Add Transaction modal's mobile layout, and the 320px
  category-tag/account-column layout.

Run them with `npm run test:e2e`. This is self-contained from a clean
checkout: `playwright.config.ts`'s `webServer` command is
`npm run build && npm run preview`, and Playwright starts `webServer` **once**
for the whole run, before any worker spawns — so exactly one production build
happens no matter how many parallel workers the run uses. This matters
because `vite preview` only *serves* `dist/`, never builds it, and `dist/` is
gitignored: the previous `npm run preview` command silently depended on
someone having built first, or tested stale output.

Two things keep that guarantee honest rather than merely stated:

- `reuseExistingServer` is `false` unconditionally, not just under CI. Left
  on, Playwright would adopt any process already listening on 4173 — a
  developer's own `npm run preview` — and skip the webServer command, build
  included, testing whatever `dist/` that server was holding. With it off, an
  occupied port fails loudly through `--strictPort` instead.
- `e2e/tr-remediation.spec.ts` compares the content-hashed bundle the server
  actually served against the files in `dist/` on disk. A hashed filename
  alone proves only that *some* build was served — stale output has hashed
  names too — so the test asserts the served bundle is the one this run's
  build just produced, and that `dist/index.html` references the same one.

The one prerequisite is the browser binary itself. Install it once per
machine with `npm run test:e2e:install` (which runs
`playwright install --with-deps chromium`, the same command CI should run).
A missing browser or missing system libraries surfaces as a Playwright launch
error before any test runs — that is an environment problem, not an
application test failure, and should never be reported as either a pass or a
product defect.

## Known limitations (frontend, by design, not silently dropped)

- **Runtime currency switching is unsupported** — the currency config is
  module-level and non-reactive; see "Currency" above for exactly what would
  have to change.
- **Goal contributions are planned, not automated.** There is no recurring-
  transfer engine, so `monthlyContribution` is a target pace the user acts on
  manually; the UI says "planned" rather than "auto-save".
- **Recurring bills are excluded from Money Position**, because there is no
  recurring-bills feature to source them from — the estimate discloses this
  rather than implying completeness.
- **Credit-card cash advances (card → cash transfers) are not supported** —
  the transfer source is asset-only, by rule, not by oversight.

- Investments, Recurring & Bills, Reports, and Settings remain honest
  "coming soon" placeholders behind the More menu — implementing them was
  explicitly out of scope for this pass.
- Portfolio prices are labeled "Sample data" and do not reflect a real
  market feed — there is no real market-data integration.
