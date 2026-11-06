# Automated GitOps release and rollback

This guide describes the workflow added by ADR-022. It does not authorize a
merge, a live deployment, or a production database change. MoniKey remains a
private, unauthenticated personal finance app.

## One-time setup

1. Merge the `homelab-gitops` automation PR first. It adds the reusable backup
   workflow, a namespace-scoped migration Job permission, and the adoption
   workflow. It removes the old standalone SQL hooks so only the tracked runner
   applies future migrations.
2. Merge the MoniKey automation PR. CI runs all checks and publishes paired
   `sha-<full-commit>` images. Automatic GitOps dispatch is gated off until
   adoption completes.
3. In MoniKey repository Actions secrets, add
   `HOMELAB_GITOPS_DISPATCH_TOKEN`. Use a fine-grained token limited to
   `Jeysibn/homelab-gitops`, with **Contents: write** (to dispatch the workflow)
   and **Actions: read** (to wait for its result). No Kubernetes credential
   belongs in the MoniKey repository.
4. In GitOps repository Actions secrets, retain the existing
   `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `MONIKEY_BACKUP_KUBECONFIG_B64`, and
   `MONIKEY_BACKUP_PASSPHRASE`. The kubeconfig identity must use the updated
   `monikey-backup` Role, which can create/read Jobs and read Job pod logs in
   the `monikey` namespace, plus its existing pod/exec rights. Do not copy any
   secret values into Git.
5. In GitHub Settings → Environments for `homelab-gitops`, create
   `monikey-adoption` and require an owner reviewer. This gate protects only the
   one-time adoption job.
6. In GitHub Settings → Variables for MoniKey, leave
   `MONIKEY_GITOPS_AUTOMATION_ENABLED` unset (or `false`) until adoption is
   complete. This makes initial image publication safe while the existing
   database still has no ledger.
7. Run **Actions → MoniKey schema adoption → Run workflow** in `homelab-gitops`
   on `main`. Enter the full SHA of a MoniKey image that contains
   `database/migrate.py`, and confirm the live database input. The workflow
   first creates a PostgreSQL custom-format backup and restores it into a
   disposable PostgreSQL instance. After that passes, the protected environment
   asks for approval. Its Kubernetes Job inspects the live schema and records
   checksums for the recognized migrations already represented there. It runs
   no migration SQL. An unknown, partial, empty, or inconsistent schema stops
   adoption without writing the ledger.
8. Confirm the adoption workflow summary shows the detected version and that
   the backup restore check passed. Then set
   `MONIKEY_GITOPS_AUTOMATION_ENABLED=true` in MoniKey repository variables.
   The next merge to MoniKey `main` starts a normal automatic release.

The current homelab schema is expected to match through migration 003, based on
the existing deployment records. The adoption workflow checks the live schema;
do not assume this expected version if its check reports something else.

## Normal release

For each merge into MoniKey `main`, Actions runs frontend, backend, and database
checks, builds the images, publishes both images under the same immutable
commit SHA, and dispatches that SHA to `homelab-gitops`. The GitOps workflow
creates and restore-verifies an encrypted database backup before committing
the matching tags. Argo CD applies PostgreSQL resources, runs the tracked
migration Job under an advisory lock, then rolls out the API and frontend.
Actions waits for the migration Job, checks both Deployment image tags and
rollouts, calls the private API readiness endpoint over Tailscale, and reports
the deployed SHA, highest migration version, and health results in its summary.

The migration ledger is `public.schema_migrations`. It contains version,
filename, SHA-256 checksum, and application time. A changed historical SQL file,
missing version, unknown schema shape, failed migration, or checksum mismatch
stops the sync. Add a new `database/NNN_name.sql` file for a new forward-only
migration; never edit a migration already recorded in a database.

The backup artifact remains encrypted and expires after seven days, matching
the existing backup workflow. It is temporary recovery transport, not
long-term off-cluster retention. Keep a separate owner-controlled encrypted
backup before relying on any live finance data.

## Image rollback

1. Choose a previously deployed full SHA whose API is compatible with the
   current database schema. Migration files are forward-only; an image rollback
   does not roll back the database.
2. In `homelab-gitops`, change both API and frontend image tags in
   `kubernetes/platform/monikey/manifests/application.yaml` to that same prior
   SHA and merge the GitOps change. Leave `migration.yaml` on the newest runner
   image so it understands the current migration ledger.
3. Argo CD syncs the manifest change. Confirm both Deployments are healthy and
   check `/api/health/ready` on the private network.

If the prior API cannot read the migrated schema, do not roll back the image
alone. Stop and use the verified backup with the owner-approved recovery
procedure; restoring data is not part of the automatic release workflow.

## What runs where

- MoniKey Actions can publish GHCR images and request a GitOps release; it has
  no cluster credential.
- GitOps Actions reuses the existing Tailscale and encrypted backup setup.
- Argo CD owns normal Kubernetes desired state and runs the migration Job before
  application Deployments.
- No command on the homelab machine is part of a normal release.
