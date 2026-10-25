# MoniKey frontend

React 19 + TypeScript + Vite 8 + Tailwind CSS v4, with five shadcn/ui components and Lucide icons.
Design source of truth: [`/DESIGN.md`](../DESIGN.md). Screens and behaviour: [`/docs/design/UI_UX_SPEC.md`](../docs/design/UI_UX_SPEC.md).

**Status:** the mock-backed UI and contract-driven HTTP data source are implemented. `src/dataSource.ts` is the seam; `src/mockSource.ts` supports the demo and tests; `src/httpSource.ts` calls same-origin `/api` routes; `src/wire.ts` validates JSON and converts exact decimal strings to bounded centavos. The API path was exercised against FastAPI through both the Vite proxy and the production-like Nginx proxy. The frontend production image builds successfully. The interactive React/API browser journey still needs owner review because local browser access was declined by the origin gate. Compose usage and evidence are in [Milestone 8–9 integration](../docs/design/MILESTONE_8_9_INTEGRATION.md). See also [API client implementation](../docs/design/FRONTEND_API_CLIENT_S3.md) and the historical [Milestone 4.9](../docs/design/FRONTEND_STATES_4_9.md), [4.8](../docs/design/FRONTEND_SEAM_4_8.md), and [4.7](../docs/design/A11Y_RESPONSIVE_4_7.md) reports.

## Commands

```sh
npm ci            # exact install from the lockfile
npm run dev       # http://localhost:5173
npm run build     # type-check (tsc -b) then build to dist/
npm run lint      # oxlint
npm run preview   # serve dist/ (default port 4173)
npm test          # unit tests for accounting, UI rules, API mapping and requests (Node's built-in runner)
```

The development default is the mock. To run the API, follow [`backend/README.md`](../backend/README.md), then use `VITE_DATA_SOURCE=http npm run dev`; the Vite proxy preserves the `/api` prefix to `http://localhost:8000`. Build with the same flag (`VITE_DATA_SOURCE=http npm run build`) to select HTTP in production. The HTTP build excludes the mock and `?demo=` hooks. `VITE_*` values are public build-time settings and must not contain secrets. Live database persistence is not configured by this frontend.

For the production-like local stack, copy `.env.example` to `.env`, replace the placeholder password, then run `docker compose up --build`. Open `http://127.0.0.1:8080`. Only the frontend port is published, on loopback; API and PostgreSQL ports stay inside Compose. `docker compose down` retains PostgreSQL data. See the [integration and Compose report](../docs/design/MILESTONE_8_9_INTEGRATION.md) for backup/restore evidence.

## Where things are

| Path | What |
|---|---|
| `src/types.ts` | Account, Category, Transaction, CreditCardPayment, FinancialSummary … (money = whole centavos) |
| `src/mockData.ts` | Fictional ledger in centavos + `?demo=` scenarios for rare states |
| `src/lib/money.ts`, `src/lib/finance.ts` | Peso formatting; balances, debt, available credit, net position, monthly totals, activity list |
| `src/components/` | `AppShell`, `PageHeader`, `MonthSelect`, `MoneyText`, `EmptyState`, `TransactionItem`, `CreditCardSummary`, `AccountRow` |
| `src/components/ui/` | The five vendored shadcn/ui components (restyled to DESIGN.md) |
| `src/views/` | `OverviewView`, `AccountsView`, `ActivityView` |
| `src/App.tsx` | View/month/filter/dialog state, data-source selection, resource loads and refresh after writes |
| `src/dataSource.ts`, `src/mockSource.ts`, `src/httpSource.ts` | Shared read/write boundary, fictional mock, and real HTTP implementation |
| `src/wire.ts` | Runtime checks and exact decimal-string/domain mapping for API payloads |
| `src/index.css` | Design tokens, self-hosted Manrope `@font-face`, `@theme inline` |
| `tests/` | Accounting, forms, resource behavior, HTTP routes, and wire-mapping unit tests (`npm test`) |
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
