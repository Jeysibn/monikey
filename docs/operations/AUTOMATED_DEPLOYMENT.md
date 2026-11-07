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

The repository does not carry a live schema dump, and deployment remains deliberately unperformed in this work. The project record says the private database has migrations 002 and 003 deployed; it says 004 was not yet applied when documented. Treat that record as a lead, not proof.

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
