# MoniKey frontend

React 19 + TypeScript + Vite 8 + Tailwind CSS v4, with five shadcn/ui components and Lucide icons.
Design source of truth: [`/DESIGN.md`](../DESIGN.md). Screens and behaviour: [`/docs/design/UI_UX_SPEC.md`](../docs/design/UI_UX_SPEC.md).

**Status (Milestone 4.9, loading, error and slow states, on top of 4.8):** every block that can fail now says so on its own with a Retry (and when the figures last arrived), a stale list shows a quiet "Updating…", Add transaction is disabled until the accounts have loaded, a save that takes over 15 seconds shows a notice, and a refused save highlights its field. All of it is testable on the mock with `?demo=load-error`, `flaky`, `offline`, `slow` and `invalid`. See [`/docs/design/FRONTEND_STATES_4_9.md`](../docs/design/FRONTEND_STATES_4_9.md). Earlier status (4.8, the data-source seam, on top of 4.7): the screens no longer read stored rows: they ask a `DataSource` (`src/dataSource.ts`) for figures and send writes to it; today the only implementation is the mock (`src/mockSource.ts`), and the API client will be a second one. See [`/docs/design/FRONTEND_SEAM_4_8.md`](../docs/design/FRONTEND_SEAM_4_8.md). Earlier status (4.7, accessibility and responsive pass, on top of 4.6): all four screens are built and every v1 write works against an in-memory ledger (a reducer standing in for the API; a reload restores the starting data): **Quick Add, Pay card, Edit, Delete and Add account**. No screen is a placeholder any more; the API client and load-error states are what remains on the frontend. See [`/docs/design/A11Y_RESPONSIVE_4_7.md`](../docs/design/A11Y_RESPONSIVE_4_7.md) (audit results, fixes, what still needs a real device), [`REAL_DEVICE_CHECKLIST.md`](../docs/design/REAL_DEVICE_CHECKLIST.md), [`/docs/design/FRONTEND_ADDACCOUNT_4_6.md`](../docs/design/FRONTEND_ADDACCOUNT_4_6.md), [`FRONTEND_EDITDELETE_4_5B.md`](../docs/design/FRONTEND_EDITDELETE_4_5B.md), [`FRONTEND_QUICKADD_4_5A.md`](../docs/design/FRONTEND_QUICKADD_4_5A.md), [`FRONTEND_ACTIVITY_4_4.md`](../docs/design/FRONTEND_ACTIVITY_4_4.md), [`/docs/design/FRONTEND_OVERVIEW_4_2.md`](../docs/design/FRONTEND_OVERVIEW_4_2.md) and [`/docs/design/FRONTEND_ACCOUNTS_4_3.md`](../docs/design/FRONTEND_ACCOUNTS_4_3.md). Earlier: [`FRONTEND_SCAFFOLD_4_1.md`](../docs/design/FRONTEND_SCAFFOLD_4_1.md).

## Commands

```sh
npm ci            # exact install from the lockfile
npm run dev       # http://localhost:5173
npm run build     # type-check (tsc -b) then build to dist/
npm run lint      # oxlint
npm run preview   # serve dist/ (default port 4173)
npm test          # unit tests for money formatting and the accounting rules (Node's built-in runner)
```

## Where things are

| Path | What |
|---|---|
| `src/types.ts` | Account, Category, Transaction, CreditCardPayment, FinancialSummary … (money = whole centavos) |
| `src/mockData.ts` | Fictional ledger in centavos + `?demo=` scenarios for rare states |
| `src/lib/money.ts`, `src/lib/finance.ts` | Peso formatting; balances, debt, available credit, net position, monthly totals, activity list |
| `src/components/` | `AppShell`, `PageHeader`, `MonthSelect`, `MoneyText`, `EmptyState`, `TransactionItem`, `CreditCardSummary`, `AccountRow` |
| `src/components/ui/` | The five vendored shadcn/ui components (restyled to DESIGN.md) |
| `src/views/` | `OverviewView`, `AccountsView`, `ActivityView` |
| `src/App.tsx` | The only state: current view, selected month, stand-in dialog |
| `src/index.css` | Design tokens, self-hosted Manrope `@font-face`, `@theme inline` |
| `tests/finance.test.ts` | Unit tests (`npm test`) |
| `scripts/verify-overview.cjs`, `scripts/verify-accounts.cjs` | Browser checks (need a local Chromium + playwright-core; see the script headers) |
| `public/fonts/` | Manrope WOFF2 and its OFL licence; no CDN |
| `components.json` | shadcn/ui configuration |

**Preview hook:** open the app with `?demo=loading`, `overpaid`, `negative`, `no-accounts`, `over-limit` or `paid-off` to see those states.

## Rules to keep

- Use semantic tokens (`bg-primary`, `text-debt`, `rounded-card`), never raw hex values in components.
- Only the five shadcn components above; use native `<select>`, `<input type="date">` and radio inputs elsewhere.
- Import Lucide icons by name; icon-only controls need an `aria-label`.
- Money is a decimal **string** from the API (whole centavos in this milestone's mock); format it in one place (`lib/money.ts`) and never treat browser arithmetic as authoritative.
- After any `shadcn add`, review `package.json` and `src/index.css`: the CLI may re-add packages this project deliberately removed (see the scaffold report, section 2).
