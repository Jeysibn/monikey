# Database milestone 6

This directory contains the initial PostgreSQL schema, repeatable sample
category seed, and isolated accounting checks. The financial model has five
tables: `accounts`, `categories`, `transactions`, `credit_card_payments`, and
`account_transfers`.

Migration 005 adds two Kakeibo metadata tables alongside those five financial
tables. It does not replace or alter the accounting model.

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
  migrations automatically. This migration is applied in the current private
  homelab deployment; other existing databases still need the migration before
  running the updated API.
- `003_current_account_amounts.sql` allows signed account baselines for current
  balance/debt corrections (ADR-018). Take and verify a backup before applying
  it to an existing database; apply 002 first if needed. No financial records
  are rewritten by the migration. Creation still requires nonnegative opening
  amounts through API validation.
- `004_account_card_product.sql` adds the nullable `card_product_id` presentation
  choice and constraints for its ID format and cash-account exclusion (ADR-020).
  Compose applies it while initializing a new empty database. Verify a backup
  before applying it manually to an existing database; the API does not apply
  migrations automatically.
- `005_kakeibo.sql` adds nullable category-default and transaction envelope
  fields, the Kakeibo monthly plan and weekly review tables, and a report-supporting
  index. Existing expense transactions remain `NULL` (unclassified); the
  migration does not infer or rewrite their classification. It does not write
  financial ledger rows. Verify a backup before applying it to an existing
  database; the API does not apply migrations automatically. Compose applies
  it after 004 when initializing a new empty database.
- `seed.sql` inserts the approved income and expense categories. Its unique key
  and `ON CONFLICT DO NOTHING` make repeated runs safe.
- `tests/accounting.sql` uses fictional records inside a transaction and rolls
  them back after checking account balances, card debt, overpayment, monthly
  totals, month boundaries, edits, and deletes.
- `tests/kakeibo_before_migration.sql` creates fictional pre-feature accounts,
  transactions, a card payment, and a transfer in the disposable DB.
  `tests/kakeibo_migration.sql` checks that their balances and rows survive 005,
  verifies old transactions remain unclassified, and exercises metadata
  constraints. Its test-only writes are rolled back.
- `test.sh` starts a temporary PostgreSQL container without publishing a port
  or mounting persistent storage, applies the schema, simulates the old baseline
  constraints, applies migrations 003–005, seeds categories twice, runs the
  migration-preservation and accounting checks, and removes the container on exit.

## Run the checks

From the repository root:

```bash
bash database/test.sh
```

Docker must be running. The default test image is pinned to
`postgres:17.6-alpine`; set `MONIKEY_TEST_POSTGRES_IMAGE` to use another
PostgreSQL image. The test container is disposable and contains only synthetic
records.

The test does not inspect or mutate the live homelab database. Its migration
check verifies that pre-existing cash/bank/card positions, transaction rows,
card payments, and transfers remain unchanged.

## Kakeibo data and arithmetic

Kakeibo stores planning and reflection metadata only. Its two tables are
`kakeibo_month_plans` (one row per first-of-month date) and
`kakeibo_weekly_reviews` (one row per Monday). Plans use these distinct values:

```text
available_to_allocate = planned_income + allocated_starting_funds
                        - savings_target - prior_period_debt_reserve
unallocated = available_to_allocate - needs_limit - wants_limit
              - culture_limit - unexpected_limit
```

These figures describe the plan, not account cash. Negative `unallocated` is
valid and must be shown as over-allocated. `actual_saved_declared` is optional,
self-reported, and never calculated from budget leftovers, balances, or
transfers. A prior-period debt reserve is a planning field; card payment records
remain excluded from expense totals, and current-period purchases and repayment
must not be budgeted twice.

Envelope actuals come from expense transactions in the selected calendar month.
Card purchases count once as their transaction; card payments and liquid
transfers do not count. Income has no envelope. A historical expense with a
NULL envelope appears in the separate unclassified amount, included in total
expenses. A category default is only a suggestion; changing it never changes
transaction classifications.

At closeout, the API stores a snapshot object containing decimal-string
`actual_income`, `total_expenses`, `unclassified`, and an `envelopes` object
with `needs`, `wants`, `culture`, and `unexpected` totals. The snapshot records
the report used for the reflection; later ledger edits do not rewrite it. The
API compares it with current report totals and surfaces a changed-actuals
indicator. The API validates and generates the snapshot; clients cannot submit
report totals as a snapshot.

API contracts implemented in PR B (migration 005 itself does not implement endpoints):

- Extend transaction read/create/update JSON with optional
  `kakeibo_envelope` (`needs`, `wants`, `culture`, `unexpected`, or `null`). An
  old create payload may omit it and saves as NULL. On update, omission from an
  old client preserves the stored value; explicit `null` clears it. Income must
  have NULL. Include `default_kakeibo_envelope` in category reads; a category
  default can be set or cleared only for an expense category. Proposed
  `PATCH /api/categories/{id}/default-kakeibo-envelope` body:
  `{"default_kakeibo_envelope":"needs"}` or `null` to clear it.
- `GET /api/kakeibo/months/{YYYY-MM}` returns the saved plan or explicit
  `plan: null` plus the dashboard. `PUT` upserts `planned_income`,
  `allocated_starting_funds`, `savings_target`, `prior_period_debt_reserve`,
  the four `*_limit` values, and `monthly_intention`.
- `GET /api/kakeibo/months/{YYYY-MM}/report` returns planned/actual income,
  per-envelope actuals and remaining limits, unclassified and total expenses,
  and savings target/declaration fields.
  `PUT /api/kakeibo/months/{YYYY-MM}/review` accepts bounded review answers
  and optional `actual_saved_declared`; the server computes and stores the
  snapshot from its current report rather than accepting client totals. The
  report flags when current actuals differ from the closeout snapshot.
- `GET`/`PUT /api/kakeibo/weeks/{YYYY-MM-DD}` returns the ledger summary and
  upserts `surprise_note`, `worthwhile_note`, and `next_week_intention`; the
  path date must be Monday.
- Keep all money values as decimal strings. Invalid month/week/envelope fields
  use the existing `{ "error": { "code", "message", "field"? } }` envelope.
  Planning and review endpoints may mutate only Kakeibo metadata, never
  accounts or financial ledger rows.

## Backup and recovery prerequisite

Before applying migration 005 to an existing database, take and verify a
database backup and rehearse migration plus restore against a copy of the prior
schema with synthetic data. Application rollback alone does not roll back the
schema; use a tested forward-compatible rollback plan or restore the verified
backup. Project notes record a manual backup artifact with seven-day retention,
but off-cluster long-term retention and recovery after node/storage failure
remain unverified. Do not treat that workflow as a complete disaster-recovery
plan.

The schema enforces local row constraints and foreign keys. Rules that depend
on more than one row—such as requiring a card payment to come from a liquid
account and target a credit card, or requiring both transfer accounts to be
liquid—remain API validation responsibilities, as specified in the TLD.
