# Disaster Recovery

Reviewed against the current repository scripts and Compose configuration on
2026-09-12. This remains a procedure reference, not evidence of a completed
restore drill.

## What must be recovered

- PostgreSQL data (`postgres_data` volume), including migrations and financial records.
- Receipt files (`receipt_data` volume mounted at `/data` in API/worker), together
  with the matching database receipt metadata.
- Deployment configuration, credentials and the exact application revision/image.
  Keep secrets in the deployment's secret store, not in Git or this documentation.

Base Compose uses PostgreSQL 18 and does not publish the database port. The API
runtime user/group is `monikey:monikey`. Container paths and service names are not
automatically host paths or host-resolvable database addresses.

## Existing helper scripts

| Script | Actual behavior and prerequisites |
| --- | --- |
| `scripts/backup/pg-backup.sh` | Runs host `pg_dump` against configured connection values; writes compressed plain SQL to `backups/pg` by default |
| `scripts/backup/pg-restore.sh` | Prompts, attempts to drop/recreate the configured database, then imports SQL; requires host `psql` and a reachable database |
| `scripts/backup/receipt-backup.sh` | Archives the configured local receipt path into `backups/receipts`; it fails if the source path is missing and does not discover or mount a Compose volume |
| `scripts/backup/receipt-restore.sh` | Prompts, deletes the configured local receipt directory, then extracts the archive into its parent |
| `scripts/backup/verify.sh` | Read-only gzip/tar validation for database and receipt archives; suitable as a scheduler post-check |

Run helpers from the repository root so `.env` and relative backup directories
resolve as intended. A DATABASE_URL using `db` is valid inside Compose but usually
not from the host. Likewise, `/data/receipts` is normally inside the container.
Use a compatible PostgreSQL client (the database container supplies one).

The scripts have limits: restore remains destructive and interactive. The
database restore validates gzip archives before changing state, uses the
`postgres` maintenance database for drop/create, and enables psql's
`ON_ERROR_STOP`; an exit message alone is still not proof of a complete recovery.

## Backing up the base Compose deployment

From the repository root, create backup directories and choose a unique prefix.
The following examples assume the configured receipt directory is `/data/receipts`;
check `RECEIPT_STORAGE_PATH` before using them. Quiesce API/worker writes during a
coordinated database/receipt snapshot if cross-store consistency is required.

```bash
set -o pipefail
mkdir -p backups/pg backups/receipts
backup_stamp=$(date +%Y-%m-%d_%H-%M-%S)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain' | gzip > "backups/pg/monikey-${backup_stamp}.sql.gz"
docker compose exec -T api tar czf - -C /data receipts > "backups/receipts/receipts-${backup_stamp}.tar.gz"
gzip -t "backups/pg/monikey-${backup_stamp}.sql.gz"
tar tzf "backups/receipts/receipts-${backup_stamp}.tar.gz"
scripts/backup/verify.sh "backups/pg/monikey-${backup_stamp}.sql.gz" "backups/receipts/receipts-${backup_stamp}.tar.gz"
```

`-T` avoids allocating a terminal for binary archive output. The receipt archive
uses a `receipts/` top-level directory so its intended extraction parent is `/data`.
If the source is absent, investigate; do not assume an empty backup is correct.
Keep verified copies off the application host and record revision, timestamp,
database version, archive format and receipt path together.

## Restore sequence

Rehearse in an isolated deployment before using a backup for live recovery.
A restore replaces state; preserve the current volumes or take a separate backup
before replacing them. Never use `docker compose down -v` as a routine stop command.

1. Select matching database/receipt backups and the application revision they
   belong to. Check archive integrity and paths before extraction.
2. Provision an isolated PostgreSQL instance of a compatible version. Stop API
   and worker writes to the restoration target. Connect administration commands
   to the `postgres` maintenance database and import into an explicitly selected
   empty database with `psql -v ON_ERROR_STOP=1`.
3. Restore receipt files into the target deployment's actual `receipt_data`
   volume at the configured path, not a similarly named host directory. For the
   archive above, extract into `/data` and restore ownership to `monikey:monikey`
   using the matching backend image/volume.
4. Check `_prisma_migrations` against the selected source revision. Base Compose's
   `migrate` service runs migrations only. Run the idempotent system seed explicitly
   if required; never run the demo seed against recovered production data. Apply
   only intended migrations.
5. Start the selected API, worker and web deployment after validating database and
   storage configuration. Check readiness and inspect logs before accepting traffic.
6. Verify authentication, representative account balances and transaction history,
   goal funding, investment records and receipt retrieval. Confirm no unexpected
   recurring payments or notification replay occurred during recovery.

The helper restore scripts operate on their configured host-visible targets;
copying their invocation into a default Compose shell does not attach them to the
right database or volume. Do not mix host restore paths with container restore paths.

## Recovery evidence and scheduling

A successful drill should record the restored revision, backup timestamps,
database version, record/balance checks, receipt checks, errors and elapsed time.
Set RPO/RTO and backup retention based on that measured process; no fixed numbers
are certified here. The repository contains backup helpers but base Compose has
no scheduled backup service. Configure scheduling/off-host retention explicitly
and run `scripts/backup/verify.sh` as a post-backup check. Monitor archive
integrity, missing backups and storage capacity. The repository does not own the
scheduler or off-host copy; those belong to the deployment/GitOps layer.

For deployment and branch workflow, see [CI/CD operations](CI-CD-Operations.md).
