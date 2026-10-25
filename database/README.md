# Database milestone 6

This directory contains the initial PostgreSQL schema, repeatable sample
category seed, and isolated accounting checks. The application uses exactly
four tables: `accounts`, `categories`, `transactions`, and
`credit_card_payments`.

## Files

- `001_init.sql` creates the four tables, constraints, and lookup indexes. Run
  it once against a new, empty database. Do not rerun it against a database
  with user data; later schema changes need separately reviewed migrations.
  Account names are trimmed by the API and unique case-insensitively through a
  normalized unique index.
- `seed.sql` inserts the approved income and expense categories. Its unique key
  and `ON CONFLICT DO NOTHING` make repeated runs safe.
- `tests/accounting.sql` uses fictional records inside a transaction and rolls
  them back after checking account balances, card debt, overpayment, monthly
  totals, month boundaries, edits, and deletes.
- `test.sh` starts a temporary PostgreSQL container without publishing a port
  or mounting persistent storage, applies the schema and seed twice, runs the
  accounting checks, and removes the container on exit.

## Run the checks

From the repository root:

```bash
bash database/test.sh
```

Docker must be running. The default test image is pinned to
`postgres:17.6-alpine`; set `MONIKEY_TEST_POSTGRES_IMAGE` to use another
PostgreSQL image. The test container is disposable and contains only synthetic
records.

The schema enforces local row constraints and foreign keys. Rules that depend
on more than one row—such as requiring a card payment to come from a liquid
account and target a credit card—remain API validation responsibilities, as
specified in the TLD.
