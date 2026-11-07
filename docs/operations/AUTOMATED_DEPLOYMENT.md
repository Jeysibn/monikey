# Automated deployment

## Release flow

1. A merge to `main` runs the existing frontend, API, and database checks.
2. CI publishes the frontend and API images as `sha-<40-character-commit>`.
3. The MoniKey deploy workflow dispatches that exact SHA to `homelab-gitops`.
4. GitOps takes a PostgreSQL custom-format dump and verifies it by restoring it into disposable PostgreSQL. The encrypted artifact is retained by GitHub Actions for seven days.
5. Only after backup verification does GitOps promote both images together. The migration Job uses the matching API image, which contains the canonical `database/001` through `006` SQL files and migration runner.
6. Argo CD runs the migration Job before changing either Deployment. A migration error fails the sync. GitOps waits for Argo CD `Synced` and `Healthy`, then checks `/api/health/ready` over the existing Tailscale route.

The normal release path needs no homelab shell access. PostgreSQL remains internal-only and the app remains on the private network.

## One-time GitHub setup

Set these MoniKey repository secrets:

- `HOMELAB_GITOPS_DISPATCH_TOKEN`: fine-grained token limited to `Jeysibn/homelab-gitops`, with permission to send repository dispatch events. Do not grant it Kubernetes, packages, or database access.

Complete the one-time adoption workflow in `homelab-gitops` before adding this
secret. That prevents the automatic release trigger from running before the
existing schema has been safely adopted.

The GitOps repository retains its existing secrets used by the backup and Argo CD workflows:

- `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`
- `MONIKEY_BACKUP_KUBECONFIG_B64`
- `MONIKEY_BACKUP_PASSPHRASE`
- `ARGOCD_SERVER` and `ARGOCD_AUTH_TOKEN`

Create a GitHub Environment named `monikey-migration-adoption` in `homelab-gitops`, require owner approval, and restrict deployments to `main`. Use it only for the initial schema adoption procedure. Protect the `main` branch as appropriate for the repository's automation commit policy.

## Initial safe adoption

The repository does not carry a live schema dump, and deployment remains deliberately unperformed in this work. The project record says the private database has migrations 002 and 003 deployed; it says 004 was not yet applied when documented. Treat that record as a lead, not proof.

Before enabling routine automatic releases:

1. Run the `MoniKey initial schema adoption` workflow in `homelab-gitops` against `main` and provide the current MoniKey image SHA. Approve the `monikey-migration-adoption` Environment only after confirming the workflow's backup restore check passed.
2. The Kubernetes migration Job compares the live schema with complete known migration landmarks and refuses partial or unknown states. It records checksums for the recognized baseline without executing those SQL files. It never executes `001_init.sql`.
3. The same Job applies later migrations in order and records their checksums. A failed migration leaves Argo CD from rolling out the new app image.
4. Confirm the workflow summary reports the deployed SHA, migration version, backup verification, Argo health, and API readiness.

If schema recognition fails, the Job stops without changing schema or financial rows. Resolve the mismatch with a reviewed forward-only migration plan; do not drop the database or reset its PVC.

## Rollback

To roll back application code, make a reviewed change in `homelab-gitops` that restores the previous matching frontend and API `sha-<commit>` tags, then merge it. Argo CD deploys that pair. Do not edit only one image tag.

Image rollback does not undo database migrations. Keep migrations backward-compatible with the prior API where possible. If an older API cannot read the new schema, stop and use the verified backup/restore recovery procedure; never use `001_init.sql` or reset the PVC as rollback.
