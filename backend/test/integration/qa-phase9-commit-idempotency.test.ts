/**
 * QA Phase 9: Commit Idempotency Test
 * Verifies that double-submitting /commit doesn't double-post transaction
 */

import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

function createTestPngBuffer(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x02,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])
}

function extractSessionCookie(res: any): string | undefined {
  const cookie = res.cookies?.find((c: any) => c.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

describeIfDb('QA Phase 9: Commit Idempotency', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdUsers: string[] = []
  let app: FastifyInstance
  const APP_ORIGIN = 'http://localhost:8080'

  beforeEach(async () => {
    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN,
      SESSION_SECURE: 'false',
      OCR_PROVIDER: 'stub',
      OBJECT_STORE: 'filesystem',
      RECEIPT_STORAGE_PATH: '/tmp/qa-receipts-idempotency',
    })
    app = await buildApp({ env, prisma })
  })

  afterAll(async () => {
    await app.close()
    await prisma.user.deleteMany({ where: { email: { in: createdUsers } } })
    await prisma.externalApiUsage.deleteMany({ where: { provider: 'ocrspace' } })
    await prisma.$disconnect()
  })

  async function setupUser() {
    const email = `qa-idempotency-${randomUUID()}@monikey.test`
    createdUsers.push(email)
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'password-1', displayName: 'Test User' },
    })
    const cookie = extractSessionCookie(registerRes)
    return { email, cookie: cookie!, userId: registerRes.json().user.id }
  }

  it('COMMIT_IDEMPOTENCY: Double-submit commit should not double-post transaction', async () => {
    const { cookie, userId } = await setupUser()

    // Clean quota
    const today = new Date().toISOString().slice(0, 10)
    await prisma.externalApiUsage.deleteMany({
      where: {
        provider: 'ocrspace',
        period: today,
        operation: 'extract',
      },
    })

    // Enable OCR
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, externalOcrEnabled: true },
      update: { externalOcrEnabled: true },
    })

    // Create account
    const account = await prisma.financialAccount.create({
      data: {
        userId,
        name: 'Test Account',
        accountType: 'checking',
        classification: 'asset',
        currentBalanceMinor: 100000n,
      },
    })

    const pngBuffer = createTestPngBuffer()

    // Upload receipt
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        filename: 'receipt.png',
        mimeType: 'image/png',
        data: pngBuffer.toString('base64'),
      },
    })

    const receiptId = uploadRes.json().receipt.id

    // Process receipt
    const processRes = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/process`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(processRes.statusCode).toBe(200)

    // First commit
    const commit1Res = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/commit`,
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        title: 'Coffee',
        categoryId: null,
        fromAccountId: account.id,
        amountMinor: 30000,
        currencyCode: 'PHP',
        occurredOn: '2026-09-01',
        note: null,
      },
    })

    expect(commit1Res.statusCode).toBe(201)
    const transaction1Id = commit1Res.json().transaction.id

    // Second commit (should fail - receipt already linked)
    const commit2Res = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/commit`,
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        title: 'Coffee',
        categoryId: null,
        fromAccountId: account.id,
        amountMinor: 30000,
        currencyCode: 'PHP',
        occurredOn: '2026-09-01',
        note: null,
      },
    })

    // Should fail because receipt is already committed
    expect(commit2Res.statusCode).toBe(400)
    expect(commit2Res.json().error.code).toBe('RECEIPT_ALREADY_COMMITTED')

    // Verify only ONE transaction was created
    const transactions = await prisma.transaction.findMany({
      where: { userId },
    })

    expect(transactions.length).toBe(1)
    expect(transactions[0].id).toBe(transaction1Id)
  })
})
