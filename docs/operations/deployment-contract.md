# Deployment contract

This repository owns application source, migrations, container builds, and
release metadata. The external GitOps repository owns Kubernetes manifests,
secrets, ingress, backup scheduling, and rollout policy.

## Image identity

The publish workflow emits human-readable SHA and `latest` tags, but the
authoritative deployment identity is the digest recorded in the workflow
summary:

```text
ghcr.io/jeysibn/monikey-api@sha256:<digest>
ghcr.io/jeysibn/monikey-web@sha256:<digest>
```

GitOps should resolve and pin those digests rather than deploying `latest`.
The workflow also requests OCI provenance and SBOM attestations; vulnerability
scanning remains a release gate.

## Handoff

1. A merge to `main` publishes changed images.
2. The workflow verifies the pushed SHA tag and records its immutable digest.
3. GitOps updates every relevant deployment reference to the digest, including
   API, worker, web, and migration images.
4. GitOps runs migrations using the published
   `ghcr.io/jeysibn/monikey-migration@sha256:...` image, which includes the
   Prisma CLI, npm, and checked-in migrations, waits for success, and only then
   makes the new API and worker available. The production runtime image is not
   a migration image: it removes `npm`, `npx`, and the Prisma CLI.

## Current external-state audit

The reachable `homelab-gitops` `main` revision was `0c6399b` on 2026-09-13.
Its MoniKey manifests currently use `ghcr.io/jeysibn/monikey-api:latest` and
`monikey-web:latest`, so the digest handoff described above is not yet consumed.
Its migration Job also invokes `npx prisma migrate deploy` against that runtime
image, while this repository deliberately removes `npx` from the runtime image.
The inspected manifest also defines an HTTP-only ingress and sets
`NODE_ENV=development`, an HTTP `APP_ORIGIN`, and `SESSION_SECURE=false`; no
MoniKey backup schedule or off-host backup wiring was present in that manifest
directory. These are actionable deployment contract gaps. The GitOps
repository owns the desired-state fixes; it was inspected read-only and not
changed by this task. Until corrected and verified in Argo/K3s, deployment
readiness is not certified.

This repository does not contain Kubernetes manifests and does not assume
access to the deployment cluster.

## Related

- [CI/CD operations](../CI-CD-Operations.md)
- [Configuration](configuration.md)
- [Disaster recovery](../Disaster-Recovery.md)
- [Worker migration incident runbook](incidents-2026-09-13-worker-migration.md)
