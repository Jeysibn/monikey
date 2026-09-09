# Architecture

Source reconciliation: 2026-09-08. `dev` was fast-forwarded to `ab5c8ce`, the
reviewed `main` revision, before this documentation refresh was committed. The
main-only Kubernetes API-host qualification in the nginx entrypoint is therefore
part of the `dev` release baseline. This records source reconciliation only; it
does not certify a deployment or test run.

## Process topology

The browser loads a React SPA from nginx (`web`). In backend mode its same-origin
`/api/v1` requests are proxied to Fastify (`api`), which uses Prisma/PostgreSQL
(`db`). A separate `worker` process uses the same backend image and database.
Compose gates both backend processes on the one-shot `migrate` service, which
runs `prisma migrate deploy` **and** `prisma db seed`. Only web port 8080 is
published by the base Compose file. Local PostgreSQL is version 18; CI uses 16.

`compose.dev.yaml` changes the API and worker to source mounts and `tsx watch`.
`compose.observability.yaml` contains optional monitoring infrastructure.

## Frontend state boundary

`frontend/src/main.tsx` selects the runtime at build time:

| Mode | Provider and data path |
| --- | --- |
| Mock | `FinanceProvider` → external `financeStore` → synchronous `FinanceRepository` / `mockFinanceRepository` |
| API | `AsyncFinanceProvider` → `BackendFinanceGate` → `ApiFinanceGateway`, recurring gateway |

The mock store uses `useSyncExternalStore`; mutations execute against its latest
state and rejected mutations do not publish a new state. This synchronous
repository is specifically a mock contract, not an HTTP adapter interface.

The async provider manages loading/error/retry state, calls fallible asynchronous
commands, and supplies a `FinanceContext` bridge so shared pages can keep using
`useFinance`. Pages with backend-specific operations also use the optional async
context. `BackendFinanceGate` handles registration, sign-in, session recovery and
sign-out. Settings has its own API gateway. The modes do not have complete feature
parity, and tests must explicitly choose the intended mode.

`domain/` holds types and frontend validation; `state/financeSelectors.ts` holds
shared derived calculations; `hooks/` exposes those values to pages. Recurring
and settings features also have dedicated domain/hooks/gateway code. Investments
has been removed from the frontend (see "Investment accounting boundary
(disabled)" below).
The actual nine-route table is `frontend/src/App.tsx`; none of those routes uses
`Placeholder.tsx`.

## Clock, dates and currency

Mock mode injects `AppClock`, defaults to `2026-08-29`, and accepts a validated
`?today=YYYY-MM-DD` override. Calendar helpers use ISO dates and reporting periods
with inclusive start and exclusive end.

API mode does not receive that injected clock. Its `FinanceContext` bridge derives
`todayIso` from `new Date().toISOString().slice(0, 10)`; backend bootstrap and workers
handle dates separately. Do not claim a single injected clock across the full stack.

The shared money formatter uses module-level `en-PH`/`PHP` configuration.
`setCurrencyConfig` does not cause React rerenders; the existing Settings page
therefore keeps runtime currency/locale selection disabled. Backend currency and
FX fields do not make every frontend monetary display currency-aware.

## Money Position commitment scope

`safeToSpendBreakdown` subtracts credit-card minimums due within 30 days and
planned goal contributions from available cash, floored at zero. It still excludes
recurring bills even though recurring features now exist. Wiring those obligations
into this estimate remains a separate follow-up.

## Finance invariants

Mock mutations call `domain/financeRules.ts`. The API enforces authorization,
validation and balance effects in its services and database transactions;
`backend/src/modules/ledger/` is the central ledger boundary. SQL migrations also
carry constraints/triggers not fully expressible in Prisma's schema.

- Transfers are excluded from income/expense totals, including credit-card
  payments and investment principal movements.
- Asset overdrafts, credit-limit violations, card overpayment and goal overfunding
  are rejected by the relevant mutation paths.
- Goal funding debits the source account and records funded savings. A goal's
  planned monthly contribution is distinct from a recurring automatic payment.
- Category/account ownership and cross-user isolation must be enforced by the
  backend, regardless of frontend validation.

Use the regression tests and raw SQL migrations for exact edge cases; a frontend
validator alone is not proof that an API operation preserves an invariant.

## Client idempotency keys

Create requests carry opaque idempotency keys so retries can be recognized by the
API. `frontend/src/utils/idempotencyKey.ts` uses `crypto.randomUUID()` where it is
available. Browsers that expose Web Crypto without `randomUUID` use random bytes;
environments with no Web Crypto use a timestamp/random fallback. These keys are
for collision avoidance, not authentication or secret material. The transaction
modal keeps one generated key for a pending submission.

## Backend modules and workers

`backend/src/app.ts` constructs the app, providers and route modules. It registers
health, authentication, settings, accounts, ledger, bootstrap, budgets, goals,
recurring, receipts, reports, insights and imports under `/api/v1`. Investments
is deliberately unregistered (module and Prisma models left in place; see
"Investment accounting boundary (disabled)" below).
Swagger UI is registered at `/docs`, and the generated spec at `/openapi.json` on
the API process. nginx also proxies `/docs` and `/openapi.json` at the web origin.

Authentication uses Argon2id passwords, random session tokens with only their
hashes stored, HttpOnly/SameSite=Lax cookies, and Secure cookies in production.
State-changing browser routes enforce the configured origin. Rate limiting,
request IDs, centralized error handling and redacted Pino logging are implemented.

`backend/src/worker.ts` runs on startup and every 60 seconds. It processes recurring
items, notification scheduling/delivery and daily snapshots, with quote and FX
refresh conditional on provider configuration. This is an in-process interval
runner, not a durable queue or a multi-worker scheduling guarantee.

Provider interfaces/adapters cover FX, quotes, OCR, AI insights, object storage,
email and bank import. Live adapters need their configured providers/credentials;
CI uses stubs. Plaid is sandbox-only. Receipt data is stored on the shared local
volume in Compose; PostgreSQL and receipt files need separate backups.

## Investment accounting boundary (disabled)

The Investments feature has been removed from the running app pending a
rebuild: `investmentsRoutes`/`fx.module`'s FX-rate route wiring are no longer
registered in `app.ts`, the frontend has no `/investments` route or nav entry,
and the Reports/Dashboard investment cards are gone. The module code
(`backend/src/modules/investments/**`) and its Prisma models
(`InvestmentTrade`, `Dividend`, `Instrument`, `QuoteSnapshot`, etc., latest
migration `20260902073707_investments_v2_schema`) are left in place
untouched — no destructive migration — so a future rebuild can reuse or
replace them. `BootstrapService` and the insights context builder still query
`investmentTrade`/`dividend`/`quoteSnapshot` directly; with no route able to
create rows, they simply return empty investment data, so the rest of the app
is unaffected.

## UI and accessibility

Shared CSS lives in `frontend/src/styles/global.css`, design tokens in
`styles/tokens.css`, and page styles beside their pages. Shared components include
AppShell, AddTransactionModal, MoneyPosition, Card, Sparkline, ProgressBar,
StatusBadge, Toast and the authentication gate. Forms use native controls,
validation feedback and dialog patterns. Responsive and accessibility assertions
exist in Playwright; historical screenshots/test reports are not a fresh UI audit.

## Testing

Frontend Vitest covers selectors, validation, state/providers, gateways and page
interactions. Backend Vitest includes both unit and integration files, serializing
files to avoid races on shared database fixtures. Full integration coverage needs
PostgreSQL. Playwright separates mock tests from tagged `@backend-compose` tests;
external base URLs bypass its local build/preview server.

Use commands in [README](../README.md#verification-commands) and distinguish local
checks from the jobs actually enabled in [CI](CI-CD-Operations.md).

## Known limitations

- Investment account selectors, FX-unavailable UI treatment, historical currency
  capture and fully converted mixed-currency aggregate returns remain unfinished.
- Plaid access-token storage still has encryption TODOs; very large import amounts
  have an explicit bigint-to-Number precision FIXME.
- Expired sessions are rejected/opportunistically removed, but a periodic cleanup
  sweep remains unimplemented.
- Disabled UI includes bank connection, free-form AI questions, report CSV/PDF
  exports/custom ranges, currency switching, password changes and two-factor auth.
- The `frontend` package's `test:backend:compose` script changes to the repository
  root before running `scripts/test-compose-backend-regression.sh`.
