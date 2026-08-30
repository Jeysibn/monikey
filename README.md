# Monikey

Monikey is a personal finance tracker: expenses, income, budgets, multi-account
bank/e-wallet money tracking, credit-card tracking, and savings goals, with an
AI assistant and OCR receipt capture on the product roadmap.

This repository is the **frontend implementation**, built from a set of
approved design mockups (see [`docs/`](./docs) and the linked Obsidian project
notes for the full design history). It is a React + TypeScript + Vite
single-page app with five working pages backed by real (in-memory) frontend
state, a functional Add Transaction workflow, local Account/Budget-category/
Goal creation, and an end-to-end Playwright test suite.

## What actually works vs. what's a preview

Everything below runs entirely on frontend state — no backend, no
authentication, no real bank/AI/OCR integration exists yet (see
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#no-backend-yet)):

**Implemented, real, local workflows:**
- Add a transaction (expense, income, or transfer) — validated, saved to
  state, and reflected in every total immediately.
- Add a manual bank/e-wallet/cash account or credit card.
- Add a budget category.
- Create a savings goal and add funds to it.

**Honestly labeled as not yet built** (a real, disabled control — never a
clickable-looking dead end): connecting a real bank/e-wallet/card, OCR
receipt scanning, a live AI assistant, and archiving/continuing/increasing
the target on a completed goal.

## Stack

- [Vite](https://vite.dev) + React 19 + TypeScript
- [react-router-dom](https://reactrouter.com) for client-side routing
- Plain CSS (design tokens in `src/styles/tokens.css`) — no CSS framework
- [Playwright](https://playwright.dev) for end-to-end tests
- A small frontend-only state layer (`src/state/`, `src/services/`,
  `src/domain/`) — no backend yet, no external state-management library. See
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full shape.
- Currency: Philippine peso (`en-PH`/`PHP` via `Intl.NumberFormat`), see
  `src/utils/currency.ts`.

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production into `dist/` |
| `npm run preview` | Serve the production build at `http://localhost:4173` |
| `npm run lint` | Run `oxlint` |
| `npm run test:e2e` | Run the Playwright end-to-end suite (builds and serves automatically) |

### Running the end-to-end tests

```bash
npm run test:e2e
```

This builds the app, starts it on `http://localhost:4173` (via
`playwright.config.ts`'s `webServer`), and runs every spec in `e2e/` against
it — 41 tests covering navigation, the Add Transaction workflow (including
saving each transaction type end-to-end), the local Account/Budget-category/
Goal workflows, cross-page data consistency, responsive behavior at 390px,
and basic accessibility. On a normal machine with
`npx playwright install --with-deps` already run once, this just works. See
[`docs/ARCHITECTURE.md#testing`](./docs/ARCHITECTURE.md#testing) for one
sandbox-specific note about running Playwright in a minimal container.

## Pages

| Route | Page |
| --- | --- |
| `/` | Dashboard — money position, available cash, expenses trend, budget, goals, spend mix, credit cards, portfolio, recent transactions |
| `/transactions` | Transactions — search, filter, and add income/expense/transfer |
| `/accounts` | Accounts — banks, e-wallets, cash, and credit cards; add a manual account or card |
| `/budget` | Budget — category budgets, Budget Health, Budget vs Actual; add a category |
| `/goals` | Goals — active and completed savings goals; add funds or create a goal |
| `/investments`, `/recurring`, `/reports`, `/settings` | Honest "coming soon" placeholders behind the "More" menu |

## Responsive

Verified with zero horizontal overflow at 390px (mobile), 768px (tablet),
1024px (small desktop), and 1440px (desktop). Below 760px the top nav
collapses into a compact menu button; below 768px the Transactions page
shows a stacked card list instead of the desktop grid; the Add Transaction
dialog goes full-screen below 520px.

## Screenshots

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Transactions](docs/screenshots/transactions.png) |
| ![Accounts](docs/screenshots/accounts.png) | ![Budget](docs/screenshots/budget.png) |
| ![Goals](docs/screenshots/goals.png) | ![Dashboard (mobile)](docs/screenshots/dashboard-mobile.png) |

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — component structure, the
  frontend state boundary, CSS isolation, currency, honest interactions,
  what's implemented vs. deferred, and how this maps to the original design
  docs.
- The full design history (implementation briefs, QA passes, the frontend
  review brief, and the Claude Design canvas mockups this app was built from)
  lives in the project's Obsidian vault under `03 Projects/Monikey/` — not
  duplicated here, since it predates and exceeds the scope of this codebase.
