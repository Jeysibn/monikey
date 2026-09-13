# CI/CD Operations

Reviewed against `.github/workflows/` on 2026-09-13. The project workflow is
**push to dev → PR from dev to protected main → merge → image publication**.
Main protection is the owner's stated policy; its remote settings were not
independently verified because GitHub CLI was unauthenticated during this review.

## Branch workflow

From a clean working tree, fetch and compare before editing:

```bash
git fetch origin
git switch dev
git merge --ff-only origin/dev
git log --oneline --left-right origin/dev...origin/main
git diff --stat origin/dev origin/main
```

If main contains release fixes missing from dev, incorporate `origin/main` into
`dev` before the next PR (fast-forward where possible; otherwise resolve a normal
merge). Do not reset away either branch's work or push directly to main.
After committing and validating changes:

```bash
git push origin dev
```

Open a PR with base `main` and head `dev`, using the web UI or authenticated
`gh pr create --base main --head dev`. Required checks/review govern merging;
do not bypass protection. Vault edits are outside this repository and are not
included in its commits or PRs.

### Reconciliation record, 2026-09-08

After fetching, `origin/dev` was `2429da1` and `origin/main` was `ab5c8ce`.
Main was three commits ahead with no dev-only commits. Local `dev` was
fast-forwarded to `ab5c8ce`; the only inherited file change was
`frontend/docker/resolve-nginx-dns.sh`, which qualifies the API service with the
Kubernetes namespace when it detects an in-cluster service-account namespace.
Docker Compose continues to use the short `api` service name.

The documentation reconciliation was committed as `c21ebcd` and pushed to
`origin/dev`. Immediately after the push, `origin/dev` was one commit ahead of
`origin/main` and no commits behind. This record is a branch-alignment result,
not a guarantee about future remote positions, deployed configuration or CI
status. SSH fetch succeeded. GitHub CLI could not inspect PRs/protection because
it was not signed in; no protection rules were changed by this work.

## Validation: validate.yaml

Triggers: pushes to `dev`, PRs targeting `main`, and manual dispatch.
Every run executes the same three independent jobs. This avoids path-filter and
aggregate-status logic, so a pull request has a small, predictable required
check set.

| Job | Actual scope |
| --- | --- |
| Frontend | Node 24, install, oxlint, typecheck, build, local-font privacy assertion, Vitest with `NODE_ENV=test`, and mock-mode Playwright browser tests |
| Backend | Node 24, PostgreSQL 18, install, lint, typecheck, generate Prisma, migrations, and `npm run test` |
| Secret scan | TruffleHog verified-secret scan |

Validation concurrency cancels an older run for the same ref.
The required workflow deliberately does not build Docker images, scan images,
start Compose, or run backend-mode browser tests. Those responsibilities belong
to the separate `full-stack.yaml` release/nightly/manual tier. Do not describe
the fast workflow as complete release certification.

`full-stack.yaml` validates `docker compose config`, builds and starts a
disposable PostgreSQL 18/migration/API/worker/nginx topology, checks readiness,
runs the explicit system-category seed required by browser fixtures, then runs
the worker-isolated backend regression suite, backend-mode Playwright journeys,
and the shared finance contract against the Compose API (serialized because
registration flows share the rate-limit bucket), captures logs on failure, and
tears down volumes. CI uses the stub
provider settings from `.env.example`; it never calls real external providers.
The disposable HTTP localhost edge explicitly sets `COMPOSE_NODE_ENV=test`;
normal Compose and deployment defaults remain production and still require an
HTTPS `APP_ORIGIN`.

## Publication: publish.yaml

Triggers: pushes to `main`, or manual dispatch with `both`, `backend`, or `frontend`.
Normal pushes publish packages selected by their changed paths. Manual dispatch
uses the selected target. Publication does not rerun validation; choose the
intended reviewed main ref for a manual release.

Images are built from each package directory, published to GHCR as
`ghcr.io/<lowercase-owner>/monikey-api`, `monikey-migration`, and
`monikey-web`, and tagged with the commit SHA and `latest`. The migration image
uses the dedicated Dockerfile `migration` target and retains npm/npx/Prisma for
schema deployment; the API/worker runtime remains hardened and omits them. The
Compose services and backend publication explicitly select the `runtime`
Dockerfile target; the migration target is never the default application image.
The
web build sets `VITE_FINANCE_BACKEND=true`. Each publication pulls the
SHA-tagged images back to verify they are retrievable and writes their OCI
digests to the workflow summary. GitOps should deploy the digest form
(`image@sha256:...`) rather than relying on `latest`.
Publication also scans the exact SHA images with Trivy for unfixed
HIGH/CRITICAL vulnerabilities and generates SPDX SBOMs with Syft before
reporting success. The migration-image scan has narrowly scoped exceptions
for Prisma 6.19.3's `deepmerge-ts` advisory (`CVE-2026-40345`) and four
vulnerabilities currently bundled inside Node 24's npm CLI
(`CVE-2026-14257`, `CVE-2026-69152`, `CVE-2026-69192`, and
`CVE-2026-73566`). The Prisma fix requires a major upgrade; the npm findings
are confined to the migration toolchain required by the current `npx` contract.
All exceptions are recorded in `.trivyignore-migration` and must be
re-evaluated on Prisma/Node upgrades. The dependencies are absent from the
API/worker runtime image.
Publication runs are queued rather than cancelled mid-push.

These workflows publish images; they contain no step that updates a GitOps
repository or an Argo CD desired image reference. Deployment automation outside
this repo must be verified separately. A SHA tag is not an immutable digest;
pin the actual digest when immutable image identity is required.

## CodeQL and dependency updates

Infrastructure images use explicit version tags rather than `latest`; review and
upgrade those versions deliberately. Release images are additionally identified
by their published OCI digest in the workflow summary.

Security-sensitive GitHub Actions are pinned to immutable commit SHAs with the
human-readable release retained in a comment. Updating an action requires
resolving and reviewing a new commit, not changing a mutable major tag.

`codeql.yaml` runs on pushes to main/dev, PRs targeting main, and daily at 02:00 UTC.
Dependabot configuration is in `.github/dependabot.yml`. Workflow configuration
is source evidence; check the Actions UI for actual run results.

## Local release verification

See [README](../README.md#verification-commands) for package checks and browser tests.
Use a disposable migrated database. Local Compose and CI use PostgreSQL 18,
matching the supported deployment major. This keeps fresh migration, locking,
import/reconciliation, and worker claim tests aligned with the runtime database.

```bash
npm run test:backend:compose
npm run test:e2e:backend
npm run test:e2e:mock
```

Run these from the repository root with dependencies/browser prerequisites
installed and the backend-mode test stack running. `test:e2e` is the mock-only
root default; `test:e2e:backend` explicitly targets localhost:8080. The helper isolates the worker
while tests mutate the database, then restores it. A docs-only validation run may
still run the three checks; it should not be reported as a fresh application test
pass.
