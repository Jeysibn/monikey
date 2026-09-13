import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import { createPrismaClient } from '../../src/db/client.js'
import { generateSessionToken, hashSessionToken } from '../../src/common/auth/sessionToken.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip
const origin = 'http://localhost:8080'

describeIfDb('Accounts OpenAPI contract (real PostgreSQL)', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let userId: string
  let cookie: string

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl!)
    app = await buildApp({
      prisma,
      env: loadEnv({ DATABASE_URL: databaseUrl!, NODE_ENV: 'test', APP_ORIGIN: origin, LOG_LEVEL: 'silent' }),
    })
    const user = await prisma.user.create({
      data: { email: `account-contract-${randomUUID()}@monikey.test`, displayName: 'Contract User', passwordHash: 'not-used' },
    })
    userId = user.id
    const token = generateSessionToken()
    await prisma.userSession.create({
      data: { userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    cookie = `monikey_session=${token}`
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } })
    await app.close()
    await prisma.$disconnect()
  })

  it('serializes an e-wallet account using string minor units', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie, origin },
      payload: { name: 'GCash', accountType: 'ewallet', openingBalanceMinor: '1234' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      userId,
      name: 'GCash',
      accountType: 'ewallet',
      classification: 'asset',
      openingBalanceMinor: '1234',
      currentBalanceMinor: '1234',
      creditCardDetail: null,
    })

    const listed = await app.inject({ method: 'GET', url: '/api/v1/accounts', headers: { cookie } })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'GCash', accountType: 'ewallet' })]))
  })
})
