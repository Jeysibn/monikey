# MoniKey PostgreSQL database

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
- `006_kakeibo_plan_presence.sql` adds nullable `plan_presence` after 005.
  `saved` and `not_saved` are explicit states; pre-006 rows remain NULL and
  therefore `legacy_unknown`. It never infers intent from zero-valued columns.
  Compose and both disposable test runners apply it after 005.
- `007_custom_categories.sql` adds an archive flag, checks for nonblank trimmed
  names, normalized case-insensitive uniqueness, and a trigger that keeps a
  category's income/expense type immutable. A transaction trigger blocks new
  references to archived categories, including from an older API after an
  application rollback, while allowing an existing transaction to retain its
  archived ID. It preserves existing category IDs and financial rows. It is
  additive, but a verified backup is required before applying it to an existing
  database. The migration runner still requires authorization from the existing
  backup-gated release flow.
- `008_category_icons.sql` adds nullable `categories.icon_key` presentation
  metadata with a database allowlist matching the frontend Lucide registry and
  API validation. Existing rows remain `NULL`; it preserves category IDs,
  types, archive state, defaults, transaction references, amounts and saved
  Kakeibo classifications. Verify a backup before applying it to an existing
  database. The API does not apply migrations automatically.
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
- `tests/kakeibo_plan_presence_before.sql` creates a fictional ambiguous legacy
  reflection before migration 006; `tests/kakeibo_plan_presence.sql` verifies
  its values remain unchanged, stays unknown, and accepts only the new states.
- `tests/custom_categories_before.sql` creates synthetic ledger rows before
  migration 007; `tests/custom_categories_migration.sql` checks that category
  identity, envelope defaults, amounts, classifications, row counts, and the
  computed account balance remain unchanged. `tests/custom_categories.sql`
  exercises the database constraints and triggers for immutable type and
  fail-closed archive behavior.
- `009_category_colors.sql` adds nullable `categories.color_key` (one of ten curated names such as `green`, or a custom
  lower-case `#rrggbb`; never any other CSS, enforced by a CHECK) and widens the
  icon allowlist to a strict superset of 008's. Existing rows stay `NULL`;
  nothing is backfilled, and IDs, transactions, amounts, archive state,
  defaults and saved Kakeibo classifications are unchanged. Additive, but a
  verified backup is still required, and the existing backup-gated release flow
  still authorizes it.
- `tests/category_colors_before.sql` / `tests/category_colors_migration.sql`
  verify the 008→009 upgrade (history and balances unchanged, no backfill, old
  icon still valid) and the new color and icon constraints.
- `tests/category_icons_before.sql` creates a synthetic pre-008 transaction;
  `tests/category_icons_migration.sql` verifies migration 008 leaves its
  category ID, amount, envelope and account balance unchanged, allows a
  registry key, and rejects an arbitrary URL.
- `test.sh` starts a temporary PostgreSQL container without publishing a port
  or mounting persistent storage, applies the schema, simulates the old baseline
  constraints, applies migrations 003–009 in order, seeds categories twice,
  runs migration-preservation and accounting checks, and removes the container
  on exit.
- `rehearse_recovery.sh` builds an earlier schema with fictional records in a
  disposable PostgreSQL 17.6 container, creates and inspects a custom-format
  backup, restores it to an independent database, applies migrations 005–009
  to a second restored copy, and calls the API against that copy. It
  compares account positions, financial row counts and totals before and after.
- `rehearse_http_integration.py` exercises a fresh Compose stack through the
  frontend's same-origin `/api` proxy with synthetic data. Start the isolated
  stack with the commands in the release runbook first. It does not launch a
  browser and is not a substitute for keyboard, screen-reader, viewport, or
  visual acceptance.

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

The migration and recovery rehearsal is:

```bash
sg docker -c 'bash database/rehearse_recovery.sh'
```

It is a disposable synthetic rehearsal, not proof that a production backup is
available or recoverable. See the [Kakeibo release runbook](../docs/operations/KAKEIBO_RELEASE_RUNBOOK.md).

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

## Plan presence and legacy rows

Migration 006 adds nullable `plan_presence`. API plan writes set `saved`, while
a reflection-only insert sets `not_saved`. A deliberately saved all-zero plan
remains a plan. A reflection-only month returns `plan: null` and keeps its
answers and snapshot in a separate top-level `review` field.

Rows created before migration 006 remain `NULL` (`legacy_unknown`). Their intent
cannot be inferred reliably because prior review-only writes populated plan
columns with zero defaults. Migration 006 performs no backfill. The API keeps
their stored plan values readable with an explicit `legacy_unknown` status and
returns their reflection separately. The UI asks the owner to confirm these
values; an explicit plan save marks them `saved`. Do not batch-mark legacy rows
as saved or unsaved without reviewing their history.

## API and financial data boundaries

The API contract is implemented in `backend/main.py` and summarized in
[`backend/README.md`](../backend/README.md) and the [TLD](../docs/architecture/TLD.md).
Database migration files change schema; they do not create API routes. The API
uses decimal strings for money and PostgreSQL/Python `Decimal` for saved
financial calculations.

Kakeibo has four fixed envelope values: `needs`, `wants`, `culture`, and
`unexpected`. A transaction stores its own nullable envelope. A category's
`default_kakeibo_envelope` is only a suggestion for future entries. Income has
no envelope. Card purchases count once as expenses; card payments and liquid
transfers do not count as expenses.

Migration 007 and the category API preserve stable category IDs and historical
transaction references. Archived categories remain readable and may be retained
when editing an existing transaction, but cannot be assigned to a new one. A
category may be permanently deleted only when no transaction references it.
The API locks and checks references, while the foreign key remains the final
database guard.

## Backup and recovery prerequisite

Before applying any pending migration to an existing database, follow the
current [GitOps release runbook](https://github.com/Jeysibn/homelab-gitops/blob/main/docs/MoniKey-Runbook.md): create a backup, restore it into disposable PostgreSQL, and pass the existing release gates. The repository's local rehearsal uses synthetic data; it does not prove a production backup is recoverable. Application image rollback alone does not roll back schema changes. Off-cluster retention and recovery after node/storage failure remain unverified. Never reset the production volume as a rollback method.

The schema enforces local row constraints and foreign keys. Rules that depend
on more than one row—such as requiring a card payment to come from a liquid
account and target a credit card, or requiring both transfer accounts to be
liquid—remain API validation responsibilities, as specified in the TLD.
