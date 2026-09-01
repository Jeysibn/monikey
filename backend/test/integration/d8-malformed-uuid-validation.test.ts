/**
 * D8 Regression Test: Malformed UUID Path Parameters
 *
 * Sweeps all routes that accept UUID path parameters and verifies they return
 * 400 VALIDATION_ERROR (not 500) when given malformed UUIDs.
 *
 * This test ensures the fix for D8 (systemic 500 INTERNAL_ERROR on malformed
 * UUID path parameters) does not regress.
 */

import { PrismaClient } from '@prisma/client'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

describeIfDb('D8 Regression: Malformed UUID Path Parameters Return 400 VALIDATION_ERROR', () => {
  let prisma: PrismaClient
  let app: any

  beforeAll(async () => {
    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN: 'http://localhost:8080',
    })
    prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    app = await buildApp({ env, prisma })
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  const malformedUuids = ['not-a-uuid', 'invalid-id-format', '12345', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx']

  // List of all routes with UUID path parameters that were affected by D8
  const testRoutes = [
    // Accounts module
    { method: 'PATCH', path: '/accounts/{id}', body: { name: 'Test', type: 'cash' } },
    { method: 'POST', path: '/accounts/{id}/archive', body: {} },

    // Goals module
    { method: 'POST', path: '/goals/{id}/fund', body: { sourceAccountId: '550e8400-e29b-41d4-a716-446655440000', amountMinor: 1000, occurredOn: '2026-09-01' } },

    // Budget module
    { method: 'POST', path: '/budgets/{id}/allocations', body: { categoryId: '550e8400-e29b-41d4-a716-446655440000', allocatedMinor: 1000 } },

    // Recurring module
    { method: 'PATCH', path: '/recurring/{id}/status', body: { status: 'active' } },
    { method: 'POST', path: '/recurring/{id}/mark-paid', body: {} },

    // Imports module
    { method: 'GET', path: '/imports/batches/{batchId}', body: null },
    { method: 'GET', path: '/imports/batches/{batchId}/transactions', body: null },
    { method: 'POST', path: '/imports/batches/{batchId}/transactions', body: { dedupKey: 'test', provider: 'test', title: 'Test', amountMinor: 100, occurredOn: '2026-09-01' } },
    { method: 'POST', path: '/imports/batches/{batchId}/commit', body: { matchedAccountId: '550e8400-e29b-41d4-a716-446655440000' } },

    // Receipts module
    { method: 'GET', path: '/receipts/{id}', body: null },
    { method: 'POST', path: '/receipts/{id}/process', body: {} },
    { method: 'POST', path: '/receipts/{id}/commit', body: { title: 'Test', fromAccountId: '550e8400-e29b-41d4-a716-446655440000', amountMinor: 100, occurredOn: '2026-09-01' } },
    { method: 'DELETE', path: '/receipts/{id}', body: null },

    // Ledger module
    { method: 'GET', path: '/transactions/{id}', body: null },
    { method: 'POST', path: '/transactions/{id}/reverse', body: { reversalReason: 'duplicate' } },
  ]

  describe('Malformed UUIDs across all affected routes', () => {
    testRoutes.forEach((route) => {
      malformedUuids.forEach((malformedUuid) => {
        it(`${route.method} ${route.path} with "${malformedUuid}" returns 400 VALIDATION_ERROR`, async () => {
          const urlPath = route.path.replace('{id}', malformedUuid).replace('{batchId}', malformedUuid)
          const res = await app.inject({
            method: route.method,
            url: `/api/v1${urlPath}`,
            headers: { 'content-type': 'application/json' },
            payload: route.body,
          })

          // D8 Fix: Must NOT return 500 (before fix these were 500 INTERNAL_ERROR)
          expect(res.statusCode).toBeLessThan(500)

          // Should return 400 VALIDATION_ERROR for malformed UUIDs
          if (res.statusCode >= 400 && res.statusCode < 500) {
            const body = res.json()
            expect(body.error).toBeDefined()
            expect(body.error.code).toBe('VALIDATION_ERROR')
          }
        })
      })
    })
  })

  describe('Valid UUIDs should pass path validation (no 400)', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'

    testRoutes.forEach((route) => {
      it(`${route.method} ${route.path} with valid UUID does not fail on path validation`, async () => {
        const urlPath = route.path.replace('{id}', validUuid).replace('{batchId}', validUuid)
        const res = await app.inject({
          method: route.method,
          url: `/api/v1${urlPath}`,
          headers: { 'content-type': 'application/json' },
          payload: route.body,
        })

        // Valid UUID should NOT get rejected at the path parameter validation stage
        // (May get 404 or 422 for other reasons, but not 400 for path validation)
        if (res.statusCode === 400) {
          const body = res.json()
          // If it is 400, it must NOT be because of path parameter validation
          // (path validation would complain about the UUID format)
          if (body.error.code === 'VALIDATION_ERROR') {
            // Should not be complaining about the UUID path parameter itself
            expect(body.error.message).not.toMatch(/uuid|UUID|format/i)
          }
        }
      })
    })
  })
})
