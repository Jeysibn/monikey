---
status: active
---

# API contract generation

The Fastify application generates the committed OpenAPI document from its real
route registration. After changing routes or schemas, run:

```bash
npm --prefix backend run api:openapi
```

CI runs `npm run api:openapi:check` in the backend package and fails if
`docs/openapi.generated.json` is stale.

Frontend types are generated from that snapshot with
`npm --prefix frontend run api:generate` into
`frontend/src/api.generated.ts`. CI fails if regeneration changes the
committed artifact. The generated types form a contract boundary; feature
gateways may still map them into domain models for UI-specific behavior.

The accounts, budgets, goals, recurring, reconciliation, and import slices publish
explicit request and response schemas; the transaction mutation slice is also
fully described.
`ApiFinanceGateway` and `ApiRecurringGateway`
imports generated types for those responses and maps them into frontend domain
models. A real-PostgreSQL contract test verifies
that minor units remain strings and account enums survive response
serialization. Routes that still generate `content?: never` need accurate
backend schemas before their handwritten gateway DTOs can be safely removed.

Financial minor-unit fields use decimal strings at the JSON boundary (for
example, receipt commit `amountMinor: "125000"`). The API converts these
validated strings directly to PostgreSQL/ledger `bigint` values; clients must
not send floating-point major-unit values for financial mutations.
