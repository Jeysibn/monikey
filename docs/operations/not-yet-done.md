# What is not done yet

Updated: 2026-09-13

This is the current-state gap list for MoniKey. It is based on the source tree
and current operational evidence, not on historical phase plans. Repository
documentation is authoritative when this list and an older note disagree.

## Incomplete: finish before calling the platform production-ready

- **Complete the money read-model audit.** API minor-unit inputs now require
  decimal strings, but some frontend gateway/read-model paths still map money
  into JavaScript `number` values. Audit every balance, report, budget, goal,
  recurring, investment and crypto path and document the safe presentation
  boundary. See `frontend/src/services/ApiFinanceGateway.ts` and the money
  contract documentation.
- **Run the full database-backed regression suite after the strict transport
  changes.** The no-database suite is useful, but database-dependent tests must
  be rerun against the current schema and migrations before release.
- **Finish generated API-client adoption.** OpenAPI contracts cover the main
  financial slices, but remaining routes/read models still need accurate
  schemas and gateway adoption. Keep drift detection enabled as coverage grows.
- **Complete critical browser coverage.** The current backend-mode smoke flows
  cover important paths, but the full target journey list still needs durable
  coverage for transfers, card payments, goals, budgets, recurring items,
  receipt review, reports and session controls.
- **Complete the accessibility audit.** Keyboard/focus behavior, validation
  announcements, chart alternatives, contrast and responsive workflows need a
  repeatable automated and manual audit record.

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
