# GitOps release handoff — 2026-09-13

This is the deployment-owned handoff for the MoniKey application release
contract. It is a procedure and audit record, not a mutation of the external
`homelab-gitops` repository.

## Current external finding

Read-only inspection of `homelab-gitops` `main` at observed revision
`0c6399b` found:

- MoniKey API, worker, web, and migration manifests use mutable `:latest`
  references.
- The migration Job runs `npx prisma migrate deploy` against the MoniKey
  runtime image, but this repository deliberately removes `npm`, `npx`, and
  the Prisma CLI from that runtime image.
- PostgreSQL is already declared as `postgres:18-alpine`.
- The MoniKey ingress is HTTP-only for `monikey.homelab.local`; no TLS
  section or ingress-owned security-header configuration was present in the
  inspected manifest.
- The deployment ConfigMap sets `NODE_ENV=development`,
  `APP_ORIGIN=http://monikey.homelab.local`, and `SESSION_SECURE=false`.
  These values require explicit deployment-owner review before any production
  claim. No MoniKey backup `CronJob` or off-host backup wiring was present in
  the inspected manifest directory.

Re-check the revision before acting because GitOps may have advanced.

## Required release procedure

1. From a successful `publish.yaml` run for the reviewed `main` commit, copy
   the API and web OCI digests from the workflow summary. The backend digest
   applies to both API and worker images when they are built from the same
   backend context.
2. Update the external GitOps workload references for API, worker, web, and
   the migration Job to explicit `image@sha256:...` values. Do not substitute
   `latest` or a commit-SHA tag for the digest.
3. Make the migration Job use the separately published
   `ghcr.io/jeysibn/monikey-migration@sha256:...` image, which contains the
   Prisma CLI and npm. Do not invoke `npx` in the hardened API/worker runtime
   image.
4. Commit the GitOps change and let Argo CD reconcile it. Confirm the desired
   and live image references match the recorded digests.
5. Confirm migration Job success before accepting API/worker rollout. Check
   API readiness, worker logs, web response headers, and the deployment's
   receipt volume mount.

## Verification commands in the deployment environment

Run with the appropriate namespace and Argo application name substituted:

```bash
kubectl -n <namespace> get application <argo-app> -o yaml
kubectl -n <namespace> get deploy monikey-api monikey-worker -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{range .spec.template.spec.containers[*]}{.image}{"\n"}{end}{end}'
kubectl -n <namespace> get job -l app.kubernetes.io/name=monikey-migrate -o wide
kubectl -n <namespace> logs job/<migration-job> --all-containers=true
kubectl -n <namespace> get pods -l app.kubernetes.io/part-of=monikey -o wide
```

Then verify through the actual public hostname:

```bash
curl -fsS https://<public-host>/api/v1/health/ready
curl -sSI https://<public-host>/ | tr -d '\r' | grep -Ei 'strict-transport-security|content-security-policy|x-content-type-options'
curl -sS -o /dev/null -w '%{http_code}\n' https://<public-host>/docs
curl -sS -o /dev/null -w '%{http_code}\n' https://<public-host>/openapi.json
```

The expected `/docs` and `/openapi.json` status depends on the deliberate
production `PUBLIC_API_DOCS` policy; record the observed status and configured
reason. Do not treat local nginx headers as proof of ingress/TLS, cookie,
HSTS, forwarded-IP, or rate-limit behavior.

## Status

`NOT VERIFIED IN THIS WORKSPACE`: `kubectl` is unavailable, the external
GitOps repository was not modified, and no production hostname or cluster
credentials were supplied. The read-only manifest audit also found the
HTTP/development/session configuration and no in-repository backup schedule;
these remain deployment-owner actions. See [deployment contract](deployment-contract.md)
and [disaster recovery](../Disaster-Recovery.md) for the related release and
recovery boundaries.
