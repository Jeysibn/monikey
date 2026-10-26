# Database milestone 6

This directory contains the initial PostgreSQL schema, repeatable sample
category seed, and isolated accounting checks. The current schema has five
tables: `accounts`, `categories`, `transactions`, `credit_card_payments`, and
`account_transfers`.

The local Compose stack mounts the schema and seed into PostgreSQL's
first-volume initialization directory and stores data in a named volume. Those
scripts run only when that volume is empty. The Compose workflow and verified
restart/backup-restore evidence are documented in the
[Milestone 8–9 integration report](../docs/design/MILESTONE_8_9_INTEGRATION.md).

## Files

- `001_init.sql` creates the five tables, constraints, and lookup indexes. Run
  it once against a new, empty database. Do not rerun it against a database
  with user data; later schema changes need separately reviewed migrations.
  Account names are trimmed by the API and unique case-insensitively through a
  normalized unique index.
- `002_account_transfers.sql` adds liquid-account transfers to an existing
  database. Take and verify a backup before applying it. The API does not run
  migrations automatically.
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
account and target a credit card, or requiring both transfer accounts to be
liquid—remain API validation responsibilities, as specified in the TLD.
