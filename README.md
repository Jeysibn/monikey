# Monikey

Monikey is a personal finance application for transactions, accounts and credit
cards, budgets, savings goals, investments, recurring bills, reports, and settings.
It is a monorepo with a React frontend and a Fastify API and worker backed by PostgreSQL.

## Runtime modes

- **Mock mode** (default): deterministic in-memory finance state for demos and UI
  tests. The injected date is `2026-08-29`; `?today=YYYY-MM-DD` overrides it.
- **Backend mode**: build with `VITE_FINANCE_BACKEND=true` to use the session-cookie
  registration/sign-in gate and asynchronous API gateways. Data persists in PostgreSQL.
  The mock clock override does not control this mode; the async provider currently
  uses the UTC calendar date, and the backend has its own date handling.

This flag is a Vite **build-time** setting; changing it requires a frontend rebuild.
Mock and backend modes have different capabilities; they are not interchangeable test targets.

## Stack and layout

| Path | Responsibility |
| --- | --- |
| `frontend/` | React 19, TypeScript, Vite, React Router, plain CSS; Vitest and Playwright |
| `backend/` | Node.js 24+, Fastify 5, Prisma 6, PostgreSQL; API and worker entry points |
| `backend/prisma/` | Database schema, SQL migrations, seed |
| `docker/` | Optional Prometheus/Grafana configuration |
| `scripts/` | Compose regression helper and database/receipt backup scripts |
| `docs/` | Architecture, operations, recovery guide, historical screenshots |
| `.github/workflows/` | Validation, image publication, CodeQL |

Each package has its own lockfile and Dockerfile. Root npm scripts delegate to
those packages; this is not an npm-workspaces setup.

## Local development

Install Node.js 24+ and, for the full stack, Docker with Compose.
From the repository root:

```bash
npm run install:all
npm run dev:frontend
```

This starts the mock frontend at `http://localhost:5173`. For the full stack,
copy `.env.example` to `.env` if you do not already have one, configure its
PostgreSQL values and `DATABASE_URL` using host `db`, and set
`VITE_FINANCE_BACKEND=true` and `APP_ORIGIN=http://localhost:8080`.
Then run:

```bash
docker compose up -d --build
curl --fail http://localhost:8080/api/v1/health/ready
```

Open `http://localhost:8080` and register or sign in. Compose runs PostgreSQL 18,
a one-shot migration **and seed** service, the API, worker, and nginx frontend.
The optional backend development overlay mounts source and uses `tsx watch`:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Production cookies are Secure. Use HTTPS for a non-local deployment and configure
`APP_ORIGIN` to match its browser origin. Provider selection and credentials are
configured separately; source adapters do not prove a live integration is enabled.

## Pages and capabilities

| Route | Page |
| --- | --- |
| `/` | Dashboard and derived financial summaries |
| `/transactions` | Search/filter and transaction entry; backend edit/reversal flows |
| `/accounts` | Manual accounts and credit cards; backend update/archive flows |
| `/budget` | Categories and allocations |
| `/goals` | Goal creation and funding; backend update/delete flows |
| `/investments` | Holdings, trades, dividends, portfolio views and quote refresh |
| `/recurring` | Recurring bills and status/payment controls |
| `/reports` | Financial report views and period controls |
| `/settings` | Profile/preferences and JSON data export |

The backend also has receipt/OCR, structured AI insight, FX, and CSV/Plaid-sandbox
import modules. Their presence does not mean every corresponding browser workflow
is available: bank connection and the dashboard's free-form AI question control
remain disabled. Reports CSV/PDF export and custom ranges, runtime currency/locale
switching, password changes, and two-factor authentication remain disabled too.

Investment V2 is partial: the API accepts optional linked cash accounts, but the
current trade/dividend forms lack dedicated account selectors. Historical event
currency capture and fully correct mixed-currency aggregate returns are unfinished.
Money Position still excludes recurring bills.
See [architecture limitations](docs/ARCHITECTURE.md#known-limitations).

## Verification commands

Run from the repository root:

```bash
npm run lint:frontend
npm run lint:backend
npm run build:frontend
npm run build:backend
npm run test:frontend
npm run test:backend
npm --prefix frontend run test:e2e:install
npm --prefix frontend run test:e2e:mock
```

Database integration coverage requires a configured, migrated test database.
A green run with DB tests skipped is not a full backend verification.
For a disposable local Compose test stack, the worker-isolating helper is:

```bash
bash scripts/test-compose-backend-regression.sh
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8080 npm --prefix frontend run test:e2e:backend
```

Run the regression helper **from the root**. The package-level
`frontend` script `test:backend:compose` still points at the old relative script
location; use the command above until that script is corrected.
The helper stops a running worker and restores it on exit; tests write to the
selected database. Use a test stack, not production data.

Mock Playwright runs build once and serve port 4173 with server reuse disabled.
With `PLAYWRIGHT_TEST_BASE_URL`, Playwright tests the external stack without
building or starting a local server. Regenerate screenshots with
`npm --prefix frontend run screenshots`; checked-in screenshots reflect an older UI.
No test counts or release certification are implied by this documentation refresh.

## Contribution and release workflow

`main` is protected by project policy. Work on `dev`, push to `dev`, then open a
PR with **base `main`, head `dev`**. Let required checks pass and merge through
that PR; do not push application or documentation changes directly to `main`.
Fetch and compare branches before starting; bring any main-only fixes into `dev`
before preparing the next release. The 2026-09-08 baseline incorporated the
main-only Kubernetes nginx resolver fix. See [CI/CD operations](docs/CI-CD-Operations.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [CI/CD operations](docs/CI-CD-Operations.md)
- [Disaster recovery](docs/Disaster-Recovery.md)
- Canonical Obsidian project: `~/main-brain/main-brain/03 Projects/Monikey/`.
  Start with its `README.md`; dated development/QA/release logs are historical
  evidence for their recorded revision, not automatic certification of current code.
