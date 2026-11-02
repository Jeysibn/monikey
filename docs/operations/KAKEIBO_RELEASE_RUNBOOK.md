# Kakeibo release and recovery runbook

This runbook describes a future private-homelab release. It does not authorize or perform a production migration or deployment. MoniKey has no authentication; keep its writable API on a trusted private network and do not publish it to the internet.

## Before a release

- Confirm the reviewed application commit and immutable frontend/backend image tags (prefer the commit SHA). Record the current deployed image tags and database schema state.
- Confirm the maintenance window, database access path, operator, and rollback decision maker.
- Take a verified logical backup of the live database using the approved homelab procedure. Verify the artifact with PostgreSQL restore tooling and restore it into a separate disposable database. Record the artifact location, checksum, PostgreSQL version, and restore result.
- Confirm the backup is available outside the cluster and beyond the existing seven-day GitHub artifact retention. The current artifact workflow alone is not long-term disaster recovery.
- Confirm the database and application remain private. Do not expose writable endpoints publicly.
- Review the release-specific smoke checks below and make sure the prior application image is available for application rollback.

Do not begin if the backup cannot be read and restored, the database starting schema is unclear, or an operator cannot restore the prior application image.

## Migration inventory and order

The database initialization files are ordered as follows:

1. `database/001_init.sql` — core accounting tables and seed categories.
2. `database/003_current_account_amounts.sql` — signed current-account amounts.
3. `database/004_account_card_product.sql` — card product metadata.
4. `database/005_kakeibo.sql` — optional envelope fields and Kakeibo plan/review metadata.
5. `database/006_kakeibo_plan_presence.sql` — explicit plan-presence state.

`database/002` is the seed file in the fresh-install Compose sequence; it is not a numbered schema migration. Before upgrading an existing database, inspect its schema and apply only migrations that are actually missing, in order. Do not replay `001_init.sql` against an existing database. Compose's `/docker-entrypoint-initdb.d` scripts run only when PostgreSQL initializes an empty data directory; changing the Compose mounts does not migrate an existing volume.

For a reviewed database host, the operator should use the established private connection and substitute the approved database name and credentials without putting secrets in shell history. Apply each missing migration in order, stopping on the first SQL error:

```bash
psql "$MONIKEY_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/005_kakeibo.sql
psql "$MONIKEY_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/006_kakeibo_plan_presence.sql
```

Run only the commands for migrations confirmed missing. Do not use production credentials in local or CI environments.

Migration 006 leaves existing `plan_presence` values NULL. Such rows are reported as `legacy_unknown`: their stored amounts and reflections remain readable, but the system does not guess whether an old all-zero row was a deliberate plan or was created by a reflection-only save. The owner can confirm by saving a plan. New review-only rows are `not_saved`; an explicit plan save, including an all-zero plan, is `saved`.

## Application compatibility and rollout

The backend and frontend should be promoted as a reviewed compatible pair. The backend returns decimal strings for monetary values and includes `plan_status`; the frontend tolerates older responses without that field. The monthly review also remains available separately from the optional plan. Keep the reviewed prior backend and frontend SHA-tagged images available until smoke checks pass.

Deploy only the reviewed images through the approved GitOps process after the owner authorizes deployment. Do not use mutable `latest` tags. Keep the service private throughout rollout.

## Health and smoke checks

After an authorized rollout:

- Check database readiness and backend `/api/health/ready`, then confirm the frontend health endpoint.
- Load Overview, Activity, Accounts, and Kakeibo in the browser. Verify account balances, card debt, and wallet artwork are present.
- Read a month with no plan and verify `plan_status: "not_saved"` and `plan: null`; save an all-zero plan and verify `plan_status: "saved"`.
- Save a monthly reflection without a plan and confirm it remains available without creating a plan. Save a reflection with a plan and verify that only an explicit review save refreshes its actuals snapshot.
- Record or edit a synthetic/approved test expense and verify it counts once in the selected envelope. Confirm card payments and liquid transfers do not count as envelope expenses.
- Compare account balances and card debt before and after plan, classification, and reflection metadata operations. They must be unchanged.
- Check application logs for migration, API, or frontend errors. Do not log personal financial data or credentials.

## Success criteria

The release succeeds when readiness checks pass, the four primary views load, explicit and absent plan states display correctly, review snapshots behave as documented, envelope actuals match expense transactions, payments/transfers remain excluded, and account balances/card debt remain unchanged by Kakeibo metadata writes.

Record the deployed image SHAs, migration versions, smoke-check results, and operator/time in the release record.

## Rollback and recovery

Application rollback and schema rollback are different operations. If application smoke checks fail, roll the frontend/backend images back to the recorded compatible SHA pair while keeping the database schema in place. Migrations 005 and 006 are additive and the application should tolerate their optional fields; do not drop columns or tables as an application rollback step.

If the database itself is damaged or the migration has changed data unexpectedly, stop writes and follow the approved database recovery procedure. Restore the verified pre-release backup into a controlled recovery target, validate accounting records and positions, and then coordinate cutover under the incident procedure. A database restore can discard writes made after the backup; decide whether to preserve or reconcile those writes before recovery. Do not improvise destructive reverse SQL in production. Prefer a forward corrective migration for a schema defect.

Rollback decision points:

- Readiness or UI/API contract failure with healthy database: roll back application images.
- Accounting totals or balances differ: stop application writes and investigate before any further promotion.
- Migration error before completion: stop; inspect transaction outcome and schema state, then resume only with an approved recovery plan.
- Backup cannot be restored or is not available outside the cluster: do not proceed with migration or release.

## Recovery limits

PR E rehearsal uses fictional records and disposable PostgreSQL containers only. It demonstrates the commands and checks; it does not verify a live homelab backup, off-cluster retention, production restore time, or production cutover. Those remain explicit prerequisites for a separately approved deployment. No production database operation is included in this change.

## PR E disposable verification record

On 2026-11-03, the prior-schema rehearsal ran with PostgreSQL 17.6 using:

```bash
sg docker -c 'bash database/rehearse_recovery.sh'
```

The script built a pre-Kakeibo schema through migration 004 with synthetic accounts, transactions, one card payment, and one liquid transfer. It captured 3 accounts, 3 transactions, 1 payment, 1 transfer, totals of 1375.00 / 100.00 / 50.00, and account positions of 1725.00 / 1050.00 / 250.00. A custom-format `pg_dump` artifact passed `pg_restore --list`; restoring it into another database reproduced all counts, totals, and positions. Applying only 005 and 006 to a separate restored copy preserved the same figures and left all historical envelope values NULL. The API served the migrated copy and successfully saved a no-plan review and then an explicit zero plan without changing financial figures.

The built frontend and backend were also started with the isolated Compose project `monikey-kakeibo-pr-e` using a placeholder password and an ephemeral volume. `python3 database/rehearse_http_integration.py` passed against `http://127.0.0.1:8080/api` through Nginx. It used only fictional data and checked monthly plans, classifications, payments/transfers exclusion, weekly and monthly reflections, snapshot change detection, validation errors, transaction editing/deletion, and unchanged account positions across metadata writes. The project was removed with `sg docker -c 'docker compose -p monikey-kakeibo-pr-e down --volumes'` after the rehearsal.

No Chromium, Chrome, Firefox, Playwright package, or browser test harness was installed in the environment. The HTTP test verifies the built React asset is served and exercises the same-origin proxy, but does not claim interactive browser, keyboard, screen-reader, viewport, or visual acceptance. Those checks remain outstanding.
