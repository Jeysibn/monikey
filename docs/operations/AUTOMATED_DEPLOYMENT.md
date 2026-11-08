# Automated deployment

## Release flow

1. A push to `main` runs the existing frontend, API, and database checks.
2. CI publishes the frontend and API images as `sha-<40-character-commit>`.
3. The deploy workflow accepts only a successful CI run for a push to MoniKey's own `main`, verifies both GHCR image tags, then dispatches that exact SHA.
4. GitOps takes a PostgreSQL custom-format dump and verifies it by restoring it into disposable PostgreSQL. The encrypted artifact is retained by GitHub Actions for seven days.
5. Only after backup verification does GitOps promote both images together. The migration Job uses the matching API image, which contains the canonical `database/001` through `006` SQL files and migration runner.
6. The default-off migration gate is enabled only in that backup-gated promotion. Argo CD runs the migration Job before changing either Deployment. A migration error fails the sync. GitOps waits for Argo CD `Synced` and `Healthy`, then checks `/api/health/ready` over the existing Tailscale route.
7. After success, GitOps turns the migration gate off and verifies one final Argo sync. Releases whose SHA is no longer MoniKey `main` or whose image tags are missing are rejected.

The normal release path needs no homelab shell access. PostgreSQL remains internal-only and the app remains on the private network.

## Dispatch contract and troubleshooting

The MoniKey `Deploy MoniKey` workflow sends a GitHub `repository_dispatch`
event to `homelab-gitops` with event type `monikey-release` and this payload:

```json
{
  "event_type": "monikey-release",
  "client_payload": {
    "image_sha": "<full MoniKey commit SHA>",
    "monikey_run_id": "<successful CI run ID>"
  }
}
```

The GitOps workflow listens for that exact event type and checks that the run
ID belongs to a successful CI push on MoniKey `main`, that its SHA matches the
payload, and that the SHA is still the current MoniKey `main`. The sender uses
the `HOMELAB_GITOPS_DISPATCH_TOKEN` secret; its documented minimum scope is
`Contents: write` on the `homelab-gitops` repository. Never print or share the
token value.

### Known dispatch issue on current `main`

The `Request GitOps deployment` step reads `MONIKEY_RUN_ID` while constructing
the payload, but the workflow currently defines that variable only on the
preceding image-verification step. GitHub Actions environment values are
step-scoped, so they do not carry into the dispatch step. If the dispatch token
is configured, payload construction fails before the HTTP request. If the token
is empty, the existing default-off path records a successful skip instead.

This needs a separate owner-approved workflow fix. Until then, a successful
MoniKey deploy job alone does not prove that a GitOps event was sent. No
production trigger was changed as part of this documentation or test work.

### Read-only triage

- **Deploy job skipped:** confirm the source CI run was successful and came
  from a push to MoniKey's own `main`. Pull-request CI is intentionally excluded
  from publication and deployment.
- **Images not verified:** inspect the CI publish result and verify both
  frontend and API SHA tags exist. Do not update GitOps to a one-sided image
  pair.
- **No GitOps release run:** inspect the `Request GitOps deployment` step
  logs. The step summary records an explicit disabled-token skip; a
  payload-construction error appears in the step log. After the approved
  run-ID handoff fix, check GitOps Actions for the `repository_dispatch`
  event. Do not paste token values into logs or issue comments.
- **GitOps verification or backup failed:** inspect the `verify-release` and
  `backup` jobs. The release is designed to stop before promotion if source
  provenance, image pairing, or disposable restore verification fails. Do not
  bypass these gates.
- **Promotion or sync failed:** inspect the promotion PR checks, freshness
  recheck, migration Job, and Argo CD health/readiness steps. Do not manually
  change an image tag or rerun a migration to work around a failed gate; use
  the runbook and preserve the existing rollback procedure.

## One-time GitHub setup

After initial adoption succeeds, set this MoniKey repository secret:

- `HOMELAB_GITOPS_DISPATCH_TOKEN`: fine-grained token limited to `Jeysibn/homelab-gitops`, with `Contents: write` permission for the repository dispatch endpoint. Do not grant it Kubernetes, packages, or database access.

Do not add this secret until after one-time adoption succeeds. Before then, the
MoniKey workflow still builds and publishes images but records that dispatch was
skipped.

The GitOps repository retains its existing secrets used by the backup and Argo CD workflows:

- `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`
- `MONIKEY_BACKUP_KUBECONFIG_B64`
- `MONIKEY_BACKUP_PASSPHRASE`
- `ARGOCD_SERVER` and `ARGOCD_AUTH_TOKEN`

Create a GitHub Environment named `monikey-migration-adoption` in `homelab-gitops`, require owner approval, and restrict deployments to `main`. Use it only for the initial schema adoption procedure. Protect the `main` branch so the GitHub Actions promotion bot can create its paired image and migration-gate commits.

## Initial safe adoption

This section preserves the initial adoption procedure for auditability; it is not evidence of current live state. The repository does not carry a live schema dump. An earlier project record noted migrations 002 and 003 deployed and 004 not yet applied at that time; treat that as historical context, not proof. Before any future adoption action, use the current GitOps release evidence and the approved schema-inspection procedure.

Use this first-release order; it keeps Argo CD auto-sync from applying an
unapproved migration:

1. Configure the existing GitOps backup and Argo CD secrets, then create and protect the `monikey-migration-adoption` Environment.
2. Merge MoniKey PR #14 while `HOMELAB_GITOPS_DISPATCH_TOKEN` is absent. CI publishes both images; the post-CI workflow explicitly skips dispatch.
3. Copy the successful MoniKey main commit SHA from that CI run. Set the API image in `kubernetes/platform/monikey/manifests/migration-runner.yaml` on GitOps PR #101 to `ghcr.io/jeysibn/monikey-v2-api:sha-<that-SHA>`, then merge PR #101. Its Argo PreSync check has migration apply disabled; with no ledger it stops before changing schema or financial rows.
4. In GitHub Actions for `homelab-gitops`, run **MoniKey release and initial adoption** on `main`. Enter the same full MoniKey SHA and set `adopt_existing_schema` to `true`.
5. Wait for the backup job to restore-verify its dump. Approve the pending `monikey-migration-adoption` Environment job only after that backup job succeeds.
6. The Kubernetes Job checks known schema landmarks, records checksums for the recognized baseline without executing those migrations, then applies missing migrations in order. It never executes `001_init.sql`. Argo CD cannot roll out the new image if the Job fails.
7. Confirm the workflow completes both Argo health checks and reports the SHA, migration version, and API readiness. The workflow then disables adoption and migration-apply gates.
8. Add `HOMELAB_GITOPS_DISPATCH_TOKEN` to MoniKey. Future successful main pushes run without approval or homelab shell access.

If schema recognition fails, the Job stops without changing schema or financial rows. Resolve the mismatch with a reviewed forward-only migration plan; do not drop the database or reset its PVC. A failed migration leaves its gate on only for retrying the same backup-verified release; no later image is promoted until the current release finishes.

## Rollback

To roll back application code, make a reviewed change in `homelab-gitops` that restores the previous matching frontend and API `sha-<commit>` tags, then merge it. Argo CD deploys that pair. Do not edit only one image tag.

Image rollback does not undo database migrations. Keep migrations backward-compatible with the prior API where possible. If an older API cannot read the new schema, stop and use the verified backup/restore recovery procedure; never use `001_init.sql` or reset the PVC as rollback.
