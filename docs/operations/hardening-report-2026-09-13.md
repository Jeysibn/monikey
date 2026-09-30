# MoniKey Engineering Hardening Report

Date: 2026-09-13
Working branch: `dev`
Comparison branch: `origin/main`
Scope: repository hardening against `~/Projects/prompt.md`

## Repository state

- Working branch: `dev`
- Comparison branch: `origin/main`
- Final commit: none; this working tree contains the implementation and
  documentation changes for review. Pre-existing user changes, including the
  worker/migration incident record, were preserved.

## Executive summary

This pass verified the existing implementation before changing it and fixed
confirmed repository gaps: external Google Fonts, PostgreSQL-version drift
between Compose and CI, the missing second-tier full-stack workflow, and the
absence of a shared mock/API finance contract. It also removed avoidable
Prisma transaction-client `any` casts in account, goal, and ledger services and
reconciled stale date/version claims in documentation.

The result is not a production certification. The external GitOps repository,
real-cluster ingress, off-host backup scheduling, signing/verification, and
real deployment restore remain outside this workspace and are explicitly listed
as limitations.

## Initial audit and final status

| Finding | Initial status | Final status | Evidence |
| --- | --- | --- | --- |
| Google Fonts loaded during normal page load | Confirmed | Fixed | `frontend/index.html`, local `@fontsource` imports, built-asset scan |
| CSP allowed external font origins | Confirmed | Fixed | `frontend/docker/nginx.conf`, all three CSP declarations now use `font-src 'self'` |
| Fast PR workflow lacked production-like topology validation | Confirmed | Fixed in repository | `.github/workflows/full-stack.yaml` |
| CI PostgreSQL major differed from Compose | Confirmed | Fixed | `validate.yaml` and Compose both use PostgreSQL 18 |
| Crypto ordering/calendar/money/browser findings | Already fixed before this pass | Retained | Existing migrations, tests, release notes, and reconciled docs |
| Critical modules were large hotspots | Confirmed as review candidates | Audited; no broad behavior-changing refactor | File-size inventory and targeted `any` audit; deep domain modules retained |
| Avoidable transaction-client casts | Partially fixed | Fixed for audited source boundaries | Ledger/account/goal transaction clients, import routes/repositories, Prisma mappers, receipt updates, and API/logger transport boundaries are typed; backend typecheck passes |
| Module-factory and persistence boundaries | Untyped (`app: any` / mapper `any`) | Improved | Accounts, bootstrap, goals, ledger, receipts, and imports module factories/routes/repositories now use Fastify/Prisma types where touched |
| Mock/API parity | Partial by design | Shared contract added and verified | `frontend/e2e/finance-contract.spec.ts` runs the same account, validation, and transfer scenarios against mock and Compose API; backend-only behavior remains separately tested |
| GitOps deployment consumption | Reachable but non-compliant | Deferred/deployment-owned | `homelab-gitops` revision `0c6399b` uses `:latest`, invokes absent runtime `npx`, exposes HTTP-only ingress, sets development/session-insecure config, and has no inspected backup schedule |
| Off-host backups / real-cluster restore / ingress verification | Not verifiable locally | Deferred/deployment-owned | Existing restore and deployment docs classify local vs real deployment evidence |

## Prompt phase coverage

| Phase | Current disposition | Direct evidence |
| --- | --- | --- |
| 1. Privacy-first frontend | Complete locally | Local `@fontsource` assets, same-origin CSP, production-asset privacy assertion, built-container header check |
| 2. Release-level full-stack CI | Implemented; hosted execution pending | `.github/workflows/full-stack.yaml`, disposable Compose stack, serialized backend-mode E2E, failure-log artifact step |
| 3. PostgreSQL alignment | Complete locally | PostgreSQL 18 in Compose and CI, fresh migration, Prisma generate, 54-file/382-test backend suite |
| 4. Architecture hotspot review | Audited; targeted boundary cleanup complete | `docs/ARCHITECTURE.md`, route/service/repository review, no new pass-through layer, regression suites |
| 5. TypeScript boundaries | Complete for audited critical paths | Backend/frontend typechecks and syntax-only `any` audit; intentional adapter casts remain documented |
| 6. Mock/API contract parity | Complete for selected common contract | `frontend/e2e/finance-contract.spec.ts`, 3/3 mock and 3/3 Compose API scenarios |
| 7. Documentation reconciliation | Complete for repository and knowledge base | Updated README, architecture, CI/CD, operations, release notes, gap list, and MoniKey engineering note |
| 8. Supply chain / GitOps | Release contract documented; external consumption unresolved | Publish workflow digest summaries, GitOps handoff, read-only external audit at `0c6399b` |
| 9. Operations / backup / recovery | Local drill complete; deployment evidence pending | Backup verifier and isolated restore drill pass; scheduling, off-host copies, alerting, and cluster restore remain deployment-owned |
| 10. Production edge verification | Not executable in this workspace | Real ingress/TLS/HSTS/docs exposure requires the K3s environment; exact commands are in the GitOps handoff |

## Privacy

Manrope and Space Grotesk are now installed as package assets and imported by
the application entrypoint. Vite emits the font files into `dist/assets`; no
Google preconnect or stylesheet remains. `npm run verify:privacy --prefix
frontend` recursively scans production HTML/CSS/JS/manifest assets and fails if
either Google font origin is present. Nginx CSP allows styles and fonts only from
the same origin.

## Financial integrity

No financial domain rule was intentionally changed in this pass. The existing
minor-unit/bigint, ledger atomicity, idempotency, ownership, crypto ordering,
offline replay, and provider-degradation behavior remain authoritative. The
transaction-client type cleanup is compile-time only and preserves the existing
transaction boundaries.

## Architecture and type safety

The hotspot audit found genuinely deep modules rather than a safe mechanical
file split. No shallow pass-through service layer was introduced. The targeted
cleanup replaced `tx as any` with Prisma's inferred interactive transaction
client in ledger, account, and goal services, typed the module-factory Fastify
boundaries and import routes, typed Prisma mappers/receipt updates, changed
the Plaid request body to `Record<string, unknown>`, used the generated
OpenAPI PATCH payload type for frontend transaction updates, and aligned the
AI logger boundary with Fastify's logger type. No type-syntax `any` remains in
the audited backend/frontend source; a few deliberate `unknown as` adapter
casts remain and are documented as seams rather than hidden as complete.

## Database and CI/CD

PostgreSQL 18 is now the intentional supported major in Compose, fast CI
integration services, and the full-stack workflow. The new `full-stack.yaml`
runs on `main` pushes, manual dispatch, and nightly schedule. It validates
Compose configuration, builds the API/worker/web images, starts a disposable
PostgreSQL 18 + migration + API + worker + nginx topology, waits for readiness,
runs the backend regression helper, backend-mode Playwright journeys, and the
shared finance contract against the Compose API, captures logs on failure, and
always tears down volumes. Provider settings come from the stub `.env.example`;
no real provider calls are part of normal CI. The workflow sets
`COMPOSE_NODE_ENV=test` because its disposable nginx edge is HTTP localhost;
the normal Compose default remains production and still requires HTTPS origins.
The seed is explicit and CI-only: production startup continues to avoid demo or
reference-data seeding.

The publish workflow now emits API, dedicated migration, and web images. The
migration target retains npm/npx/Prisma for schema deployment while the API and
worker runtime remains hardened; Compose and publication explicitly target
`runtime` for API/worker images so the migration target cannot become the
default. The workflow still emits SHA and `latest`
convenience tags, but its recorded OCI digests are the deployment identities.
Mutable tags are not described as immutable. SBOM/provenance requests and
Trivy/Syft scans cover the published images. Read-only inspection of
`homelab-gitops` revision `0c6399b`
found that the current manifests still consume `:latest`; its migration Job
also invokes `npx` against the runtime image, which removes `npx`. The same
manifest set uses an HTTP-only ingress, development-mode application settings,
and `SESSION_SECURE=false`, with no MoniKey backup schedule in the inspected
directory. The external GitOps migration-image, digest-pinning, secure-edge,
production-config, and backup-wiring fixes are therefore explicit blockers.
Signing and verification are deferred until the GitOps side can enforce them.

## Verification executed

| Command | Result |
| --- | --- |
| `npm run build --prefix frontend` | PASS |
| `npm run verify:privacy --prefix frontend` | PASS |
| external font-origin `rg` assertion over source/dist | PASS: none found |
| `npm run db:generate --prefix backend` | PASS, Prisma 6.19.3 with deprecation warning |
| `npm run build --prefix backend` | PASS |
| `npm run typecheck --prefix backend` | PASS |
| `npm run api:openapi:check --prefix backend` | PASS |
| `npm run api:generate --prefix frontend` followed by generated-file diff | PASS: `frontend/src/api.generated.ts` remains synchronized |
| `npm audit --omit=dev --audit-level=high --prefix frontend` | PASS: 0 vulnerabilities |
| `npm audit --omit=dev --audit-level=critical --prefix backend` | PASS at configured critical threshold; audit reports 3 high issues in Prisma CLI/config dev tooling, absent from the runtime image |
| migration-image Trivy scan | PASS after Alpine refresh with five documented, toolchain-only exceptions (Prisma 6.19.3 plus four Node/npm findings); other HIGH/CRITICAL findings remain release-blocking |
| local TruffleHog secret scan | NOT EXECUTED: `trufflehog` is unavailable locally; the pinned GitHub workflow remains configured |
| `npm run lint --prefix frontend` | PASS with existing warnings, including generated Tesseract output |
| `npm run lint --prefix backend` | PASS with existing unused-variable warnings |
| `docker compose config --quiet` | PASS |
| `docker compose build web api worker` | PASS: all three local images were present after the build (`docker image inspect`) |
| `docker compose build migrate` and migration/runtime tooling inspection | PASS: migration image has npm/npx/Prisma; runtime image omits them |
| disposable Compose migration using the migration target | PASS: all 26 current PostgreSQL 18 migrations applied successfully |
| `npx vitest run src/utils/money.test.ts --maxWorkers=1 --reporter=verbose` | PASS: 1 file, 9 tests |
| `npx vitest run test/unit/ledgerService.test.ts test/unit/bootstrap-decimal-math.test.ts --maxWorkers=1 --reporter=verbose` | PASS: 2 files, 5 tests |
| `npx vitest run test/integration/receipts.db.test.ts --maxWorkers=1 --reporter=verbose` | PASS: 1 file, 12 tests against fresh PostgreSQL 18 |
| first backend-mode Compose E2E run before explicit system seed | FAIL: system categories were absent; this exposed a CI setup defect |
| `docker compose run --rm --no-deps migrate npm run db:seed:system` | PASS: seeded 8 system categories in the disposable stack |
| seeded backend-mode Compose E2E with default parallelism | FAIL: 3/4 passed; one registration flow hit the real per-IP rate limiter; this is why the workflow serializes the journeys |
| full frontend Vitest suite | PASS: 26 files, 263 tests |
| backend integration suite | PASS: 54 files, 382 tests against disposable PostgreSQL 18 |
| backend-mode Playwright | PASS: 4/4 journeys against disposable Compose stack, serialized to respect rate limiting |
| `CI=true npm run test:e2e:mock --prefix frontend` | PASS: 98 tests, including the shared finance contract and structural accessibility/responsive/keyboard checks |
| `npm run test:e2e:contract --prefix frontend` | PASS: 3/3 against mock preview and 3/3 against disposable Compose API |
| `scripts/backup/verify.test.sh` | PASS: database archive validation and receipt backup/restore regression |
| built `monikey-web` container header check | PASS: CSP returned `font-src 'self'` with no external font origins |
| `git ls-remote git@github.com:Jeysibn/homelab-gitops.git` | PASS: reachable; HEAD `0c6399b` |
| read-only GitOps manifest audit | FAIL for release readiness: mutable `:latest`, incompatible `npx` migration command, HTTP/development/session-insecure settings, and no inspected backup schedule |
| real Argo/K3s verification | NOT EXECUTED: `kubectl` is unavailable in this workspace |
| real ingress/TLS/HSTS verification | NOT EXECUTED: deployment-owned |
| off-host backup and real-cluster restore | NOT EXECUTED: deployment-owned |
| final `git diff --check`, workflow parse, type-syntax audit, and temporary-container cleanup | PASS |

## Documentation changed

Repository documents changed or added:

- `docs/operations/hardening-report-2026-09-13.md`
- `docs/operations/not-yet-done.md`
- `docs/operations/release-notes-2026-09-13.md`
- `docs/CI-CD-Operations.md`
- `docs/ARCHITECTURE.md`
- `README.md`
- `frontend/index.html`, frontend privacy verification script, and package metadata
- `frontend/e2e/finance-contract.spec.ts` and the contract test script
- `backend/test/contract/README.md`
- `docs/operations/gitops-release-handoff-2026-09-13.md`
- `.github/workflows/validate.yaml` and `.github/workflows/full-stack.yaml`
- `.github/workflows/publish.yaml` release summaries now describe digest handoff accurately

Knowledge-base reconciliation was completed in `~/main-brain/03 Projects/Monikey/Engineering Hardening 2026-09-13.md`.

## Known limitations and deferred work

- The external GitOps manifests and Argo behavior were not available locally.
- Real deployment backup freshness/alerts, off-host copies, restore, ingress
  headers, TLS/HSTS, and production docs exposure remain unverified.
- Hosted GitHub Actions execution remains pending; the equivalent local
  disposable Compose stack and all local test tiers reached terminal completion.
- A few deliberate `unknown as` casts remain at JSON/provider adapter seams;
  they are not financial arithmetic boundaries and are candidates for future
  schema-backed narrowing.
- Manual screen-reader, assistive-technology, contrast, and real mobile-device
  verification remain separate from automated browser assertions.
- Backend dependency audit still reports high-severity Prisma CLI/config
  tooling advisories; no safe non-breaking remediation was available, and the
  hardened runtime image was verified to exclude `prisma`, `@prisma/config`,
  and `deepmerge-ts`.

## Final recommendation

NOT READY TO MERGE

The repository changes are directionally correct and the privacy/database/CI
gaps are fixed, but the prompt requires auditable whole-project verification and
deployment/operations evidence that is not present in this execution context.
