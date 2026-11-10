# MoniKey frontend

React 19 + TypeScript + Vite 8 + Tailwind CSS v4, with five shadcn/ui components and Lucide icons.
Design source of truth: [`/DESIGN.md`](../DESIGN.md). Screens and behaviour: [`/docs/design/UI_UX_SPEC.md`](../docs/design/UI_UX_SPEC.md).

Moki's approved poses, asset inventory, optimization details, accessibility rules, and placement guidance are documented in [`docs/design/MOKI_ASSET_GUIDE.md`](../docs/design/MOKI_ASSET_GUIDE.md). Use the shared `src/components/Moki.tsx` component and its typed pose registry for mascot artwork.

**Current implementation:** `src/dataSource.ts` defines the screen-to-data boundary; `src/mockSource.ts` supplies fictional previews; `src/httpSource.ts` calls same-origin `/api` routes; and `src/wire.ts` validates and maps JSON. The app has Overview, Activity, Accounts, Categories, and Kakeibo views. Quick Add handles income, expenses, card payments, and liquid-account transfers. Category defaults suggest expense envelopes; saved transaction classifications remain independent. The repository includes unit and Playwright browser tests. Browser automation does not replace real-device or manual screen-reader review. Deployment status is tracked separately; a successful local build does not prove production deployment.

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
| `src/views/` | Overview, Accounts, Activity, Categories, and Kakeibo screens |
| `src/App.tsx` | View/month/filter/dialog state, data-source selection, resource loads and refresh after writes |
| `src/dataSource.ts`, `src/mockSource.ts`, `src/httpSource.ts` | Shared read/write boundary, fictional mock, and real HTTP implementation |
| `src/wire.ts` | Runtime checks and exact decimal-string/domain mapping for API payloads |
| `src/index.css` | Design tokens, self-hosted Manrope `@font-face`, `@theme inline` |
| `tests/` | Accounting, forms, resource behavior, category filtering, HTTP routes, and wire-mapping unit tests (`npm test`) |
| `browser-tests/` | Playwright Chromium acceptance tests for categories and Quick Add (`npm run test:browser`) |
| `scripts/browser-runtime.cjs` | Shared Playwright Core and Chromium lookup for the browser verification scripts |
| `scripts/verify-overview.cjs`, `scripts/verify-accounts.cjs` | Browser checks; resolve a project-local or cached Playwright Core and matching Chromium. Set `PW_CORE` or `CHROME_BIN` to override either path. |
| `public/fonts/` | Manrope WOFF2 and its OFL licence; no CDN |
| `components.json` | shadcn/ui configuration |

**Preview hook:** open the app with `?demo=loading`, `overpaid`, `negative`, `no-accounts`, `over-limit` or `paid-off` to see those states.

## Rules to keep

- Use semantic tokens (`bg-primary`, `text-debt`, `rounded-card`), never raw hex values in components.
- Only the five shadcn components above; use native `<select>`, `<input type="date">` and radio inputs elsewhere.
- Import Lucide icons by name; icon-only controls need an `aria-label`.
- Money is a decimal **string** from the API (whole centavos in this milestone's mock); format it in one place (`lib/money.ts`) and never treat browser arithmetic as authoritative.
- After any `shadcn add`, review `package.json` and `src/index.css`: the CLI may re-add packages this project deliberately removed (see the scaffold report, section 2).
