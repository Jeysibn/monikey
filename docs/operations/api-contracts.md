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
