# What is not done yet

Updated: 2026-09-13

This is the current-state gap list for Monikey. It is based on the source tree
and current operational evidence, not on historical phase plans. Repository
documentation is authoritative when this list and an older note disagree.

## Local-first status

- **Completed:** IndexedDB snapshot fallback, receipt Blob persistence, server
  reachability probing, an idempotent pending transaction outbox record, and a
  browser Tesseract worker seam.
- **Not yet done:** authenticated outbox replay through authoritative gateway
  mutations, conflict resolution/Sync Center, and preinstalled offline
  language-data verification for English and Simplified Chinese OCR.

## Incomplete: finish before calling the platform production-ready

- **Same-time crypto activity ordering.** **Completed 2026-09-13:** trades and
  transfers now use a shared persisted PostgreSQL activity sequence rather than
  UUID lexical order or a cross-table timestamp tie-breaker. Existing rows are
  backfilled by migration and the accounting unit/integration suites cover the
  invariant.

- **API calendar defaults.** **Completed 2026-09-13:** bootstrap and API finance
  defaults now use the authenticated user's local calendar date.
- **Per-user worker calendars.** **Completed 2026-09-13:** recurring payments,
  notifications and daily snapshots now evaluate each user's configured IANA
  timezone independently. External quote/FX refreshes remain process-level
  provider jobs.

- **Complete the money read-model audit.** **Completed for the current API
  surface 2026-09-13:** command serialization uses a checked helper across
  transactions, accounts, cards, goals, budgets and recurring items; all API
  minor-unit reads use the checked safe-integer boundary, while crypto/report
  visual calculations use explicit bounded decimal parsing. Remaining
  `Number(...)` calls are date parsing or test helpers, not API money
  conversions. See `frontend/src/services/ApiFinanceGateway.ts` and the money
  contract documentation.
- **Run the full database-backed regression suite after the strict transport
  changes.** Completed on 2026-09-13 against the migrated Compose PostgreSQL
  database; the current backend suite and browser-backed integration coverage
  are green.
- **Finish generated API-client adoption.** OpenAPI contracts now cover the
  Plaid link-token, exchange-token, item-list and webhook import routes as well
  as the previously completed financial slices. Remaining work is limited to
  auditing any future route additions and deeper frontend read-model adoption.
- **Complete critical browser coverage.** **Completed for the current
  frontend journeys 2026-09-13:** the mock suite (95 tests) and
  backend-mode Compose suite (3 journeys covering auth/session revocation,
  transaction persistence, CSV import/reconciliation and partial-import retry)
  are green. Crypto untrack/re-track history is now covered by a real
  PostgreSQL/HTTP regression. Durable browser coverage for receipt review,
  reports and recurring flows now have browser coverage, including receipt OCR
  draft review, recurring add/pause/resume/payment, and custom report export.
  Further provider-backed receipt persistence coverage is deployment/provider
  dependent rather than an unverified frontend journey.
- **Complete the accessibility audit.** A repeatable structural browser audit
  now covers all 14 routes for main landmarks, labelled form controls, unique
  IDs, image alternatives and labelled icon-only buttons. Manual screen-reader,
  contrast and assistive-technology review remains deployment/user-environment
  work.

## Partial or beta capabilities

- **Crypto is active but crypto-specific.** Broader investment accounting,
  securities, cost basis, realized gains and portfolio reconciliation are not
  complete. Retained investment models are future-facing and must not be read
  as shipped investment support.
- **OCR and AI are optional integrations.** They require provider
  configuration, user consent and human review. Deterministic application code
  remains the source of truth for amounts and financial decisions.
- **Bank connectivity is not live.** CSV presets for BPI, BDO, UnionBank, GCash
  and Maya are parser/template support; they are not authenticated live bank or
  e-wallet integrations. Plaid support remains provider/environment dependent.
- **Reports currently prioritize reliable tables, drill-down and CSV.** PDF
  export and any report that cannot be calculated reliably from stored data are
  not shipped.
- **The PWA is an installable/read-only shell.** Offline ledger writes,
  synchronization and conflict resolution are not implemented.
- **Observability code exists, but production alert wiring is not fully
  demonstrated.** Deployment-specific dashboards, alert routes and provider
  health checks still need verification in the target environment.

## Operations and deployment-owned work

- Configure scheduled database and receipt/object backups, off-host copies,
  retention and stale-backup alerts in the deployment/GitOps environment.
- Run and record a restore drill in the actual deployment environment. The
  repository currently records an isolated local/disposable drill only.
- Consume the immutable OCI digests produced by release workflows in the
  external GitOps deployment, and add image signing/verification (for example,
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
- Offline writes are not enabled until a safe synchronization/conflict model
  exists.
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
