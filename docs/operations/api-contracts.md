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
