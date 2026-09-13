# Incident: worker database migration gap (2026-09-13)

## Symptoms

The Kubernetes worker entered `CrashLoopBackOff` with:

```text
PrismaClientKnownRequestError: The table `public.worker_jobs` does not exist
code: P2021
```

The API remained healthy because the durable worker job runner is initialized
only by `dist/worker.js`.

## Cause

The cluster deployed a newer `monikey-api` image before applying its Prisma
migrations. The database migration ledger stopped at
`20260909090000_password_reset_tokens`; the image expected
`20260912100000_durable_worker_jobs` and later migrations. The production image
also removes `npm`, `npx`, and the Prisma CLI, so it cannot run
`prisma migrate deploy` directly.

## Recovery

1. Confirm the failing workload and inspect the migration ledger:

   ```bash
   kubectl -n monikey get deploy,pod
   kubectl -n monikey exec postgres-0 -- \
     psql -U monikey -d monikey -c \
     'select migration_name, finished_at from _prisma_migrations order by started_at desc limit 10'
   ```

2. Run `prisma migrate deploy` from a temporary Node migration pod using the
   checked-in `backend/prisma` directory and the same `monikey-config` and
   `monikey-secrets` as the application. Do not manually create only
   `worker_jobs`; all pending migrations must be applied in order.

3. Restart and verify the worker:

   ```bash
   kubectl -n monikey rollout restart deployment/worker
   kubectl -n monikey rollout status deployment/worker --timeout=120s
   kubectl -n monikey logs deployment/worker --tail=100
   ```

The recovery completed successfully. The worker reported
`worker connected to database; durable job runner registered` and returned to
`Running`.

## Prevention

The GitOps release must execute migrations as a dedicated pre-rollout Job (or
use a separate migration image containing the Prisma CLI and migrations), wait
for successful completion, and only then roll out API/worker workloads. Pin
application images by digest and associate the migration Job with the same
release version. A migration Job must not run application seed commands.

As a deployment check, compare the image release revision with
`_prisma_migrations` before starting the worker. A worker startup failure with
Prisma `P2021` for a newly introduced table indicates that migration gating has
been bypassed.
