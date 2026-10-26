# FastAPI backend

This is the FastAPI API for the MoniKey v1 contract. It uses FastAPI,
Pydantic validation, Psycopg 3, direct parameterized SQL, and the five tables
defined in [`../database/001_init.sql`](../database/001_init.sql).

The API also has a local production-like image in `backend/Dockerfile`. The
root Compose stack starts it on the private network and waits for PostgreSQL
readiness. See the [Milestone 8–9 integration report](../docs/design/MILESTONE_8_9_INTEGRATION.md).

Account editing adds `GET /api/accounts/{id}` for stored opening values and
`PUT /api/accounts/{id}` for updates. Account type remains immutable; name,
opening balance/debt, and a card's credit limit are editable. This endpoint
change is implemented. A local Compose API smoke check verified that changing
a card's opening debt changes computed debt by the same amount and restoring
the stored opening value restores computed debt. The backend test suite has
not been run for this follow-up.

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
debt. Apply `database/002_account_transfers.sql` to an existing database after
a verified backup before deploying this API version.

The routes and response shapes are described in the [TLD API contract](../docs/architecture/TLD.md#6-api-contract-version-1-api-prefix).
