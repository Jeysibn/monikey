// Minimal dependency-free HTTP health probe for the Docker HEALTHCHECK
// instruction / compose healthcheck. Exits 0 on HTTP 200, non-zero
// otherwise.
//
// QA Attempt 1, Finding 5: this used to always probe /health/live, which by
// design never touches the database — so a container with a completely
// broken DATABASE_URL still reported "healthy", and `web`'s
// `depends_on: api: condition: service_healthy` gate let traffic through to
// an API that could never serve a real request. It now defaults to
// /health/ready (DB-connectivity gated) so "healthy" actually means ready.
// Pass a path as argv[2] to probe something else, e.g.
// `node ./scripts/healthcheck.mjs /api/v1/health/live` for a pure liveness
// check (used nowhere by default in this scaffold, kept as an escape hatch).
import http from 'node:http'

const port = process.env.API_PORT ?? '3000'
const path = process.argv[2] ?? '/api/v1/health/ready'

const req = http.get({ host: '127.0.0.1', port, path, timeout: 2000 }, (res) => {
  if (res.statusCode === 200) {
    process.exit(0)
  } else {
    process.exit(1)
  }
})

req.on('error', () => process.exit(1))
req.on('timeout', () => {
  req.destroy()
  process.exit(1)
})
