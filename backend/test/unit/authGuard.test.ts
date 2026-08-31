import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { resolveSession } from '../../src/common/auth/authGuard.js'
import { hashSessionToken } from '../../src/common/auth/sessionToken.js'

const FIXED_NOW = new Date('2026-08-31T00:00:00.000Z')

function fakePrisma(session: unknown): PrismaClient {
  return {
    userSession: {
      findUnique: vi.fn().mockResolvedValue(session),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as PrismaClient
}

function baseUser() {
  return {
    id: 'user-1',
    email: 'a@example.com',
    displayName: 'A User',
    timezone: 'Asia/Manila',
    baseCurrency: 'PHP',
  }
}

describe('resolveSession', () => {
  it('returns undefined when the cookie is missing', async () => {
    const prisma = fakePrisma(undefined)
    await expect(resolveSession(prisma, undefined, () => FIXED_NOW)).resolves.toBeUndefined()
  })

  it('returns undefined for a tampered/unknown token (no matching row)', async () => {
    const prisma = fakePrisma(null)
    await expect(resolveSession(prisma, 'some-raw-token', () => FIXED_NOW)).resolves.toBeUndefined()
  })

  it('resolves the user for a valid, unexpired session', async () => {
    const rawToken = 'raw-token-value'
    const prisma = fakePrisma({
      id: 'session-1',
      tokenHash: hashSessionToken(rawToken),
      expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
      user: baseUser(),
    })
    const result = await resolveSession(prisma, rawToken, () => FIXED_NOW)
    expect(result).toEqual({ sessionId: 'session-1', user: baseUser() })
  })

  it('returns undefined for an expired session and deletes the row', async () => {
    const rawToken = 'raw-token-value'
    const deleteMock = vi.fn().mockResolvedValue(undefined)
    const prisma = {
      userSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          tokenHash: hashSessionToken(rawToken),
          expiresAt: new Date(FIXED_NOW.getTime() - 1_000),
          user: baseUser(),
        }),
        delete: deleteMock,
        update: vi.fn(),
      },
    } as unknown as PrismaClient

    await expect(resolveSession(prisma, rawToken, () => FIXED_NOW)).resolves.toBeUndefined()
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'session-1' } })
  })

  it('treats a session expiring at exactly "now" as expired (boundary)', async () => {
    const rawToken = 'raw-token-value'
    const prisma = fakePrisma({
      id: 'session-1',
      tokenHash: hashSessionToken(rawToken),
      expiresAt: FIXED_NOW,
      user: baseUser(),
    })
    await expect(resolveSession(prisma, rawToken, () => FIXED_NOW)).resolves.toBeUndefined()
  })
})
