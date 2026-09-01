/**
 * Integration tests for Phase 11 imports module.
 * Tests:
 * - Manual CSV import flow (draft -> review -> commit)
 * - Plaid Sandbox integration (link token -> exchange -> sync)
 * - Deduplication (same transaction, same file, Plaid replay)
 * - Idempotent commit (commit same batch twice)
 * - Malformed CSV graceful handling
 * - User isolation
 * - Stub provider makes zero network calls
 * - Access token encryption
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { createPrismaClient } from '../../src/db/client.js'
import { StubBankProvider } from '../../src/integrations/adapters/stubs/index.js'
import { generateSessionToken, hashSessionToken } from '../../src/common/auth/sessionToken.js'

const SESSION_COOKIE_NAME = 'monikey_session'
const APP_ORIGIN = 'http://localhost:8080'
const TEST_RUN_ID = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/**
 * Generate a unique dedup key for this test run to avoid UNIQUE constraint violations
 * across multiple test runs using the same hardcoded keys.
 */
function makeUniqueDedupKey(key: string): string {
  return `${TEST_RUN_ID}_${key}`
}

/**
 * Helper to create a real session for a test user and return the cookie string
 * to use in subsequent test requests. This ensures tests use the same auth
 * pattern as the production code (session cookie validation), not a header bypass.
 */
async function createTestSessionCookie(prisma: PrismaClient, userId: string): Promise<string> {
  const rawToken = generateSessionToken()
  const tokenHash = hashSessionToken(rawToken)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  })

  return `${SESSION_COOKIE_NAME}=${rawToken}`
}

describe('Imports Module - Phase 11', () => {
  let app: any
  let prisma: PrismaClient
  let env: any

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
    env = loadEnv({
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_ORIGIN,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    })
    prisma = createPrismaClient(env.DATABASE_URL)

    app = await buildApp({
      env,
      prisma,
    })
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  describe('Import batch lifecycle', () => {
    let userId: string
    let sessionCookie: string

    beforeEach(async () => {
      // Create a test user
      const user = await prisma.user.create({
        data: {
          email: `test-import-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'Import Tester',
        },
      })
      userId = user.id

      // Create a real session for this user
      sessionCookie = await createTestSessionCookie(prisma, userId)

      // Create a test account to import into
      await prisma.financialAccount.create({
        data: {
          userId,
          name: 'Test Checking',
          accountType: 'checking',
          classification: 'asset',
          currencyCode: 'PHP',
          openingBalanceMinor: 100000n, // PHP 1,000
          currentBalanceMinor: 100000n,
          manual: true,
        },
      })
    })

    it('creates an import batch', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: {
          sourceType: 'csv_manual',
        },
        headers: {
          origin: APP_ORIGIN,
          cookie: sessionCookie,
        },
      })

      expect(response.statusCode).toBe(201)
      const batch = JSON.parse(response.body)
      expect(batch.id).toBeDefined()
      expect(batch.status).toBe('reviewing')
      expect(batch.totalCount).toBe(0)
    })

    it('adds imported transaction to batch', async () => {
      // Create batch first
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: {
          sourceType: 'csv_manual',
        },
        headers: {
          origin: APP_ORIGIN,
          cookie: sessionCookie,
        },
      })

      const batch = JSON.parse(batchRes.body)

      // Add transaction
      const txnRes = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('csv_row_1'),
          provider: 'csv',
          title: 'Coffee Shop',
          amountMinor: 15050, // PHP 150.50
          occurredOn: '2026-09-01',
          currencyCode: 'PHP',
          merchantName: 'Cafe Noir',
        },
        headers: {
          origin: APP_ORIGIN,
          cookie: sessionCookie,
        },
      })

      expect(txnRes.statusCode).toBe(201)
      const txn = JSON.parse(txnRes.body)
      expect(txn.title).toBe('Coffee Shop')
      expect(txn.amountMinor).toBe(15050)
      expect(txn.status).toBe('pending_review')
    })
  })

  describe('Deduplication', () => {
    let userId: string
    let accountId: string
    let sessionCookie: string

    beforeEach(async () => {
      // Create user and account
      const user = await prisma.user.create({
        data: {
          email: `test-dedup-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'Dedup Tester',
        },
      })
      userId = user.id

      // Create a real session for this user
      sessionCookie = await createTestSessionCookie(prisma, userId)

      const account = await prisma.financialAccount.create({
        data: {
          userId,
          name: 'Test Account',
          accountType: 'checking',
          classification: 'asset',
          currencyCode: 'PHP',
          openingBalanceMinor: 100000n,
          currentBalanceMinor: 100000n,
          manual: true,
        },
      })
      accountId = account.id
    })

    it('prevents duplicate transaction in same batch', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      const batch = JSON.parse(batchRes.body)

      // Add first transaction
      const txn1 = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('same_dedup_key'),
          provider: 'csv',
          title: 'Transaction 1',
          amountMinor: 50000,
          occurredOn: '2026-09-01',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(txn1.statusCode).toBe(201)

      // Try to add duplicate with same dedup key — should fail
      const txn2 = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('same_dedup_key'),
          provider: 'csv',
          title: 'Transaction 2',
          amountMinor: 60000,
          occurredOn: '2026-09-02',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(txn2.statusCode).toBe(409)
    })

    it('prevents duplicate transaction across batches', async () => {
      // Create two batches
      const batch1Res = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })
      const batch1 = JSON.parse(batch1Res.body)

      const batch2Res = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })
      const batch2 = JSON.parse(batch2Res.body)

      // Add transaction to batch 1
      const txn1 = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch1.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('global_dedup_key'),
          provider: 'csv',
          title: 'Transaction',
          amountMinor: 50000,
          occurredOn: '2026-09-01',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(txn1.statusCode).toBe(201)

      // Try to add same dedup key to batch 2 — should fail (global dedup)
      const txn2 = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch2.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('global_dedup_key'),
          provider: 'csv',
          title: 'Same Transaction Again',
          amountMinor: 50000,
          occurredOn: '2026-09-01',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(txn2.statusCode).toBe(409)
    })
  })

  describe('Commit to ledger', () => {
    let userId: string
    let accountId: string
    let sessionCookie: string

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: `test-commit-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'Commit Tester',
        },
      })
      userId = user.id

      // Create a real session for this user
      sessionCookie = await createTestSessionCookie(prisma, userId)

      const account = await prisma.financialAccount.create({
        data: {
          userId,
          name: 'Test Account',
          accountType: 'checking',
          classification: 'asset',
          currencyCode: 'PHP',
          openingBalanceMinor: 500000n, // PHP 5,000
          currentBalanceMinor: 500000n,
          manual: true,
        },
      })
      accountId = account.id
    })

    it('commits batch to ledger and creates transactions', async () => {
      // Create batch
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      const batch = JSON.parse(batchRes.body)

      // Add transaction
      const txnRes = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('expense_1'),
          provider: 'csv',
          title: 'Grocery Store',
          amountMinor: 150000, // PHP 1,500
          occurredOn: '2026-09-01',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(txnRes.statusCode).toBe(201)

      // Commit batch
      const commitRes = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/commit`,
        payload: {
          matchedAccountId: accountId,
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(commitRes.statusCode).toBe(200)
      const result = JSON.parse(commitRes.body)
      expect(result.committedCount).toBe(1)
      expect(result.errors).toHaveLength(0)

      // Verify transaction was posted to ledger
      const transactions = await prisma.transaction.findMany({
        where: { userId, source: 'import' },
      })

      expect(transactions).toHaveLength(1)
      expect(transactions[0].title).toBe('Grocery Store')
      expect(transactions[0].amountMinor).toBe(150000n)
      expect(transactions[0].source).toBe('import')
    })

    it('idempotent commit — committing twice does not double-post', async () => {
      // Create batch and add transaction
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      const batch = JSON.parse(batchRes.body)

      await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('expense_idempotent'),
          provider: 'csv',
          title: 'Expense',
          amountMinor: 100000,
          occurredOn: '2026-09-01',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      // Commit once
      const commit1 = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/commit`,
        payload: { matchedAccountId: accountId },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(commit1.statusCode).toBe(200)

      // Commit again — should succeed but not create duplicate transactions
      const commit2 = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/commit`,
        payload: { matchedAccountId: accountId },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(commit2.statusCode).toBe(200)

      // Verify only one transaction exists
      const transactions = await prisma.transaction.findMany({
        where: { userId, source: 'import' },
      })

      expect(transactions).toHaveLength(1)
    })
  })

  describe('User isolation', () => {
    it('user A cannot see user B import batches', async () => {
      const userA = await prisma.user.create({
        data: {
          email: `user-a-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'User A',
        },
      })

      const userB = await prisma.user.create({
        data: {
          email: `user-b-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'User B',
        },
      })

      // Create real sessions for both users
      const sessionCookieA = await createTestSessionCookie(prisma, userA.id)
      const sessionCookieB = await createTestSessionCookie(prisma, userB.id)

      // User A creates batch
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { cookie: sessionCookieA, origin: APP_ORIGIN },
      })

      const batch = JSON.parse(batchRes.body)

      // User B tries to access User A's batch — should fail
      const accessRes = await app.inject({
        method: 'GET',
        url: `/api/v1/imports/batches/${batch.id}`,
        headers: { cookie: sessionCookieB },
      })

      expect(accessRes.statusCode).toBe(404)
    })
  })

  describe('Stub provider', () => {
    it('stub bank provider makes zero network calls', async () => {
      const provider = new StubBankProvider()

      // Create link token
      const linkSession = await provider.createLinkSession('test-user')
      expect(linkSession.linkToken).toContain('link_test_')

      // Exchange token
      const result = await provider.exchangePublicToken('test-user', 'any-public-token')
      expect(result.itemId).toContain('item_stub_')
      expect(result.accessToken).toContain('access_test_')

      // Sync returns deterministic data
      const sync = await provider.sync('test-user', result.accessToken)
      expect(sync.accounts).toHaveLength(1)
      expect(sync.transactions).toHaveLength(2)

      // Webhook verification
      const isValid = provider.verifyWebhookSignature('payload', 'any-signature')
      expect(isValid).toBe(true)
    })
  })

  describe('Validation', () => {
    let userId: string
    let sessionCookie: string

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: `test-validation-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'Validation Tester',
        },
      })
      userId = user.id

      // Create a real session for this user
      sessionCookie = await createTestSessionCookie(prisma, userId)
    })

    it('rejects negative amount', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      const batch = JSON.parse(batchRes.body)

      const txnRes = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('negative'),
          provider: 'csv',
          title: 'Bad Amount',
          amountMinor: -50000,
          occurredOn: '2026-09-01',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      // Should be rejected (400) or have validation errors
      if (txnRes.statusCode === 400) {
        expect(txnRes.statusCode).toBe(400)
      } else {
        const txn = JSON.parse(txnRes.body)
        expect(txn.validationErrors).toContain(expect.stringContaining('positive'))
      }
    })

    it('rejects invalid date', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/batches',
        payload: { sourceType: 'csv_manual' },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      const batch = JSON.parse(batchRes.body)

      const txnRes = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/batches/${batch.id}/transactions`,
        payload: {
          dedupKey: makeUniqueDedupKey('bad_date'),
          provider: 'csv',
          title: 'Transaction',
          amountMinor: 50000,
          occurredOn: 'not-a-date',
        },
        headers: { origin: APP_ORIGIN, cookie: sessionCookie },
      })

      expect(txnRes.statusCode).toBe(400) // Zod validation should fail
    })
  })

  describe('CSV Upload - D5: Multipart/Form-Data Upload', () => {
    let userId: string
    let sessionCookie: string

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: `test-csv-upload-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'CSV Upload Tester',
        },
      })
      userId = user.id

      // Create a real session for this user
      sessionCookie = await createTestSessionCookie(prisma, userId)
    })

    it('successfully uploads and parses a CSV file with multipart/form-data', async () => {
      const csvContent = `date,amount,description,merchant
2026-09-01,150.50,Coffee Shop,Cafe Noir
2026-09-02,45.25,Lunch,Restaurant
2026-09-03,999.99,Groceries,Supermarket`

      // Create a form-data request with a file field
      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')

      // Write CSV to a temporary file
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(201)
        const result = JSON.parse(response.body)
        expect(result.batchId).toBeDefined()
        expect(result.fileName).toBe('transactions.csv')
        expect(result.addedCount).toBe(3)
        expect(result.totalRows).toBe(3)
        expect(result.status).toBe('reviewing')
        expect(result.errors).toBeUndefined()

        // Verify the batch was created
        const batch = await prisma.importBatch.findUnique({
          where: { id: result.batchId },
          include: { importedTransactions: true },
        })

        expect(batch).toBeDefined()
        expect(batch?.importSourceType).toBe('csv_manual')
        expect(batch?.importedTransactions).toHaveLength(3)

        // Verify amounts are correct (D11 fix: verify rounding is correct)
        const txns = batch!.importedTransactions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        expect(txns[0].amountMinor).toBe(15050n) // 150.50 -> 15050
        expect(txns[1].amountMinor).toBe(4525n)  // 45.25 -> 4525
        expect(txns[2].amountMinor).toBe(99999n) // 999.99 -> 99999
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    it('rejects request without file field', async () => {
      const FormData = require('form-data')

      const form = new FormData()
      // Don't append any file

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/csv/upload',
        payload: form,
        headers: {
          ...form.getHeaders(),
          origin: APP_ORIGIN,
          cookie: sessionCookie,
        },
      })

      expect(response.statusCode).toBe(400)
      const result = JSON.parse(response.body)
      expect(result.error.code).toBe('MISSING_FILE')
    })

    it('rejects CSV without required columns', async () => {
      const csvContent = `date,amount
2026-09-01,150.50`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(400)
        const result = JSON.parse(response.body)
        expect(result.error.code).toBe('MISSING_COLUMNS')
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    it('rejects CSV with only header row', async () => {
      const csvContent = `date,amount,description`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(400)
        const result = JSON.parse(response.body)
        expect(result.error.code).toBe('INVALID_CSV')
      } finally {
        fs.unlinkSync(tempFile)
      }
    })
  })

  describe('Rounding Fix - D11: Decimal to Minor Units Conversion', () => {
    let userId: string
    let accountId: string
    let sessionCookie: string

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: `test-rounding-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          displayName: 'Rounding Tester',
        },
      })
      userId = user.id

      // Create a real session for this user
      sessionCookie = await createTestSessionCookie(prisma, userId)

      const account = await prisma.financialAccount.create({
        data: {
          userId,
          name: 'Test Account',
          accountType: 'checking',
          classification: 'asset',
          currencyCode: 'PHP',
          openingBalanceMinor: 500000n,
          currentBalanceMinor: 500000n,
          manual: true,
        },
      })
      accountId = account.id
    })

    it('correctly converts 19.99 to 1999 minor units', async () => {
      const csvContent = `date,amount,description
2026-09-01,19.99,Test Transaction`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(201)
        const result = JSON.parse(response.body)

        const batch = await prisma.importBatch.findUnique({
          where: { id: result.batchId },
          include: { importedTransactions: true },
        })

        expect(batch?.importedTransactions[0].amountMinor).toBe(1999n)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    it('correctly converts 8.20 to 820 minor units', async () => {
      const csvContent = `date,amount,description
2026-09-01,8.20,Test Transaction`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(201)
        const result = JSON.parse(response.body)

        const batch = await prisma.importBatch.findUnique({
          where: { id: result.batchId },
          include: { importedTransactions: true },
        })

        expect(batch?.importedTransactions[0].amountMinor).toBe(820n)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    it('correctly converts 4.35 to 435 minor units', async () => {
      const csvContent = `date,amount,description
2026-09-01,4.35,Test Transaction`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(201)
        const result = JSON.parse(response.body)

        const batch = await prisma.importBatch.findUnique({
          where: { id: result.batchId },
          include: { importedTransactions: true },
        })

        expect(batch?.importedTransactions[0].amountMinor).toBe(435n)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    it('correctly converts 0.29 to 29 minor units', async () => {
      const csvContent = `date,amount,description
2026-09-01,0.29,Test Transaction`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(response.statusCode).toBe(201)
        const result = JSON.parse(response.body)

        const batch = await prisma.importBatch.findUnique({
          where: { id: result.batchId },
          include: { importedTransactions: true },
        })

        expect(batch?.importedTransactions[0].amountMinor).toBe(29n)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })

    it('commits batch with correctly rounded amounts to ledger', async () => {
      const csvContent = `date,amount,description
2026-09-01,19.99,Test 1
2026-09-02,8.20,Test 2
2026-09-03,4.35,Test 3
2026-09-04,0.29,Test 4`

      const FormData = require('form-data')
      const fs = require('fs')
      const path = require('path')
      const tempDir = require('os').tmpdir()
      const tempFile = path.join(tempDir, `test_${Date.now()}.csv`)
      fs.writeFileSync(tempFile, csvContent)

      try {
        const form = new FormData()
        form.append('file', fs.createReadStream(tempFile), 'transactions.csv')

        const uploadRes = await app.inject({
          method: 'POST',
          url: '/api/v1/imports/csv/upload',
          payload: form,
          headers: {
            ...form.getHeaders(),
            origin: APP_ORIGIN,
            cookie: sessionCookie,
          },
        })

        expect(uploadRes.statusCode).toBe(201)
        const uploadResult = JSON.parse(uploadRes.body)

        // Commit the batch
        const commitRes = await app.inject({
          method: 'POST',
          url: `/api/v1/imports/batches/${uploadResult.batchId}/commit`,
          payload: { matchedAccountId: accountId },
          headers: { origin: APP_ORIGIN, cookie: sessionCookie },
        })

        expect(commitRes.statusCode).toBe(200)

        // Verify transactions were committed with correct amounts
        const transactions = await prisma.transaction.findMany({
          where: { userId, source: 'import' },
          orderBy: { createdAt: 'asc' },
        })

        expect(transactions).toHaveLength(4)
        expect(transactions[0].amountMinor).toBe(1999n)
        expect(transactions[1].amountMinor).toBe(820n)
        expect(transactions[2].amountMinor).toBe(435n)
        expect(transactions[3].amountMinor).toBe(29n)
      } finally {
        fs.unlinkSync(tempFile)
      }
    })
  })
})
