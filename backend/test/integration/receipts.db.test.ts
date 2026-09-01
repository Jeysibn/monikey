/**
 * Integration tests for Phase 9 Receipt OCR pipeline.
 * Exercises real HTTP, database, and file storage against a real PostgreSQL instance.
 * Uses stub OCR provider to avoid consuming real OCR.Space quota during CI.
 */

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

const APP_ORIGIN = 'http://localhost:8080'

/**
 * Create a test PNG image buffer (smallest valid PNG: 1x1 pixel).
 * This is actual PNG magic bytes + minimal valid PNG structure.
 */
function createTestPngBuffer(): Buffer {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR chunk size
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02, // bit depth: 8, color type: RGB
    0x00, 0x00, 0x00, // compression, filter, interlace
    0x90, 0x77, 0x53, 0xde, // CRC (simplified; may not match exactly but PNG parser is lenient in tests)
    0x00, 0x00, 0x00, 0x0c, // IDAT chunk size
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x02,
    0x00, 0x01, // Simple IDAT data
    0x00, 0x00, 0x00, 0x00, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk size
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82, // CRC
  ])
  return png
}

/**
 * Create a test JPEG image buffer (smallest valid JPEG).
 * Currently unused but kept for future multipart upload tests.
 */
function _createTestJpegBuffer(): Buffer {
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, // SOI + APP0
    0x00, 0x10, // APP0 length
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // version and density
    0xff, 0xdb, 0x00, 0x43, 0x00, // DQT
    ...Array(64).fill(0x10), // Quantization table
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, // SOF0
    0xff, 0xc4, 0x00, 0x1f, 0x00, // DHT
    ...Array(16).fill(0x00),
    ...Array(12).fill(0x00),
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, // SOS
    0xff, 0xd9, // EOI
  ])
  return jpeg
}

function extractSessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  const cookie = res.cookies.find((c) => c.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

describeIfDb('Phase 9 Receipt OCR Pipeline (real PostgreSQL, real HTTP, stubbed OCR)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdUsers: string[] = []
  const storagePaths: string[] = []
  let app: FastifyInstance
  let storageDir: string

  beforeEach(async () => {
    // Create temporary storage directory for this test
    storageDir = path.join(os.tmpdir(), `monikey-receipts-${randomUUID()}`)
    await fs.mkdir(storageDir, { recursive: true })

    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN,
      SESSION_SECURE: 'false',
      OCR_PROVIDER: 'stub',
      OBJECT_STORE: 'filesystem',
      RECEIPT_STORAGE_PATH: storageDir,
    })

    app = await buildApp({ env, prisma })
  })

  afterEach(async () => {
    await app.close()

    // Clean up temporary storage
    if (storageDir) {
      storagePaths.push(storageDir)
    }
  })

  afterAll(async () => {
    // Clean up users
    await prisma.user.deleteMany({ where: { email: { in: createdUsers } } })

    // Clean up temporary storage directories
    for (const dirPath of storagePaths) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }

    await prisma.$disconnect()
  })

  function uniqueEmail(): string {
    const email = `qa-receipts-${randomUUID()}@monikey.test`
    createdUsers.push(email)
    return email
  }

  async function setupUser() {
    const email = uniqueEmail()
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'password-1', displayName: 'Receipt Test User' },
    })

    expect(registerRes.statusCode).toBe(201)
    const cookie = extractSessionCookie(registerRes)
    expect(cookie).toBeDefined()

    return { email, cookie: cookie!, userId: registerRes.json().user.id }
  }

  it('upload validation: rejects unsupported MIME type', async () => {
    const { cookie } = await setupUser()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        filename: 'fake.txt',
        mimeType: 'text/plain',
        data: Buffer.from('not an image').toString('base64'),
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_RECEIPT_TYPE')
  })

  it('upload validation: rejects file with wrong magic bytes', async () => {
    const { cookie } = await setupUser()

    // Create a buffer that claims to be PNG but has wrong magic bytes
    const fakeBuffer = Buffer.from('not-a-png', 'utf8')

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        filename: 'fake.png',
        mimeType: 'image/png',
        data: fakeBuffer.toString('base64'),
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_RECEIPT_FORMAT')
  })

  it('upload validation: accepts valid PNG with correct magic bytes', async () => {
    const { cookie } = await setupUser()

    const pngBuffer = createTestPngBuffer()

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/receipts',
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        filename: 'receipt.png',
        mimeType: 'image/png',
        data: pngBuffer.toString('base64'),
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().receipt.id).toBeDefined()
    expect(res.json().receipt.status).toBe('uploaded')
  })

  it('upload: stores file with randomized key, computes SHA256', async () => {
    const { cookie } = await setupUser()

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

    expect(uploadRes.statusCode).toBe(201)
    const receiptId = uploadRes.json().receipt.id

    // Get receipt metadata
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(getRes.statusCode).toBe(200)
    const receipt = getRes.json().receipt
    expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/) // SHA256 hex
    expect(receipt.storageKey).toBeDefined()

    // Verify file exists in storage
    const filePath = path.join(storageDir, receipt.storageKey)
    const exists = await fs.stat(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('GET receipt: returns full metadata', async () => {
    const { cookie } = await setupUser()

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

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(getRes.statusCode).toBe(200)
    const receipt = getRes.json().receipt
    expect(receipt.id).toBe(receiptId)
    expect(receipt.status).toBe('uploaded')
    expect(receipt.originalFilename).toBe('receipt.png')
    expect(receipt.mimeType).toBe('image/png')
    expect(receipt.sizeBytes).toBeDefined()
  })

  it('process: requires external_ocr_enabled setting', async () => {
    const { cookie } = await setupUser()

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

    // Try to process without enabling external OCR
    const processRes = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/process`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(processRes.statusCode).toBe(403)
    expect(processRes.json().error.code).toBe('EXTERNAL_OCR_DISABLED')
  })

  it('process: extracts OCR text and parses draft with stub provider', async () => {
    const { cookie, userId } = await setupUser()

    // Reset quota for this test
    const today = new Date().toISOString().slice(0, 10)
    await prisma.externalApiUsage.deleteMany({
      where: {
        provider: 'ocrspace',
        period: today,
        operation: 'extract',
      },
    })

    // Enable external OCR
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, externalOcrEnabled: true },
      update: { externalOcrEnabled: true },
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

    // Process receipt
    const processRes = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/process`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(processRes.statusCode).toBe(200)
    const receipt = processRes.json().receipt
    expect(receipt.status).toBe('ready')
    expect(receipt.ocrText).toBeDefined()
    expect(receipt.draft).toBeDefined()
    expect(receipt.draft.merchant).toBeDefined()
  })

  it('user isolation: cannot access another user\'s receipt', async () => {
    const user1 = await setupUser()
    const user2 = await setupUser()

    const pngBuffer = createTestPngBuffer()

    // User 1 uploads receipt
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
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}`,
      headers: { origin: APP_ORIGIN, cookie: user2.cookie },
    })

    expect(getRes.statusCode).toBe(404)
  })

  it('delete: allowed before commit, blocked after commit', async () => {
    const { cookie, userId } = await setupUser()

    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, externalOcrEnabled: true },
      update: { externalOcrEnabled: true },
    })

    // Create account for posting transaction
    await prisma.financialAccount.create({
      data: {
        userId,
        name: 'Test Account',
        accountType: 'checking',
        classification: 'asset',
        currentBalanceMinor: 100000n, // PHP 1000
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

    // Should be deletable before commit
    const deleteBeforeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/receipts/${receiptId}`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(deleteBeforeRes.statusCode).toBe(204)

    // After delete, GET should return 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(getRes.statusCode).toBe(404)
  })

  it('delete: blocked if receipt is linked to transaction', async () => {
    const { cookie, userId } = await setupUser()

    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, externalOcrEnabled: true },
      update: { externalOcrEnabled: true },
    })

    // Create account
    await prisma.financialAccount.create({
      data: {
        userId,
        name: 'Test Account',
        accountType: 'checking',
        classification: 'asset',
        currentBalanceMinor: 100000n,
      },
    })

    // Create a receipt and link it to a transaction directly (simulate post-commit state)
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'expense',
        title: 'Coffee',
        amountMinor: 30000n,
        currencyCode: 'PHP',
        occurredOn: new Date(),
        source: 'manual',
        status: 'cleared',
      },
    })

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
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/receipts/${receipt.id}`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(deleteRes.statusCode).toBe(400)
    expect(deleteRes.json().error.code).toBe('RECEIPT_LINKED_TO_TRANSACTION')
  })

  it('quota enforcement: rejects when daily quota is exhausted', async () => {
    const { cookie, userId } = await setupUser()

    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, externalOcrEnabled: true },
      update: { externalOcrEnabled: true },
    })

    // Exhaust the quota by setting call count to max
    const today = new Date().toISOString().slice(0, 10)
    await prisma.externalApiUsage.upsert({
      where: {
        provider_period_operation: {
          provider: 'ocrspace',
          period: today,
          operation: 'extract',
        },
      },
      create: {
        provider: 'ocrspace',
        period: today,
        operation: 'extract',
        callCount: 450,
      },
      update: {
        callCount: 450,
      },
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

    // Try to process
    const processRes = await app.inject({
      method: 'POST',
      url: `/api/v1/receipts/${receiptId}/process`,
      headers: { origin: APP_ORIGIN, cookie },
    })

    expect(processRes.statusCode).toBe(429)
    expect(processRes.json().error.code).toBe('EXTERNAL_PROVIDER_QUOTA_REACHED')
  })

  it('auth guard: rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/receipts/some-id',
      headers: { origin: APP_ORIGIN },
    })

    expect(res.statusCode).toBe(401)
  })
})
