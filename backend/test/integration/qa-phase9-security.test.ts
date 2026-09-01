/**
 * QA Phase 9 Independent Security Verification Tests
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

describeIfDb('QA Phase 9 Security Verification', () => {
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
      RECEIPT_STORAGE_PATH: '/tmp/qa-receipts',
    })
    app = await buildApp({ env, prisma })
  })

  afterAll(async () => {
    await app.close()
    await prisma.user.deleteMany({ where: { email: { in: createdUsers } } })
    // Clean up quota for next test run
    await prisma.externalApiUsage.deleteMany({ where: { provider: 'ocrspace' } })
    await prisma.$disconnect()
  })

  async function setupUser() {
    const email = `qa-verify-${randomUUID()}@monikey.test`
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

  it('MAGIC_BYTES: Rejects text file claiming to be PNG', async () => {
    const { cookie } = await setupUser()

    // Create a text file that claims to be PNG
    const textBuffer = Buffer.from('Hello, this is a text file, not a PNG')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        filename: 'fake.png',
        mimeType: 'image/png',
        data: textBuffer.toString('base64'),
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_RECEIPT_FORMAT')
  })

  it('NO_AUTO_POST: Receipt processing never directly posts transaction', async () => {
    const { cookie, userId } = await setupUser()

    // Clean quota for this test
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
    await prisma.financialAccount.create({
      data: {
        userId,
        name: 'Test',
        accountType: 'checking',
        classification: 'asset',
        currentBalanceMinor: 100000n,
      },
    })

    const pngBuffer = createTestPngBuffer()

    // Upload and process
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

    const processRes = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/process`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(processRes.statusCode).toBe(200)

    // Verify NO transaction was created by processing
    const transactions = await prisma.transaction.findMany({
      where: { userId },
    })

    expect(transactions.length).toBe(0)
    expect(processRes.json().receipt.status).toBe('ready')
  })

  it('DELETE_BLOCKED: Cannot delete receipt after transaction committed', async () => {
    const { cookie, userId } = await setupUser()

    // Create a transaction first
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'expense',
        title: 'Test',
        amountMinor: 30000n,
        currencyCode: 'PHP',
        occurredOn: new Date(),
        source: 'ocr',
        status: 'cleared',
      },
    })

    // Create a receipt linked to that transaction
    const receipt = await prisma.receipt.create({
      data: {
        userId,
        storageKey: randomUUID(),
        originalFilename: 'receipt.png',
        mimeType: 'image/png',
        sizeBytes: 1000n,
        sha256: '0'.repeat(64),
        status: 'committed',
        transactionId: transaction.id,
      },
    })

    // Try to delete
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/receipts/${receipt.id}`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('RECEIPT_LINKED_TO_TRANSACTION')
  })

  it('USER_ISOLATION: Returns 404 not 403 for other user\'s receipt', async () => {
    const user1 = await setupUser()
    const user2 = await setupUser()

    const pngBuffer = createTestPngBuffer()

    // User 1 uploads
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: { origin: APP_ORIGIN, cookie: user1.cookie },
      payload: {
        filename: 'receipt.png',
        mimeType: 'image/png',
        data: pngBuffer.toString('base64'),
      },
    })

    const receiptId = uploadRes.json().receipt.id

    // User 2 tries to access
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}`,
      headers: { origin: APP_ORIGIN, cookie: user2.cookie },
    })

    // Should be 404, not 403
    expect(res.statusCode).toBe(404)
  })

  it('OCR_DISABLED_BY_DEFAULT: Cannot process without external_ocr_enabled', async () => {
    const { cookie, userId } = await setupUser()

    // Ensure OCR is NOT enabled
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, externalOcrEnabled: false },
      update: { externalOcrEnabled: false },
    })

    const pngBuffer = createTestPngBuffer()

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

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/process`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('EXTERNAL_OCR_DISABLED')
  })
})
