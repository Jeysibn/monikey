// QA Attempt 1 (Phase 2), Finding D2: an unqualified `trustProxy: true` let
// `request.ip` — and therefore `@fastify/rate-limit`'s default IP key —
// derive from a client-supplied `X-Forwarded-For` header with no trust
// boundary at all, so rotating that header on every request gave each
// request its own fresh rate-limit bucket. `app.inject()` (light-my-request)
// mocks a fake socket and could plausibly hide a regression in this exact
// area, so — per QA's explicit request — this test drives requests through
// a REAL bound TCP server and a real `http.request()` call, not `inject()`.
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/env.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

const APP_ORIGIN = 'http://localhost:8080'

interface RawResponse {
  statusCode: number
  body: string
}

function rawPost(port: number, path: string, headers: Record<string, string>, payload: unknown): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload))
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': body.length,
          origin: APP_ORIGIN,
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

describeIfDb('login rate limiting survives a forged/rotating X-Forwarded-For (real socket, real proxy layer)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdEmails: string[] = []
  let app: FastifyInstance
  let port: number

  beforeAll(async () => {
    const env = loadEnv({
      DATABASE_URL: databaseUrl!,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_ORIGIN,
      SESSION_SECURE: 'false',
    })
    app = await buildApp({ env, prisma })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (address === null || typeof address === 'string') throw new Error('expected a bound TCP address')
    port = address.port
  })

  afterAll(async () => {
    await app.close()
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } })
    await prisma.$disconnect()
  })

  it('does NOT reset the limit when each request carries a different spoofed X-Forwarded-For prefix', async () => {
    const email = `qa-proxy-${randomUUID()}@monikey.test`
    createdEmails.push(email)

    await rawPost(port, '/api/v1/auth/register', {}, { email, password: 'proxy-rate-limit-1', displayName: 'Proxy Test' })

    // The real client connects over loopback (127.0.0.1) — trusted as one
    // proxy hop under `trustProxy: 'uniquelocal'`, standing in for nginx.
    // Faithfully reproducing the real topology: nginx's own
    // `proxy_add_x_forwarded_for` (docker/nginx.conf) APPENDS the genuine
    // browser IP as the LAST entry regardless of what the browser/attacker
    // already sent — it never trusts/preserves an inbound XFF value as the
    // final word. Each request here forges a different PREFIX (exactly
    // QA's repro against the old `trustProxy: true`) while the trailing,
    // nginx-appended "real" IP stays fixed — so a still-vulnerable
    // configuration would key on the ever-changing prefix's resolved
    // address and never trip, while the fix must key on the stable
    // trailing address and DOES trip.
    const statuses: number[] = []
    for (let i = 0; i < 15; i += 1) {
      const res = await rawPost(
        port,
        '/api/v1/auth/login',
        { 'x-forwarded-for': `${i}.${i}.${i}.${i}, 198.51.100.42` },
        { email, password: 'wrong-password' },
      )
      statuses.push(res.statusCode)
    }

    // If the forged prefix defeated the trust boundary, every one of these
    // would resolve to a distinct "client" and 429 would never appear.
    expect(statuses).toContain(429)
    // And the earlier attempts, before the limit trips, are still genuine
    // wrong-password 401s (proving the limiter is doing real work, not
    // just always-on-or-always-off).
    expect(statuses[0]).toBe(401)
  }, 20_000)

  it("resolves distinct real client IPs to independent buckets (doesn't collapse everyone onto nginx's own address)", async () => {
    const email = `qa-proxy-distinct-${randomUUID()}@monikey.test`
    createdEmails.push(email)
    await rawPost(port, '/api/v1/auth/register', {}, { email, password: 'distinct-ip-pw-1', displayName: 'Distinct IP' })

    // Simulate nginx's actual behavior: it APPENDS the genuine client IP as
    // the last hop via `proxy_add_x_forwarded_for` (docker/nginx.conf) — an
    // attacker's forged prefix does not change what nginx itself appends.
    // Two different "real" trailing IPs must be tracked independently.
    const forClientA = () =>
      rawPost(port, '/api/v1/auth/login', { 'x-forwarded-for': 'attacker-noise, 203.0.113.10' }, {
        email,
        password: 'wrong',
      })
    const forClientB = () =>
      rawPost(port, '/api/v1/auth/login', { 'x-forwarded-for': 'other-noise, 203.0.113.20' }, {
        email,
        password: 'wrong',
      })

    for (let i = 0; i < 10; i += 1) await forClientA()
    const clientALimited = await forClientA()
    const clientBStillFresh = await forClientB()

    expect(clientALimited.statusCode).toBe(429)
    expect(clientBStillFresh.statusCode).toBe(401)
  }, 20_000)
})
