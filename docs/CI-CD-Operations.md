# CI/CD Operations

Reviewed against `.github/workflows/` on 2026-09-08. The project workflow is
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
Path filtering selects `frontend/**` and `backend/**`; manual dispatch selects both.
Changes only to root docs, scripts or shared Compose files do not by themselves
select either package. Security checks and the summary job are separate.

| Job | Actual scope |
| --- | --- |
| Frontend validation | Node 24, install, oxlint, typecheck, build, Vitest with `NODE_ENV=test`, build artifact upload |
| Mock browser tests | Installs Chromium and runs the frontend Playwright suite excluding `@backend-compose` scenarios |
| Full-stack browser test | Builds backend-mode Compose, waits for API readiness, then runs the registration/login/persisted-expense Playwright scenario against `http://localhost:8080` |
| Backend tests | Node 24, PostgreSQL 16, install, lint, typecheck, generate Prisma, migrations, `npm run test` |
| Backend integration tests | Independent PostgreSQL 16 service, install, generate, migrate and the same full backend test command |
| Docker scans | Build changed package images without publication; Trivy SARIF and security upload |
| Security checks | TruffleHog plus source/config hygiene checks |
| Summary | Aggregates listed job results, accepting successful or skipped jobs |

Validation concurrency cancels an older run for the same ref.
The workflow runs mock and backend-mode Playwright coverage. The backend browser
lane runs for frontend/backend and shared Compose, Docker, environment, script or
validation-workflow changes; it is intentionally skipped for documentation-only
changes. The workflow does not run OpenAPI baseline comparison or a separate
explicit backend production build command.
Docker scan builds do compile the backend image. The two backend test jobs both
invoke the same suite despite their different names. Do not describe these
workflows as a complete release certification.

## Publication: publish.yaml

Triggers: pushes to `main`, or manual dispatch with `both`, `backend`, or `frontend`.
Normal pushes publish packages selected by their changed paths. Manual dispatch
uses the selected target. Publication does not rerun validation; choose the
intended reviewed main ref for a manual release.

Images are built from each package directory, published to GHCR as
`ghcr.io/<lowercase-owner>/monikey-api` and `monikey-web`, and tagged with the
commit SHA and `latest`. The web build sets `VITE_FINANCE_BACKEND=true`.
Each publication pulls the SHA-tagged image back to verify it is retrievable.
Publication runs are queued rather than cancelled mid-push.

These workflows publish images; they contain no step that updates a GitOps
repository or an Argo CD desired image reference. Deployment automation outside
this repo must be verified separately. A SHA tag is not an immutable digest;
pin the actual digest when immutable image identity is required.

## CodeQL and dependency updates

`codeql.yaml` runs on pushes to main/dev, PRs targeting main, and daily at 02:00 UTC.
Dependabot configuration is in `.github/dependabot.yml`. Workflow configuration
is source evidence; check the Actions UI for actual run results.

## Local release verification

See [README](../README.md#verification-commands) for package checks and browser tests.
Use a disposable migrated database. Local Compose uses PostgreSQL 18, while the
CI services currently use PostgreSQL 16; results apply to the version exercised.

```bash
npm run test:backend:compose
npm run test:e2e:backend
npm run test:e2e:mock
```

Run these from the repository root with dependencies/browser prerequisites
installed and the backend-mode test stack running. `test:e2e` is the mock-only
root default; `test:e2e:backend` explicitly targets localhost:8080. The helper isolates the worker
while tests mutate the database, then restores it. A docs-only validation run may
skip package jobs; it should not be reported as a fresh application test pass.
