# MoniKey delivery and GitOps deployment

This page explains the repository-defined release path. It does not authorize a
release or prove what is currently running. The detailed operational source of
truth is the [homelab-gitops MoniKey runbook](https://github.com/Jeysibn/homelab-gitops/blob/main/docs/MoniKey-Runbook.md).

## What happens after a change

1. A pull request runs `.github/workflows/ci.yml`: frontend lint, unit tests and
   build; artwork validation; database and API tests; and frontend/API container
   builds. The image-publishing job only runs after a successful push to
   MoniKey `main`.
2. A successful `main` CI run publishes frontend and API images tagged with the
   same full commit SHA, for example `sha-<40-character-SHA>`. These tags make
   the image pair traceable to source; they are not human release numbers.
3. `.github/workflows/deploy.yml` runs after CI. It accepts only successful CI
   for a push to MoniKey's own `main`, verifies both images, then completes the
   `Request GitOps deployment` step. The repository-dispatch request is
   conditional on `HOMELAB_GITOPS_DISPATCH_TOKEN`; step success alone does not
   prove GitOps received an event.
4. The GitOps repository listens for `repository_dispatch` event type
   `monikey-release` and also supports owner-triggered `workflow_dispatch`
   releases. One-time schema adoption is an optional gated mode. The GitOps
   workflow validates run/SHA provenance and image availability before release work.
5. Before promotion, GitOps creates and restore-verifies a PostgreSQL backup
   using disposable PostgreSQL. It promotes the matching image pair through a
   GitOps pull request, runs the controlled migration hook, and checks Argo CD
   synchronization, health, and API readiness. See the linked runbook for the
   exact gates and recovery steps.

MoniKey owns application code, tests, image builds and dispatch requests.
`homelab-gitops` owns Kubernetes desired state, backup/release operations and
Argo CD reconciliation. Argo CD compares that desired state with the cluster
and applies the repository's configured synchronization behavior.

## Current evidence and limits (2026-11-10)

MoniKey `main` at `1f0408b5fcad91b19f2732e9ca50502b6c995ba1` passed CI in
[run 42671970066](https://github.com/Jeysibn/monikey/actions/runs/42671970066).
[Deploy run 42678284875](https://github.com/Jeysibn/monikey/actions/runs/42678284875)
completed image verification and its dispatch request step. Read-only GitOps
Actions history contained no corresponding `repository_dispatch` release run.
The latest GitOps manifest commit inspected was
`96754c441461fa125f019ecc1678904ce529eae1`, and its frontend/API images still
pointed to MoniKey SHA `971322b1d6a31c813bbda0c94ecb68ae53afd044`. The owner
reports the production release is on hold because the homelab location has an
internet connectivity problem. The currently running image and database schema
are unknown; do not claim latest `main` or migration 007 is deployed.

No secret values were inspected. The source code shows dispatch is conditional
on the named token, but this page does not infer whether that repository secret
is configured. A workflow step that exits successfully after intentionally
skipping dispatch is not proof of delivery.

## Safe learning and validation

For local work, use the [mock preview](../../README.md#run-a-mock-preview),
frontend tests, and disposable Compose/database test procedures in the
[learning guide](../LEARNING_GUIDE.md#stage-3-develop-and-test-locally).
Do not use a production database, cluster command, manual workflow run, or
GitOps edit as a learning exercise. A release requires the owner's separate
approval and the existing backup, migration, promotion, and health gates.
