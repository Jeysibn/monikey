# Architecture

## Overview

```text
index.html
src/
  main.tsx              — React root, BrowserRouter
  App.tsx               — route table + Add Transaction modal state
  styles/
    tokens.css          — design tokens (colors, fonts, radii) as CSS custom properties
    global.css          — resets, base typography, focus states
  data/
    mockData.ts         — the single source of truth for every mock number in the app
  components/           — shared, reusable UI: Card, KpiCard, ProgressBar,
                           StatusBadge/Tag, AppShell (top nav + More menu),
                           AddTransactionModal
  pages/                — one file (+ its .css) per route: Dashboard,
                           Transactions, Accounts, Budget, Goals, Placeholder
e2e/                    — Playwright specs
```

Each page imports what it needs from `src/data/mockData.ts` rather than
hardcoding its own copy of a number. This is deliberate and is the single most
important rule in this codebase (see below).

## The shared-mock-data rule

Earlier design iterations of Monikey (documented in the Obsidian vault) had a
real, repeated bug class: the Dashboard's Net Cash Flow and Budget Used
figures drifted out of sync with the dedicated Transactions and Budget pages,
because each mockup screen hardcoded its own copy of the same number. A QA
pass had to explicitly call this out and get it fixed by hand in three
separate places.

This codebase makes that class of bug structurally harder to reintroduce:
every derived number — Net Cash Flow, Budget Used %, Available Cash, Total
Goal Savings, Monthly Contribution, category statuses — is computed **once**
in `src/data/mockData.ts` from the underlying `transactions`, `accounts`,
`budgetCategories`, and `goals` arrays, and every page imports the computed
value. There is no second hardcoded copy anywhere.

`e2e/cross-page-consistency.spec.ts` tests this directly: it asserts that the
same figure appears on both pages that display it (Dashboard ↔ Transactions
for Net Cash Flow, Dashboard ↔ Budget for Budget Used %, Dashboard ↔ Accounts
for Available Cash). If someone reintroduces a second hardcoded value, this
suite fails.

## No backend yet

`src/data/mockData.ts` is explicitly a stand-in for a real API/service layer.
When a backend exists, the intent is:

- Replace the static arrays (`accounts`, `transactions`, `budgetCategories`,
  `goals`, `creditCards`, `portfolio`) with data fetched from the API.
- Keep the derived-value functions (`budgetStatus`, the various `total*`
  constants) as the model for where that calculation logic should live —
  ideally in a shared service layer both the API and the frontend can trust,
  not duplicated in components.
- Transfers must keep being excluded from `totalIncome`/`totalExpenses`/
  `netCashFlow` — that's a product rule from the design docs, not just a
  frontend convenience, and there's a regression test for it implicitly via
  the Transactions page's "Includes 1 transfer" wording. Add an explicit unit
  test for the calculation itself once this logic moves out of a plain object
  literal.

## Design decisions worth knowing

- **Assets Distribution is bar-based, not a radar chart.** The design QA brief
  preferred horizontal allocation bars or a donut over the radar chart used in
  the mockups, but marked it non-blocking (P2) for the mockup phase. Since
  this is the real implementation, the preferred final version (bars) was
  built directly rather than the interim mockup version — see
  `src/pages/Accounts.tsx`.
- **The Add Transaction modal only has full field content for the Expense
  tab.** Income and Transfer tabs exist and are switchable, and Transfer has
  its real "From ≠ To account" validation, but Income's field set mirrors
  Expense's; a dedicated Income-specific layout was out of scope for this
  pass.
- **`<dialog>` is used for the modal**, native `<select>`/`<input>` for form
  controls, and `<nav>`/`<a>` (via `react-router-dom`'s `NavLink`) for
  navigation — per the design docs' explicit instruction to use semantic
  HTML/ARIA in the real implementation rather than styled `<div>`s, which the
  static mockups used.
- **No fixed `1440×900` canvas.** The original mockups were static
  1440×900 artboards; this app uses a fluid layout (`minmax()` grids,
  `clamp()` spacing, a couple of `@media` breakpoints around 980–1000px) and
  is usable well below desktop width, though a dedicated mobile layout (per
  the design docs' mobile-specific information order and card-based
  transaction rows) has not been built yet.

## Testing

Playwright specs live in `e2e/` and cover:

- `navigation.spec.ts` — all five pages reachable, the More menu opens/closes
  and its items work.
- `cross-page-consistency.spec.ts` — the shared-mock-data rule above, plus the
  Dashboard-shows-active-goals-only rule.
- `add-transaction-modal.spec.ts` — opens/closes, tab switching, the
  From ≠ To account validation, and Transactions page search/filtering.
- `budget-and-a11y.spec.ts` — Budget page wording/statuses, the Accounts page
  "Add account" wording, and a few basic accessibility assertions (real
  `<nav>`, a real `type="search"` input, an accessible dialog name, labeled
  icon-only buttons).

Run them with `npm run test:e2e`. `playwright.config.ts` starts the app itself
via its `webServer` option, so a normal `npx playwright install --with-deps`
followed by `npm run test:e2e` is all a new machine needs.

One sandbox-specific note (not something a normal dev machine needs): the
container this app was originally built in had a `libnspr4.so`/`libnss3.so`
gap in its Chromium install with no package-manager access to fix it, worked
around at the time by pointing `LD_LIBRARY_PATH` at an already-present
Firefox build's bundled copies of those libraries. This is not committed
anywhere in the repo — it was a one-off shell workaround for that
environment, irrelevant anywhere `playwright install --with-deps` succeeds
normally.
