# Restore drill — 2026-09-13

## Scope

This record captures a local, isolated recovery exercise. It is evidence that
the repository's PostgreSQL and receipt archive procedures worked for the
tested revision; it is not a production RPO/RTO certification and does not
prove off-host copy, retention, alerting, or Kubernetes recovery.

Revision tested: `e9b60f7` plus the backup-verifier fixes committed immediately
after the exercise.

## PostgreSQL exercise

1. Started a dedicated Compose project named `monikey-drill` with its own
   `monikey-drill_postgres_data` volume.
2. Applied all 24 repository migrations using the cached migration image.
3. Ran the idempotent system seed.
4. Created a compressed plain-SQL dump and checked gzip/SQL plausibility.
5. Restored the dump into a separate `monikey_restore_drill` database.
6. Compared the source and restored database.

Observed comparison:

| Check | Source | Restored |
| --- | ---: | ---: |
| Completed Prisma migrations | 24 | 24 |
| System categories | 11 | 11 |

The full backend suite then passed against the isolated source database: 47
test files and 358 tests.

## Receipt exercise

A dedicated temporary receipt directory containing a known marker was archived,
validated, changed after backup, and restored with the repository helpers. The
restored marker matched the original value and one file was recovered.

The exercise exposed and fixed two helper defects:

- SQL verification used `head` under `pipefail`, causing valid dumps to fail
  when gzip received SIGPIPE.
- Sourcing `.env` overrode an explicitly selected receipt source/restore path.

Regression coverage now lives in `scripts/backup/verify.test.sh`.

## Remaining deployment evidence

- Configure and observe scheduled database and receipt backups in GitOps.
- Verify off-host copy and retention behavior.
- Alert on stale or corrupt archives and low backup storage.
- Run a production-like cluster restore with the deployed ingress, secrets,
  immutable image digests, and object volume ownership.
- Record measured recovery time and maximum recoverable data age before setting
  production RTO/RPO claims.

## Related

- [Disaster recovery](../Disaster-Recovery.md)
- [Deployment contract](deployment-contract.md)
- [Observability](observability.md)
