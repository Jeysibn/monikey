# What is not done yet

Updated: 2026-09-13

This is the current-state gap list for Monikey. It is based on the source tree
and current operational evidence, not on historical phase plans. Repository
documentation is authoritative when this list and an older note disagree.

## Local-first status

- **Completed:** IndexedDB snapshot fallback, receipt Blob persistence, server
  reachability probing, an idempotent pending transaction outbox record, and a
  browser Tesseract worker seam.
- **Completed:** rejected operations are surfaced in Sync Center and require an
  explicit retry-with-same-idempotency-key or confirmed discard choice.
  Transaction, crypto-activity and receipt-capture intentions replay through
  their normal gateway paths.

## Resolved engineering history

The following items were verified as complete before this gap list was refreshed:

- Same-time crypto activity ordering uses a persisted PostgreSQL activity
  sequence, with migration backfill and accounting tests.
- API defaults and per-user worker calendars use authenticated/user-configured
  IANA timezones.
- The current API money read-model audit uses checked minor-unit boundaries.
- Database-backed regression, generated-client adoption, critical browser
  journeys, and the repeatable structural accessibility audit are covered by
  the dated release notes and test suites.

Details and evidence are retained in the [hardening report](hardening-report-2026-09-13.md).

## Incomplete: deployment or further hardening required before a production claim

- **Full verification evidence.** Local PostgreSQL 18 migrations, backend
  integration tests, backend-mode Compose journeys, and backup-script checks
  are now green. The fast and full-stack CI workflows still need to run in
  GitHub Actions for hosted-runner evidence.
- **Explicit adapter casts.** The audited transaction, Fastify, import,
  persistence, logger, and API transport boundaries no longer use type-syntax
  `any`. A few deliberate `unknown as` casts remain for JSON/provider adapter
  seams and should be narrowed further if those contracts become stable.
- **Mock/API contract scope.** A shared contract now covers account creation,
  transaction validation, expense posting, and transfer classification in both
  mock and Compose API modes. Mock/backend differences remain intentional;
  backend-only behavior is covered by the API and Compose suites below.

## Partial or beta capabilities

- **Crypto is active but crypto-specific.** Crypto cost basis, realized and
  unrealized P&L, holdings and portfolio reconciliation are shipped. Broader
  investment accounting for securities is not complete; retained investment
  models are future-facing and must not be read as shipped stock/ETF support.
- **OCR and AI are optional integrations.** They require provider
  configuration, user consent and human review. Deterministic application code
  remains the source of truth for amounts and financial decisions.
- **Bank connectivity is not live.** CSV presets for BPI, BDO, UnionBank, GCash
  and Maya are parser/template support; they are not authenticated live bank or
  e-wallet integrations. Plaid support remains provider/environment dependent.
- **Reports currently prioritize reliable tables, drill-down and CSV.** PDF
  export and any report that cannot be calculated reliably from stored data are
  not shipped.
- **The PWA has a bounded local-first write model.** Offline transaction and
  crypto-activity creation, receipt capture, replay, and explicit retry/discard
  conflict handling are implemented. Offline edit/delete merge workflows are
  intentionally not supported in V1.
- **Observability code exists, but production alert wiring is not fully
  demonstrated.** Deployment-specific dashboards, alert routes and provider
  health checks still need verification in the target environment.

## Operations and deployment-owned work

- Configure scheduled database and receipt/object backups, off-host copies,
  retention and stale-backup alerts in the deployment/GitOps environment.
- Run and record a restore drill in the actual deployment environment. The
  repository currently records an isolated local/disposable drill only.
- Consume the immutable OCI digests produced by release workflows in the
  external GitOps deployment. Audit at `homelab-gitops` revision `0c6399b`
  found MoniKey `api`, `worker`, `web`, and migration manifests still use
  mutable `:latest`; its migration Job also invokes `npx`, which is absent from
  the current MoniKey runtime image. The application now publishes a dedicated
  migration image containing that tooling; GitOps must consume it by digest.
  The same audit found an HTTP-only ingress,
  `NODE_ENV=development`, an HTTP `APP_ORIGIN`, `SESSION_SECURE=false`, and no
  inspected backup schedule. Resolve the migration-image, digest-pinning,
  secure-edge, production-config, and backup-wiring contracts before
  deployment certification. Add image signing/verification (for example,
  Cosign) if that is part of the release trust model.
- Verify ingress-owned security headers, TLS/HSTS behavior and production
  exposure of `/docs` and `/openapi.json` in the real deployment.

## Planned or deferred product work

- OFX, QFX and CAMT.053 importers beyond the current CSV workflow.
- PDF report export and further report/recurring/tag/mobile UX polish.
- Runtime currency/locale switching beyond the currently supported
  configuration and presentation behavior.
- Passkeys/WebAuthn and broader MFA design/implementation.
- User-reviewed recurring detection improvements and budget forecasting
  refinement as more historical data becomes available.
- Suggested transaction rules or other ML-assisted automation.
- Generic AI chat as a product surface; AI explanations remain opt-in and
  subordinate to deterministic calculations.

## Intentionally unsupported or constrained

- Production startup does not seed demo users or demo financial data.
- AI cannot calculate balances, budgets, reconciliation, safe-to-spend totals,
  posting decisions or forecast arithmetic.
- Offline create writes are enabled only for the bounded transaction, crypto
  activity and receipt-capture outbox model. Offline edit/delete writes remain
  disabled until a domain-specific merge model exists.
- Live Philippine banking integrations are not claimed without provider
  credentials, contracts and security review.

## Exit criteria

An item should leave this list only when its implementation, relevant tests,
operational evidence and documentation are present. Feature status should be
classified consistently as Stable, Beta, Partial, Experimental, Disabled or
Planned; “implemented in code” alone is not sufficient.

## Related

- [Configuration](configuration.md)
- [API contracts](api-contracts.md)
- [Observability](observability.md)
- [Deployment contract](deployment-contract.md)
- [Restore drill](restore-drill-2026-09-13.md)
- [Disaster recovery](../Disaster-Recovery.md)
