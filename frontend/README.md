# MoniKey frontend

React 19 + TypeScript + Vite 8 + Tailwind CSS v4, with five shadcn/ui components and Lucide icons.
Design source of truth: [`/DESIGN.md`](../DESIGN.md). Screens and behaviour: [`/docs/design/UI_UX_SPEC.md`](../docs/design/UI_UX_SPEC.md).

**Status (Milestone 4.2):** the application shell (bottom bar, rail, sidebar) and the Overview page are built with typed fictional data. Activity and Accounts are placeholders; Quick Add, Pay card and Add account open stand-in dialogs. See [`/docs/design/FRONTEND_OVERVIEW_4_2.md`](../docs/design/FRONTEND_OVERVIEW_4_2.md). Earlier: [`FRONTEND_SCAFFOLD_4_1.md`](../docs/design/FRONTEND_SCAFFOLD_4_1.md).

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
| `src/components/` | `AppShell`, `PageHeader`, `MonthSelect`, `MoneyText`, `EmptyState`, `TransactionItem`, `CreditCardSummary` |
| `src/components/ui/` | The five vendored shadcn/ui components (restyled to DESIGN.md) |
| `src/views/` | `OverviewView`, `PlaceholderView` (Activity and Accounts stand-ins) |
| `src/App.tsx` | The only state: current view, selected month, stand-in dialog |
| `src/index.css` | Design tokens, self-hosted Manrope `@font-face`, `@theme inline` |
| `tests/finance.test.ts` | Unit tests (`npm test`) |
| `scripts/verify-overview.cjs` | Browser checks (needs a local Chromium + playwright-core; see the script header) |
| `public/fonts/` | Manrope WOFF2 and its OFL licence; no CDN |
| `components.json` | shadcn/ui configuration |

**Preview hook:** open the app with `?demo=loading`, `?demo=overpaid`, `?demo=negative` or `?demo=no-accounts` to see those states.

## Rules to keep

- Use semantic tokens (`bg-primary`, `text-debt`, `rounded-card`), never raw hex values in components.
- Only the five shadcn components above; use native `<select>`, `<input type="date">` and radio inputs elsewhere.
- Import Lucide icons by name; icon-only controls need an `aria-label`.
- Money is a decimal **string** from the API (whole centavos in this milestone's mock); format it in one place (`lib/money.ts`) and never treat browser arithmetic as authoritative.
- After any `shadcn add`, review `package.json` and `src/index.css`: the CLI may re-add packages this project deliberately removed (see the scaffold report, section 2).
