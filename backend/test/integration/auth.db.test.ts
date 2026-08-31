// Real-Postgres, real-HTTP integration coverage for Phase 2 (Authentication
// and Settings). Exercises the actual request/response/cookie pipeline via
// `app.inject()` against a real Fastify app and a real database — not just
// isolated helper functions — per the explicit lesson from Phase 1's QA
// history (a High-severity regression shipped past a self-check that only
// proved an isolated helper worked, not the real pipeline).
//
// Gated on a real database exactly like health.db.test.ts/schema.constraints.test.ts:
// skips itself (rather than failing) when no TEST_DATABASE_URL/DATABASE_URL is set.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

const APP_ORIGIN = 'http://localhost:8080'

function extractSessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  const cookie = res.cookies.find((c) => c.name === 'monikey_session')
  return cookie ? `${cookie.name}=${cookie.value}` : undefined
}

describeIfDb('Phase 2 Auth + Settings (real PostgreSQL, real HTTP)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdEmails: string[] = []
  let app: FastifyInstance

  // A fresh app instance per test gives each test its own in-memory
  // rate-limit store (the `@fastify/rate-limit` default store is per Fastify
  // instance) — otherwise the register/login attempts made by earlier tests
  // in this file would count against the strict per-route limits and make
  // unrelated later tests flaky. The dedicated rate-limit test below is the
  // only one that deliberately exhausts its own budget.
  beforeEach(async () => {
    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN,
      SESSION_SECURE: 'false',
    })
    app = await buildApp({ env, prisma })
  })

  afterEach(async () => {
    await app.close()
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } })
    await prisma.$disconnect()
  })

  function uniqueEmail(): string {
    const email = `qa-auth-${randomUUID()}@monikey.test`
    createdEmails.push(email)
    return email
  }

  it('rejects a mutation whose Origin does not match APP_ORIGIN (CSRF/origin policy)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'https://evil.example.com' },
      payload: { email: uniqueEmail(), password: 'correct-horse-1', displayName: 'Evil Origin' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('full cycle: register -> login -> me -> logout, and rejects /me after logout', async () => {
    const email = uniqueEmail()
    const password = 'correct-horse-battery-1'

    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password, displayName: 'Register Cycle' },
    })
    expect(registerRes.statusCode).toBe(201)
    expect(registerRes.json().user.email).toBe(email.toLowerCase())
    // Never echo the password or a hash anywhere in the response body.
    expect(JSON.stringify(registerRes.json())).not.toMatch(/password/i)

    const setCookieHeader = registerRes.headers['set-cookie']
    expect(setCookieHeader).toBeDefined()
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
    expect(cookieStr).toMatch(/HttpOnly/i)
    expect(cookieStr).toMatch(/SameSite=Lax/i)

    const registerCookie = extractSessionCookie(registerRes)!

    const meAfterRegister = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: registerCookie },
    })
    expect(meAfterRegister.statusCode).toBe(200)
    expect(meAfterRegister.json().user.email).toBe(email.toLowerCase())

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: APP_ORIGIN },
      payload: { email, password },
    })
    expect(loginRes.statusCode).toBe(200)
    const loginCookie = extractSessionCookie(loginRes)!
    // Login issues its own fresh session distinct from the register session.
    expect(loginCookie).not.toBe(registerCookie)

    const meRes = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: loginCookie } })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().user.email).toBe(email.toLowerCase())

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: APP_ORIGIN, cookie: loginCookie },
    })
    expect(logoutRes.statusCode).toBe(204)

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: loginCookie },
    })
    expect(meAfterLogout.statusCode).toBe(401)
    expect(meAfterLogout.json().error.code).toBe('UNAUTHORIZED')
  })

  it('rejects duplicate registration with the same (normalized) email', async () => {
    const email = uniqueEmail()
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'first-password-1', displayName: 'First' },
    })
    expect(first.statusCode).toBe(201)

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email: `  ${email.toUpperCase()}  `, password: 'second-password-2', displayName: 'Second' },
    })
    expect(dup.statusCode).toBe(409)
    expect(JSON.stringify(dup.json())).not.toMatch(/password/i)
  })

  it('rejects login with the wrong password using a generic message (no enumeration)', async () => {
    const email = uniqueEmail()
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'right-password-1', displayName: 'Wrong PW Test' },
    })

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'totally-wrong' },
    })
    const noSuchUser = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: APP_ORIGIN },
      payload: { email: `nonexistent-${randomUUID()}@monikey.test`, password: 'totally-wrong' },
    })

    expect(wrongPassword.statusCode).toBe(401)
    expect(noSuchUser.statusCode).toBe(401)
    // Identical error body for "wrong password" and "no such user" — the
    // enumeration-resistance requirement for login.
    expect(wrongPassword.json()).toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: 'UNAUTHORIZED', message: expect.any(String) }) }),
    )
    expect(wrongPassword.json().error.message).toBe(noSuchUser.json().error.message)
  })

  it('rejects an expired session', async () => {
    const email = uniqueEmail()
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'expiring-session-1', displayName: 'Expiring' },
    })
    const cookie = extractSessionCookie(registerRes)!

    // Force the just-created session to be already expired.
    await prisma.userSession.updateMany({
      where: { user: { email: email.toLowerCase() } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })
    expect(res.statusCode).toBe(401)
  })

  it('rejects /settings for an unauthenticated request', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/settings' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects PUT /settings for an unauthenticated request', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      headers: { origin: APP_ORIGIN },
      payload: { hideCents: true },
    })
    expect(res.statusCode).toBe(401)
  })

  it('settings read/update round-trip, scoped strictly to the session user', async () => {
    const email = uniqueEmail()
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'settings-user-1', displayName: 'Settings Owner' },
    })
    const cookie = extractSessionCookie(registerRes)!

    const initial = await app.inject({ method: 'GET', url: '/api/v1/settings', headers: { cookie } })
    expect(initial.statusCode).toBe(200)
    expect(initial.json()).toEqual(
      expect.objectContaining({
        displayName: 'Settings Owner',
        timezone: 'Asia/Manila',
        baseCurrency: 'PHP',
        hideCents: false,
        billDueReminders: true,
      }),
    )

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      headers: { origin: APP_ORIGIN, cookie },
      payload: {
        hideCents: true,
        weeklySummaryEmail: true,
        displayName: 'Renamed Owner',
        externalAiEnabled: true,
      },
    })
    expect(updateRes.statusCode).toBe(200)
    expect(updateRes.json()).toEqual(
      expect.objectContaining({
        displayName: 'Renamed Owner',
        hideCents: true,
        weeklySummaryEmail: true,
        externalAiEnabled: true,
        // Untouched fields keep their prior values, proving this is a
        // partial update, not a destructive replace.
        billDueReminders: true,
        baseCurrency: 'PHP',
      }),
    )

    const reread = await app.inject({ method: 'GET', url: '/api/v1/settings', headers: { cookie } })
    expect(reread.json().displayName).toBe('Renamed Owner')
    expect(reread.json().hideCents).toBe(true)
  })

  it('rejects a bogus timezone value (QA Attempt 1, Finding D5) instead of persisting it', async () => {
    const email = uniqueEmail()
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'timezone-guard-1', displayName: 'Timezone Guard' },
    })
    const cookie = extractSessionCookie(registerRes)!

    const bogus = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      headers: { origin: APP_ORIGIN, cookie },
      payload: { timezone: 'Not/AReal_Zone' },
    })
    expect(bogus.statusCode).toBe(400)
    expect(bogus.json().error.code).toBe('VALIDATION_ERROR')

    const scriptInjection = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      headers: { origin: APP_ORIGIN, cookie },
      payload: { timezone: '<script>alert(1)</script>' },
    })
    expect(scriptInjection.statusCode).toBe(400)

    // Neither bogus value was persisted — the column still holds the
    // original valid default.
    const stillValid = await app.inject({ method: 'GET', url: '/api/v1/settings', headers: { cookie } })
    expect(stillValid.json().timezone).toBe('Asia/Manila')

    // A real IANA zone is still accepted.
    const valid = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      headers: { origin: APP_ORIGIN, cookie },
      payload: { timezone: 'America/New_York' },
    })
    expect(valid.statusCode).toBe(200)
    expect(valid.json().timezone).toBe('America/New_York')
  })

  it("user A's session can never read/modify user B's settings via a spoofed header", async () => {
    const emailA = uniqueEmail()
    const emailB = uniqueEmail()

    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email: emailA, password: 'user-a-password-1', displayName: 'User A' },
    })
    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email: emailB, password: 'user-b-password-1', displayName: 'User B' },
    })
    const cookieA = extractSessionCookie(regA)!
    const userBId = regB.json().user.id as string

    // Even if a malicious client sends a spoofed user-id-shaped header, the
    // guard resolves identity solely from the session cookie — there is no
    // code path that consults a client-supplied user id/header at all.
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings',
      headers: { origin: APP_ORIGIN, cookie: cookieA, 'x-user-id': userBId },
      payload: { displayName: 'Hijacked Name' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().displayName).toBe('Hijacked Name')

    // User B's own settings, read with User B's own session, are untouched.
    const cookieB = extractSessionCookie(regB)!
    const bSettings = await app.inject({ method: 'GET', url: '/api/v1/settings', headers: { cookie: cookieB } })
    expect(bSettings.json().displayName).toBe('User B')
  })

  it('login rate limiting triggers after repeated attempts from the same client', async () => {
    const email = uniqueEmail()
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: APP_ORIGIN },
      payload: { email, password: 'rate-limit-target-1', displayName: 'Rate Limited' },
    })

    const attempts = []
    for (let i = 0; i < 15; i += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin: APP_ORIGIN },
          payload: { email, password: 'wrong-password-attempt' },
        }),
      )
    }

    const statuses = attempts.map((r) => r.statusCode)
    expect(statuses).toContain(429)
    const limited = attempts.find((r) => r.statusCode === 429)!
    expect(limited.json().error.code).toBe('RATE_LIMITED')
  })
})
