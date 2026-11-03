# MoniKey Kakeibo final release plan

**Status:** planning only. No backup, cluster, database, migration, image, GitOps, or application operation is authorized by this document.

**Reviewed:** 2026-11-03

| Item | Repository evidence reviewed |
| --- | --- |
| MoniKey source | `feat/card-artwork-discovery` at `273035a66ad1770e171c20e624644e68797baf56`; PR #10 is open as a draft against `main`. CI run [41623085926](https://github.com/Jeysibn/monikey/actions/runs/41623085926) passed checks for this exact head; publish was skipped. |
| MoniKey `main` | `3a93b860168a4433d0ab3f2b52648f20a11a1205` at inspection. |
| GitOps `main` | `d791038c4b728536100c7d9e8c646aa26f005fac` at inspection. |
| GitOps PR #86 | Open; head `4412668cc870cee3f501e33bf7f982b88824f69f`; adds only `docs/MoniKey-Kakeibo-Release-Prep.md`. It changes no active manifests or workflows. |
| Runtime state | Not inspected. Current Kubernetes context, deployed images, database schema, backup artifact state, and Argo health are unknown. |

This plan uses repository evidence and the previously reported successful manual backup run. It does not prove that the live cluster, schema, or retained backup currently matches these files.

## Release order and dependencies

1. **Source approval (Gate A).** Review PR #10 and its exact head, artwork policy, migrations, tests, and CI. Approval to merge PR #10 authorizes the MoniKey `main` push only. A successful push runs CI and publishes images; it does not deploy them or authorize database work.
2. **Recovery proof (Gate B).** After homelab access returns, produce a fresh encrypted backup with the existing manual workflow, preserve it in durable owner-controlled storage, verify its checksum, and restore that retained artifact into an isolated disposable PostgreSQL instance. This can be completed before source merge or migration. A backup job passing its pre-encryption restore alone does not pass this gate.
3. **Read-only inventory (Gate C preflight).** Confirm the intended Kubernetes context, namespace, Argo application, current image pair, and database schema. Inventory migrations 002–006 from catalog metadata only. Unknown or partial state stops the release.
4. **Schema changes (Gate C authorization).** After Gate B and the inventory review, approve and apply only the exact missing migrations, one at a time, from the canonical MoniKey checkout. Do not use an Argo sync as an unreviewed migration trigger.
5. **Image publication and verification.** After a separately approved merge of PR #10 to MoniKey `main`, verify that CI passed and the publish job completed. Record each resulting image digest. Publication can precede migrations because it does not change GitOps or the running application. Do not promote images until Gate C is complete.
6. **Application promotion (Gate D).** Approve a GitOps PR that points to the tested API/frontend pair. GitOps Argo automation will apply changes to the watched manifest path after that PR reaches GitOps `main`. Roll out the compatible backend first and confirm readiness, then the frontend; keep the previous image pair available.
7. **Acceptance (Gate E).** Perform read-only smoke checks first. Any write test requires separate, specific owner approval and must not create or silently alter live financial ledger entries.

### If PR #10 merges before migrations

A push to MoniKey `main` triggers CI. If checks pass, the existing `publish` job pushes frontend and API images tagged from the **resulting main push commit SHA**. The integration SHA `273035a…` is not necessarily that main commit SHA. This MoniKey workflow does not connect to Kubernetes, run migrations, or update GitOps. Argo watches the GitOps repository's `main`, not MoniKey `main`, and the GitOps image references remain at the previously reviewed `e549249…` pair until changed in GitOps. The new images therefore remain published but undeployed. Promoting them before the schema is ready can make Kakeibo API requests fail on missing columns/tables; do not do so.

## Repository and automation inventory

- MoniKey `.github/workflows/ci.yml` runs frontend, database/API, and container-build checks for pull requests and pushes to MoniKey `main`. Only a successful `push` to `refs/heads/main` runs `publish`, which pushes `ghcr.io/jeysibn/monikey-v2-api:sha-<push-sha>` and `ghcr.io/jeysibn/monikey-v2-frontend:sha-<push-sha>`. Pull request checks do not publish.
- GitOps `kubernetes/applications/monikey.yaml` defines Argo Application `monikey` in namespace `argocd`. It watches GitOps `main`, path `kubernetes/platform/monikey/manifests`, and deploys to namespace `monikey`. Automated sync, prune, and self-heal are enabled. A reviewed merge that changes active resources in that path can therefore deploy without a separate sync command.
- GitOps `.github/workflows/argocd-sync.yml` is a separate `workflow_dispatch` workflow on GitOps `main`; it can explicitly sync the selected Argo application, with prune defaulting to false. Do not dispatch it for this release plan. Argo's automated sync remains active independently of this workflow.
- GitOps `.github/workflows/k3s-ci.yml` validates Kubernetes changes; it is not the application image publisher. PR #86 changes documentation outside the watched manifest path and does not activate deployment or migrations.
- Current desired images in GitOps `application.yaml` are `ghcr.io/jeysibn/monikey-v2-api:sha-e54924985acb220797ba65254d1274f39365cabe` and the matching `monikey-v2-frontend` tag. These are desired-state references, not a live-cluster inspection.
- API and frontend Services are `ClusterIP`, each Deployment has one replica, and the checked-in PostgreSQL StatefulSet has one replica, image `postgres:17.6-alpine`, a Longhorn 5 GiB claim, and PVC retention `Retain` on scale/delete. This policy does not replace a tested backup. Desired probes are API `/api/health/live` and `/api/health/ready`, frontend `/healthz`, and database `pg_isready` startup/readiness/liveness checks. Live health is unknown.

## Approval gates

| Gate | Evidence and PASS condition | FAIL / BLOCKED | Approver and authorized next operation |
| --- | --- | --- | --- |
| **A — Source release** | Owner-reviewed PR #10 exact SHA; source tests, artwork validator, migration review, and GitHub CI pass; only neutral MoniKey card artwork ships; Atome is unavailable; PR is mergeable. | Any failing check, unreviewed file, unclear data compatibility, or artwork/rights regression. CI alone is not owner approval. | Repository owner approves merge to MoniKey `main`. This may publish SHA-tagged images after CI; it does not authorize deployment. |
| **B — Data recovery** | Fresh workflow run succeeds; encrypted artifact and checksum are copied outside cluster/GitHub's short retention to owner-controlled encrypted storage; checksum validates after download; artifact decrypts and restores into an isolated disposable database of the matching PostgreSQL major version; redacted restore evidence is retained. | Missing artifact/checksum, failed decrypt/restore, unverified retention/access, or only a pre-encryption restore. | Owner approves the specific manual backup run and an independent reviewer verifies the retained-artifact restore. Passing authorizes migration planning, not migration. |
| **C — Database** | Read-only inventory classifies every migration 002–006; the expected starting signatures are exact; backup Gate B passes; canonical SQL SHA and migration order are recorded; maintenance and stop plan are approved. | Any unknown/partial/mismatched object, failed backup proof, unavailable operator, or unexpected schema. | Owner plus designated database reviewer approves each exact missing migration. Only those SQL files may be applied. |
| **D — Application promotion** | Migration post-checks pass; published API/frontend tags resolve to recorded OCI digests; pair is compatible; previous image pair is available; a GitOps PR contains only the approved image promotion and is CI-clean. | Image/tag/digest mismatch, migration not complete, old pair unavailable, or active manifest changes outside scope. | Owner approves the GitOps PR merge. Because Argo auto-syncs, that merge authorizes the application rollout. |
| **E — Production acceptance** | Health checks pass; four views load; balances/card debt match the owner-verified pre-release summary; expense/payment/transfer accounting is correct; Kakeibo metadata behaves correctly; manual QA is recorded without exposing financial data. | Any balance discrepancy, API/UI errors, public exposure, unexpected ledger write, failed review behavior, or accessibility regression judged release-blocking. | Owner accepts the release. Write tests require a separate explicit authorization for each specific metadata operation; no live test transaction is included. |

No gate is passed by this documentation PR or by source CI alone.

## Existing backup workflow and recovery requirements

The existing workflow is `.github/workflows/monikey-db-backup.yml`; it is manual, not scheduled, and must not be replaced by a second backup system. A previously reported successful run confirmed the workflow could reach the homelab, dump PostgreSQL, restore the dump into a disposable database, encrypt it, and upload the artifact. This plan did not run the workflow or inspect an artifact.

The latest successful workflow run visible in GitHub is [41176702096](https://github.com/Jeysibn/homelab-gitops/actions/runs/41176702096), manually dispatched on 2026-10-31; two earlier dispatches that day failed. The run list establishes status only, not present artifact availability or recoverability. Seven-day retention means the reported artifact's nominal expiry is 2026-11-07; this plan did not inspect or download it.

The checked-in workflow requires `workflow_dispatch` on GitOps `main` with `confirm_live_backup: true`. It connects through `tailscale/github-action@v2` using the repository's Tailscale OAuth secrets, tag `tag:ci`, and `--accept-routes`. It writes the supplied kubeconfig to runner temporary storage with mode 0600. The namespace-scoped `monikey-backup` Role permits pod `get` and `pods/exec` `get`/`create` for `postgres-0` in namespace `monikey`. The workflow runs `pg_dump -Fc` against `monikey_dev`, restores the plaintext dump into a temporary `postgres:17.6-alpine` container, then encrypts with GPG symmetric AES-256 using the passphrase secret. It uploads the encrypted file as a GitHub Actions artifact with **7-day retention** and removes temporary dump, passphrase, and kubeconfig files in cleanup.

Current limitations: the checksum is computed into `$RUNNER_TEMP/backup.sha256` (and printed to the Actions log by `tee`) but is not included in the uploaded artifact; the disposable restore happens before encryption; the uploaded encrypted artifact is not downloaded, decrypted, and restored by the workflow; and the seven-day Actions artifact is temporary transport, not durable owner-controlled retention. A previous successful run is not proof that its artifact remains available or recoverable now.

Smallest recommended improvements to this workflow and procedure:

1. Include a checksum manifest and non-sensitive metadata (workflow run ID, source database PostgreSQL version, creation time) with the encrypted artifact. Do not include database rows, credentials, or connection strings.
2. After the manually approved run, have the owner download the artifact before expiry, verify it against the retained checksum, and copy the encrypted file plus manifest into an already approved owner-controlled encrypted store with documented retention and access. If no such store exists, durable recovery remains blocked until the owner chooses one.
3. Restore the **downloaded encrypted copy** in an isolated environment: verify checksum, decrypt using the protected passphrase, run `pg_restore --list`, restore into a disposable database with the matching PostgreSQL major version, and verify schema/object presence. Keep only redacted evidence (artifact/run ID, checksum, PostgreSQL version, pass/fail, elapsed time); do not retain financial rows or print balances.
4. Keep backup and restore actions manual and protected. Do not enable scheduled or unattended production access.

A future GitHub Actions read-only schema inventory is technically possible over the approved Tailscale path, but it is not present. Do not reuse the backup credential blindly: `pods/exec` grants command execution in the pod. Any future workflow needs a dedicated read-only database login, a read-only transaction, namespace/resource-scoped access, a protected manual dispatch and required human review, and redacted catalog-only output. It must query PostgreSQL catalogs only and never read finance rows. No such workflow is proposed for activation here.

## Read-only cluster and schema inventory

Run only after homelab access returns and an owner authorizes read-only inspection. Confirm context before any command; stop if it is unexpected. Do not read Kubernetes Secret values.

The following commands are read-only and are grounded in the current GitOps runbook/manifests:

```bash
kubectl config current-context
kubectl get applications -n argocd monikey
kubectl get pods,svc,pvc,ingress -n monikey
kubectl get certificate -n monikey
kubectl get deployment api frontend -n monikey \
  -o custom-columns='NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image,READY:.status.readyReplicas'
argocd app get monikey
```

Record the Argo sync/health, Deployment image identifiers, pod readiness, private ingress, and PVC identity without exporting Secret values. Current desired ingress is `https://monikey.homelab.local`; verify actual reachability stays private. GitOps desired state is not proof of live state.

For schema inventory, connect only through the separately approved read-only database credential. Do not query `accounts`, `transactions`, `credit_card_payments`, `account_transfers`, or Kakeibo data rows. The catalog-only SQL below reports schema metadata and no financial records:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT current_setting('server_version') AS postgres_version;
SELECT to_regclass('public.accounts') AS accounts,
       to_regclass('public.account_transfers') AS account_transfers,
       to_regclass('public.kakeibo_month_plans') AS kakeibo_month_plans,
       to_regclass('public.kakeibo_weekly_reviews') AS kakeibo_weekly_reviews;

SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('accounts', 'categories', 'transactions', 'kakeibo_month_plans')
ORDER BY table_name, ordinal_position;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('accounts', 'categories', 'transactions',
                    'account_transfers', 'kakeibo_month_plans', 'kakeibo_weekly_reviews')
ORDER BY c.relname, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('account_transfers', 'transactions')
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, a.attname AS column_name,
       col_description(c.oid, a.attnum) AS column_comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relname = 'kakeibo_month_plans'
  AND a.attname = 'plan_presence';

COMMIT;
```

Classify every migration as **APPLIED**, **MISSING**, **PARTIAL**, or **UNKNOWN** from its complete signature below. A filename, GitOps hook, Argo status, previous run log, or a single column is not proof. PARTIAL or UNKNOWN means stop and request a reviewed repair plan; do not replay the migration.

## Migration 002–006 checklist

The 002/003 hooks exist in GitOps, but their existence does **not** prove either migration ran successfully or that the live schema matches. Their canonical SQL is idempotent (`IF NOT EXISTS` in 002; `DROP CONSTRAINT IF EXISTS` in 003), but inspect the resulting definitions anyway. Migrations 004–006 are transactional but non-idempotent (`ADD COLUMN`, `ADD CONSTRAINT`, `CREATE INDEX`, and `CREATE TABLE` without `IF NOT EXISTS`). The current 002/003 PreSync hooks execute on Argo syncs. Argo documents that PreSync hooks run before the application's ordinary manifests and that hooks run on each sync, including unrelated changes; sync waves order resources within a phase and do not move ordinary Sync resources before PreSync ([Argo CD sync phases and waves](https://argo-cd.readthedocs.io/en/release-3.5/user-guide/sync-waves/)). Until the 002/003 signatures are reviewed, do not trigger or approve a GitOps sync. If policy requires no SQL to run as part of an Argo sync, removing/replacing those existing hooks requires a separate reviewed GitOps change; this documentation plan does not change them.

| File | Required prior state and APPLIED signature | MISSING / PARTIAL / UNKNOWN | Stop and post-check |
| --- | --- | --- | --- |
| `database/002_account_transfers.sql` | Base `accounts` table exists; `account_transfers` has the canonical columns, primary key, foreign keys and checks; both `idx_account_transfers_source_date` and `idx_account_transfers_destination_date` match the SQL. | MISSING only when table and both indexes are absent. PARTIAL if the table or one index exists without the complete signature. UNKNOWN for mismatched definitions. | This migration is idempotent but `IF NOT EXISTS` does not repair wrong definitions. Stop on a mismatch. After an approved controlled path, recheck the table/index definitions; financial rows must be unchanged. |
| `database/003_current_account_amounts.sql` | `accounts` exists and both legacy named nonnegative checks (`accounts_opening_balance_check`, `accounts_opening_debt_check`) are absent, with no equivalent unexpected restriction. | MISSING only when both named checks exist with the expected legacy definitions. PARTIAL if only one remains. UNKNOWN if names/definitions differ or equivalent constraints make the resulting semantics unclear. | It is an idempotent `DROP CONSTRAINT IF EXISTS`; do not infer success from its hook. After approved execution, verify those two constraints are absent and account/ledger values are unchanged. |
| `database/004_account_card_product.sql` | Migration 002/003 baseline understood; `accounts.card_product_id VARCHAR(64) NULL`, `accounts_card_product_id_format`, and `accounts_card_product_id_not_cash` match the canonical SQL. | MISSING only if the column and both constraints are absent. PARTIAL if any subset exists. UNKNOWN for wrong type, nullability, or constraint definition. | Requires an owner-verified backup/restore and exact absent signature. After applying, verify column/check definitions and preserve all account and ledger values. |
| `database/005_kakeibo.sql` | Categories and transactions have the expected base schema. APPLIED requires both envelope columns and all checks, `idx_transactions_kakeibo_date_envelope`, and both tables with matching columns, keys, date/amount/text constraints, and snapshot JSON validation. | MISSING only if all objects introduced by 005 are absent. PARTIAL if any subset exists. UNKNOWN if any type, check, index definition, or table shape differs. | Historical envelope values stay NULL; no historical classification or finance-row update is allowed. Verify schema signatures, historical NULL counts without returning transaction rows (aggregate count only if explicitly authorized), and accounting summaries. |
| `database/006_kakeibo_plan_presence.sql` | 005 is fully APPLIED; `kakeibo_month_plans.plan_presence` is nullable `VARCHAR(12)` with its allowed-value check and canonical column comment. | MISSING only if column, check, and comment are absent. PARTIAL if column/check/comment is incomplete. UNKNOWN for mismatched definitions. | Existing values remain NULL (`legacy_unknown`). Verify the column/check/comment and no financial value changes. Never backfill ambiguous plans. |

Before any migration: use a verified pre-change backup and successful restore of the retained encrypted artifact; record PostgreSQL version, current migration signatures, exact MoniKey commit and SQL checksums; schedule a short maintenance window; make sure the current app image pair is recorded; stop if the connection target or schema differs from the approved inventory. Any 002/003 hook that may execute on a later sync must have an understood, reviewed starting signature. Migrations 004–006 are not Argo hooks and must not be made automatic. Apply only one confirmed-missing canonical file at a time with stop-on-error behavior, for example after explicit approval:

```bash
# TEMPLATE ONLY — do not run without Gate C approval for this exact migration.
# Run from the MoniKey checkout at the approved source commit and only if the
# preflight classified this file as MISSING. Do not copy all lines as a batch.
psql "$MONIKEY_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f database/004_account_card_product.sql
# Separately approved and re-inventoried before each later migration:
psql "$MONIKEY_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f database/005_kakeibo.sql
psql "$MONIKEY_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f database/006_kakeibo_plan_presence.sql
```

The SQL files already open and commit their own transactions. Do not wrap them in a second transaction or run the three as a single unreviewed batch. On any SQL error, stop, preserve logs without credentials/data, re-run catalog-only inventory, and treat the result as PARTIAL/UNKNOWN until reviewed. Do not retry, drop objects, edit canonical SQL, or run `001_init.sql` against an existing database.

For a fully empty **new** database only, MoniKey Compose orders `001_init.sql`, `seed.sql`, and 004–006. Current GitOps `monikey-db-init` is stale: it still has nonnegative opening amount checks and lacks card/Kakeibo fields. Current MoniKey `001_init.sql` already includes liquid transfers and signed opening amounts, so fresh bootstrap does not separately need 002/003. A future GitOps bootstrap update must mirror the reviewed current `001_init.sql`/`seed.sql` plus fresh-install forms of 004–006 and be rehearsed against an empty disposable PostgreSQL volume. Changing `/docker-entrypoint-initdb.d` does not update an initialized volume; never delete/recreate the existing PVC to force initialization.

### First-install ordering hazard

The current 002 and 003 Jobs are `PreSync` hooks in the same Argo application as the PostgreSQL StatefulSet. They poll `pg_isready`, but PreSync runs before ordinary Sync resources. On a genuinely fresh cluster with no PostgreSQL pod yet, the hook can wait and time out before Argo creates the StatefulSet. A sync-wave annotation cannot make an ordinary Sync resource exist before a PreSync hook. Before a new install, design and rehearse a separate database/bootstrap stage: provision the database and final empty-volume schema, wait for PostgreSQL readiness and catalog checks, then synchronize the application/migration stage. Do not treat this ordering design as implemented, and do not trigger an install or sync from this plan.

## Image and GitOps rollout controls

After Gate A is separately approved, the MoniKey `main` push must pass `checks`; only then does `publish` build and push the API/frontend SHA tags for that exact resulting push commit. Verify the published manifests and record full OCI digests using an approved registry client, for example:

```bash
docker buildx imagetools inspect ghcr.io/jeysibn/monikey-v2-api:sha-<MAIN_PUSH_SHA>
docker buildx imagetools inspect ghcr.io/jeysibn/monikey-v2-frontend:sha-<MAIN_PUSH_SHA>
```

Replace the placeholder only with the actual main push SHA. Do not infer image availability from PR CI or from the integration SHA. Preserve the previous full-SHA image pair and verify it remains retrievable.

After Gate C migration checks, prepare a separate GitOps PR to `main` that pins the approved API and frontend pair (prefer tag plus immutable digest). Because Argo auto-sync, prune, and self-heal are active, merging changes under `kubernetes/platform/monikey/manifests` is the deployment trigger. Do not enable 004–006 as `PreSync` hooks. Promote the backend first and wait for `/api/health/ready`; then promote the frontend and wait for `/healthz`. Use separate reviewed GitOps changes if the existing manifest layout cannot stage these rollouts independently. Keep both services private; current desired services are `ClusterIP` and the documented ingress is LAN-only HTTPS at `monikey.homelab.local`.

The frontend Kakeibo routes require the Kakeibo backend and schema. A pre-Kakeibo backend may not serve them; a pre-Kakeibo frontend will not call them. Promote only the exact tested compatible pair after migrations. The database remains at its expanded schema during application rollback.

## Production smoke checks

Do read-only checks first. Use the owner present at the session to compare account balances and card debt with the recorded pre-release values; do not copy personal figures into GitHub, CI logs, this runbook, or public tickets.

- **Availability:** frontend `/healthz`, backend `/api/health/ready`, database readiness; inspect Argo health/sync and pod readiness.
- **Core views:** Overview, Activity, Accounts, and Kakeibo load without client/API errors; wallet cards render the neutral MoniKey artwork.
- **Accounting:** compare balances, card debt, credit limits, income/expense period totals, and net position against the pre-release owner-held baseline. Verify a card purchase is one expense, card payment is liability settlement only, and liquid transfers are neither income nor expense.
- **Kakeibo reads:** load a saved and missing month; verify an explicit all-zero plan differs from a reflection-only month; verify four envelopes and separate historical unclassified expenses; confirm review snapshot change warning when actuals differ.
- **Weekly/monthly reviews:** load saved notes and snapshots without overwriting them. No write is needed to smoke-test reads.
- **Write boundary:** do not create test expenses, payments, transfers, or income in production. Plan, category-default, classification, and reflection writes still change live metadata; perform them only with separate explicit owner approval for a precisely scoped operation and confirm account balances/ledger rows remain unchanged afterward.
- **Manual QA:** iOS Safari, Android Chrome, Firefox/WebKit where available, keyboard/focus and screen-reader checks remain separate acceptance items.

## Rollback, recovery, and stop conditions

**Application rollback** is a reviewed GitOps change restoring the previous verified compatible API/frontend image pair. Keep the additive schema in place; do not drop columns/tables as part of application rollback. Confirm the old API tolerates the added nullable fields before use. A failed readiness/API check with a healthy database can justify application rollback after owner approval.

**Database recovery** is separate and higher risk. Stop application writes and do not improvise reverse SQL. Restore only from the owner-verified retained backup into an explicitly approved recovery target, validate it before cutover, and plan how to reconcile writes since the backup. Never delete/recreate the production PVC or restore directly over the only database as a first diagnostic step.

Stop immediately if context/namespace is unexpected; the live catalog is unknown/partial; a backup checksum or encrypted-artifact restore fails; migration SQL or catalog signature differs; Argo begins an unplanned sync; any image digest differs; health checks fail; balances/debt change unexpectedly; the API becomes public; or a test would create an unapproved ledger entry. Preserve evidence without secrets or financial records and obtain owner/reviewer direction before continuing.

## Deferred until homelab access and explicit approvals return

- Verify the active Kubernetes context, `monikey` namespace, Argo application health/sync, private ingress, actual image pair, and PVC identity.
- Run the existing manual backup workflow only after its live-read confirmation is approved; retain and restore-test the encrypted artifact outside GitHub's seven-day window.
- Obtain the catalog-only live schema inventory and classify migrations 002–006; do not infer from hooks.
- Rehearse the GitOps first-install split, fresh schema ConfigMap, and any migration process in disposable environments.
- After Gates A–D, execute only approved changes and perform Gate E smoke and device/screen-reader checks.

**Production status remains BLOCKED.** This plan does not authorize merging PR #10, running the backup workflow, inspecting the live cluster/database, applying migrations, publishing images, triggering Argo, or deploying MoniKey.
