# Monikey

Monikey is a personal finance tracker: expenses, income, budgets, multi-account
bank/e-wallet money tracking, credit-card tracking, and savings goals, with an
AI assistant and OCR receipt capture on the product roadmap.

This repository is the **frontend implementation**, built from a set of
approved design mockups (see [`docs/`](./docs) and the linked Obsidian project
notes for the full design history). It is a React + TypeScript + Vite
single-page app with five working pages, a functional Add Transaction modal,
and an end-to-end Playwright test suite.

## Stack

- [Vite](https://vite.dev) + React 19 + TypeScript
- [react-router-dom](https://reactrouter.com) for client-side routing
- Plain CSS (design tokens in `src/styles/tokens.css`) — no CSS framework
- [Playwright](https://playwright.dev) for end-to-end tests
- Mock data only (`src/data/mockData.ts`) — no backend yet, see
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#no-backend-yet)

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
it. On a normal machine with `npx playwright install --with-deps` already run
once, this just works. See
[`docs/ARCHITECTURE.md#testing`](./docs/ARCHITECTURE.md#testing) for one
sandbox-specific note about running Playwright in a minimal container.

## Pages

| Route | Page |
| --- | --- |
| `/` | Dashboard — summary of everything else |
| `/transactions` | Transactions — search, filter, and add income/expense/transfer |
| `/accounts` | Accounts — banks, e-wallets, cash, and credit cards |
| `/budget` | Budget — category budgets and Budget Health |
| `/goals` | Goals — active and completed savings goals |
| `/investments`, `/recurring`, `/reports`, `/settings` | Placeholders behind the "More" menu |

## Screenshots

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Transactions](docs/screenshots/transactions.png) |
| ![Accounts](docs/screenshots/accounts.png) | ![Budget](docs/screenshots/budget.png) |
| ![Goals](docs/screenshots/goals.png) | |

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — component structure, the
  shared-mock-data pattern, what's implemented vs. deferred, and how this maps
  to the original design docs.
- The full design history (two implementation briefs, a QA pass, and the
  Claude Design canvas mockups this app was built from) lives in the project's
  Obsidian vault under `03 Projects/Monikey/` — not duplicated here, since it
  predates and exceeds the scope of this codebase.
