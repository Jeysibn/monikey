# Contract tests

The shared user-visible finance contract lives in
`frontend/e2e/finance-contract.spec.ts`. The same scenarios run against the
mock preview and the authenticated Compose API. This backend directory holds
API-specific contract tests that require real PostgreSQL, such as
`backend/test/integration/accounts-contract.db.test.ts`, alongside the
broader OpenAPI and integration suite.

Backend-only behavior is intentionally kept out of the shared contract:
sessions, workers, imports, reconciliation, provider adapters, and durable
offline replay have dedicated API or Compose tests because the mock does not
claim to implement those capabilities.
