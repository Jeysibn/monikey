// Real-Postgres, real-HTTP integration coverage for the forgot/reset
// password flow, following the same conventions as auth.db.test.ts:
// app.inject() against a real Fastify app and a real database, gated on
// TEST_DATABASE_URL/DATABASE_URL.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'
import type { EmailMessage, EmailProvider } from '../../src/modules/notifications/email.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

const APP_ORIGIN = 'http://localhost:8080'

function extractSessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  const cookie = res.cookies.find((c) => c.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

/** Captures every email "sent" during a test instead of talking to mailpit, and pulls the raw reset token straight out of the message body. */
function createCapturingEmailProvider(): EmailProvider & { messages: EmailMessage[] } {
  const messages: EmailMessage[] = []
  return {
    messages,
    async send(message) {
      messages.push(message)
    },
  }
}

function extractResetToken(message: EmailMessage): string {
  const match = message.text.match(/resetToken=([^\s]+)/)
  if (!match) throw new Error('No reset token found in email body')
  return decodeURIComponent(match[1])
}

describeIfDb('Forgot/reset password (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdEmails: string[] = []
  let app: FastifyInstance
  let emailProvider: ReturnType<typeof createCapturingEmailProvider>

  beforeEach(async () => {
    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN,
      SESSION_SECURE: 'false',
    })
    emailProvider = createCapturingEmailProvider()
    app = await buildApp({ env, prisma, emailProvider })
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } })
    await prisma.$disconnect()
  })

  function uniqueEmail(): string {
    const email = `qa-reset-${randomUUID()}@monikey.test`
    createdEmails.push(email)
    return email
  }

  async function register(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password, displayName: 'Reset Flow' },
    })
  }

  it('full cycle: forgot-password emails a reset link, reset-password changes the password, old password stops working', async () => {
    const email = uniqueEmail()
    await register(email, 'original-password-1')

    const forgotRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: APP_ORIGIN },
      payload: { email },
    })
    expect(forgotRes.statusCode).toBe(204)
    expect(emailProvider.messages).toHaveLength(1)
    expect(emailProvider.messages[0].to).toBe(email.toLowerCase())

    const token = extractResetToken(emailProvider.messages[0])

    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin: APP_ORIGIN },
      payload: { token, password: 'brand-new-password-2' },
    })
    expect(resetRes.statusCode).toBe(204)

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'original-password-1' },
    })
    expect(oldLogin.statusCode).toBe(401)

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'brand-new-password-2' },
    })
    expect(newLogin.statusCode).toBe(200)
  })

  it('does not reveal whether an email is registered (enumeration resistance)', async () => {
    const registered = uniqueEmail()
    await register(registered, 'some-password-1')

    const knownRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: APP_ORIGIN },
      payload: { email: registered },
    })
    const unknownRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: APP_ORIGIN },
      payload: { email: `nobody-${randomUUID()}@monikey.test` },
    })

    expect(knownRes.statusCode).toBe(204)
    expect(unknownRes.statusCode).toBe(204)
    expect(knownRes.body).toBe(unknownRes.body)
    // Only the registered address actually got an email.
    expect(emailProvider.messages).toHaveLength(1)
  })

  it('rejects a reset token that has already been used', async () => {
    const email = uniqueEmail()
    await register(email, 'first-password-1')
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: APP_ORIGIN },
      payload: { email },
    })
    const token = extractResetToken(emailProvider.messages[0])

    const firstUse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin: APP_ORIGIN },
      payload: { token, password: 'second-password-2' },
    })
    expect(firstUse.statusCode).toBe(204)

    const secondUse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin: APP_ORIGIN },
      payload: { token, password: 'third-password-3' },
    })
    expect(secondUse.statusCode).toBe(400)
    expect(secondUse.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a nonexistent/garbage token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin: APP_ORIGIN },
      payload: { token: 'not-a-real-token', password: 'whatever-password-1' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects an expired reset token', async () => {
    const email = uniqueEmail()
    await register(email, 'expiring-password-1')
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: APP_ORIGIN },
      payload: { email },
    })
    const token = extractResetToken(emailProvider.messages[0])

    await prisma.passwordResetToken.updateMany({
      where: { user: { email: email.toLowerCase() } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin: APP_ORIGIN },
      payload: { token, password: 'whatever-password-2' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('a successful reset invalidates every existing session', async () => {
    const email = uniqueEmail()
    const registerRes = await register(email, 'session-kill-password-1')
    const sessionCookie = extractSessionCookie(registerRes)!

    const meBefore = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: sessionCookie } })
    expect(meBefore.statusCode).toBe(200)

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: APP_ORIGIN },
      payload: { email },
    })
    const token = extractResetToken(emailProvider.messages[0])
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: { origin: APP_ORIGIN },
      payload: { token, password: 'session-kill-password-2' },
    })

    const meAfter = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: sessionCookie } })
    expect(meAfter.statusCode).toBe(401)
  })

  it('rejects a mutation whose Origin does not match APP_ORIGIN (CSRF/origin policy)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      headers: { origin: 'https://evil.example.com' },
      payload: { email: uniqueEmail() },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })
})
