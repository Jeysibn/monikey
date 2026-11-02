# FastAPI backend

This is the FastAPI API for the MoniKey v1 contract. It uses FastAPI,
Pydantic validation, Psycopg 3, direct parameterized SQL, and the five tables
defined in [`../database/001_init.sql`](../database/001_init.sql).

The API also has a local production-like image in `backend/Dockerfile`. The
root Compose stack starts it on the private network and waits for PostgreSQL
readiness. See the [Milestone 8–9 integration report](../docs/design/MILESTONE_8_9_INTEGRATION.md).

Account editing uses `GET /api/accounts/{id}` for current amounts and
`PUT /api/accounts/{id}` to set the desired current amount. Send `name`, `type`,
`current_balance`, `current_debt`, and `credit_limit`; money fields are decimal
strings. Liquid accounts use current_balance with current_debt zero and no
credit limit. Cards use current_debt (negative means card credit), with
current_balance zero and a positive credit limit. Account type is immutable.
The server adjusts the stored baseline by target minus current position without
changing ledger rows or monthly income/expenses. Corrections whose resulting
baseline exceeds NUMERIC(12,2) are rejected with 422.

Existing databases require `database/003_current_account_amounts.sql` after a
verified backup (and migration 002 if not already applied). Account card choices
require `database/004_account_card_product.sql` after a verified backup. Apply
these migrations manually on existing databases; Compose includes migration 004
when initializing a new empty database. The API validates a card
ID's shape and rejects non-null choices for cash accounts, but it does not check
IDs against the frontend catalog. For ADR-020, apply migration 004, release the
API, then release the frontend that sends the card choice. Account editing's
current-amount contract still requires the matching frontend/API versions.

## Local setup

From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
```

Set `DATABASE_URL` to a local PostgreSQL database initialized with the database
schema and seed. Then run the API on loopback:

```bash
export DATABASE_URL='postgresql://monikey_app:change-me@127.0.0.1:5432/monikey'
backend/.venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

The credentials above are placeholders. MoniKey v1 has no authentication, so
keep any writable instance on a trusted private network.

## API tests

```bash
bash backend/test.sh
```

The test runner starts a disposable PostgreSQL container, applies the schema
and category seed, runs the API tests, and removes the container. It publishes
PostgreSQL only to a temporary loopback port and uses fictional test data.
Set `MONIKEY_TEST_POSTGRES_IMAGE` to override the default
`postgres:17.6-alpine` test image.

Liquid-account transfers use `/api/account-transfers` and their own database
table. Transfers affect both account balances but not income, expenses, or card
debt. Migration `database/002_account_transfers.sql` is included in the current
private homelab deployment. For another existing database, take and verify a
backup, apply the migration, then deploy this API version; the API does not run
migrations automatically.

## Kakeibo API (ADR-021)

Kakeibo routes require migration `database/005_kakeibo.sql`; the API does not
apply it automatically. On existing databases, follow the verified backup and
restore rehearsal requirements in [`../database/README.md`](../database/README.md)
before migration or release. Plans and reflections write only to the two
Kakeibo metadata tables.

- `GET`/`PUT /api/kakeibo/months/{YYYY-MM}` reads or saves a plan. An unsaved
  month is returned as `plan: null`. `GET .../report` returns ledger actuals,
  four envelope totals, unclassified expense totals, and plan arithmetic.
- `PUT /api/kakeibo/months/{YYYY-MM}/review` saves bounded written answers,
  optional self-declared savings, and a server-generated snapshot of report
  totals. It does not accept client-supplied totals.
- `GET`/`PUT /api/kakeibo/weeks/{YYYY-MM-DD}` reads the inclusive Monday–Sunday
  summary and upserts its reflection. The path date must be a Monday.
- `PATCH /api/categories/{id}/default-kakeibo-envelope` sets or clears an
  expense category's suggested envelope. It never changes existing
  transactions.
- Expense transaction create/read/update shapes carry nullable
  `kakeibo_envelope`. Older creates may omit it and remain unclassified; older
  updates that omit it preserve the current classification. Explicit `null`
  clears it. Income cannot have an envelope.

All money uses decimal strings in JSON. Reports sum only expense transactions
for envelope spending: card purchases count once, while card payments and
liquid-account transfers do not count. Historical NULL classifications remain
visible as unclassified and included in total expenses.

The routes and response shapes are described in the [TLD API contract](../docs/architecture/TLD.md#6-api-contract-version-1-api-prefix).
