// Real-Postgres integration test for /health/ready. Requires a reachable
// database at TEST_DATABASE_URL (or DATABASE_URL). Skips itself instead of
// failing when no database is configured, since this sandbox does not run a
// long-lived Postgres alongside `npm test` by default — DB connectivity is
// otherwise verified via `docker compose up` + curl (see Docker Deployment
// docs and the developer report's "Known limitations").
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

describeIfDb('GET /api/v1/health/ready (real PostgreSQL)', () => {
  it('reports db: ok against a live database connection', async () => {
    const env = loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', LOG_LEVEL: 'silent' })
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    try {
      const app = await buildApp({ env, prisma })
      const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'ok', db: 'ok' })
      await app.close()
    } finally {
      await prisma.$disconnect()
    }
  })
})
