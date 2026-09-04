// Real-Postgres integration coverage for Phase 4 (Goals). Exercises goal
// funding through the actual LedgerModule call path used by
// `goals.routes.ts`'s `POST /goals/:id/fund` handler (a `transfer` with
// `goalId` set and `toAccountId: null`) — see QA Attempt 1 Defect 1/2.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

async function makeUser(prisma: PrismaClient, suffix: string) {
  const userId = randomUUID()
  await prisma.user.create({ data: { id: userId, email: `${userId}@${suffix}.test`, passwordHash: 'test', displayName: 'Goals Test' } })
  return userId
}

async function makeAccount(prisma: PrismaClient, userId: string, balanceMinor: number) {
  const accountId = randomUUID()
  await prisma.financialAccount.create({ data: { id: accountId, userId, name: 'Test cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: balanceMinor, openingBalanceMinor: balanceMinor } })
  return accountId
}

async function makeGoal(prisma: PrismaClient, userId: string, targetMinor: number, opts?: { active?: boolean }) {
  const goal = await prisma.goal.create({ data: { userId, name: 'Emergency fund', targetMinor, targetDate: new Date('2027-01-01T00:00:00Z'), active: opts?.active ?? true, status: 'active' } })
  return goal
}

describeIfDb('GoalsModule funding (real PostgreSQL)', () => {
  it('funds a goal atomically: increments currentMinor, debits the source account, and records a contribution', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'goal-fund')
    try {
      const accountId = await makeAccount(prisma, userId, 5000)
      const goal = await makeGoal(prisma, userId, 2000)
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))

      const result = await ledger.postTransaction(userId, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 500, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-fund-happy' })

      expect(result.transaction.type).toBe('transfer')
      expect(result.balanceEffects).toHaveLength(1)
      expect(result.balanceEffects[0]!.accountId).toBe(accountId)

      const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })
      expect(updatedGoal.currentMinor).toBe(500n)

      const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
      expect(account.currentBalanceMinor).toBe(4500n)

      const contribution = await prisma.goalContribution.findUnique({ where: { transactionId: result.transaction.id } })
      expect(contribution).not.toBeNull()
      expect(contribution!.amountMinor).toBe(500n)
      expect(contribution!.goalId).toBe(goal.id)
      expect(contribution!.sourceAccountId).toBe(accountId)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('rejects funding that would exceed the goal target (GOAL_OVERFUNDED) at the boundary', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'goal-overfund')
    try {
      const accountId = await makeAccount(prisma, userId, 5000)
      const goal = await makeGoal(prisma, userId, 1000)
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))

      // Exactly at the remaining target succeeds.
      await ledger.postTransaction(userId, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 1000, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-overfund-exact' })
      const filled = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })
      expect(filled.currentMinor).toBe(1000n)

      // One more peso over the (now-zero) remaining target fails.
      await expect(
        ledger.postTransaction(userId, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 1, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-overfund-over' })
      ).rejects.toMatchObject({ code: 'GOAL_OVERFUNDED' })
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('rejects funding an inactive goal (GOAL_INACTIVE)', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'goal-inactive')
    try {
      const accountId = await makeAccount(prisma, userId, 5000)
      const goal = await makeGoal(prisma, userId, 2000, { active: false })
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))

      await expect(
        ledger.postTransaction(userId, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 100, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-inactive-fund' })
      ).rejects.toMatchObject({ code: 'GOAL_INACTIVE' })
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('retries the same idempotency key without double-funding the goal', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'goal-idem')
    try {
      const accountId = await makeAccount(prisma, userId, 5000)
      const goal = await makeGoal(prisma, userId, 2000)
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
      const input = { type: 'transfer' as const, title: 'Goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 300, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: null, idempotencyKey: 'goal-idem-retry' }

      const first = await ledger.postTransaction(userId, input)
      const retry = await ledger.postTransaction(userId, input)

      expect(retry.transaction.id).toBe(first.transaction.id)
      const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })
      expect(updatedGoal.currentMinor).toBe(300n)
      const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
      expect(account.currentBalanceMinor).toBe(4700n)
      const contributions = await prisma.goalContribution.findMany({ where: { goalId: goal.id } })
      expect(contributions).toHaveLength(1)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('serializes concurrent funding attempts so the goal target cannot be exceeded', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'goal-concurrent')
    try {
      const accountId = await makeAccount(prisma, userId, 5000)
      const goal = await makeGoal(prisma, userId, 800)
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
      const input = (key: string) => ({ type: 'transfer' as const, title: 'Concurrent goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 500, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: null, idempotencyKey: key })

      const results = await Promise.allSettled([ledger.postTransaction(userId, input('goal-concurrent-a')), ledger.postTransaction(userId, input('goal-concurrent-b'))])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
      const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })
      expect(updatedGoal.currentMinor).toBe(500n)
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('reversing a goal-funded transaction decrements currentMinor and removes the contribution row', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'goal-reverse')
    try {
      const accountId = await makeAccount(prisma, userId, 5000)
      const goal = await makeGoal(prisma, userId, 2000)
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
      const posted = await ledger.postTransaction(userId, { type: 'transfer', title: 'Goal funding', categoryId: null, goalId: goal.id, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 400, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-reverse-fund' })

      await ledger.reverseTransaction(userId, posted.transaction.id, {})

      const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })
      expect(updatedGoal.currentMinor).toBe(0n)
      const contribution = await prisma.goalContribution.findUnique({ where: { transactionId: posted.transaction.id } })
      expect(contribution).toBeNull()
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('does not let user B fund or see user A goal', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userA = await makeUser(prisma, 'goal-isoA')
    const userB = await makeUser(prisma, 'goal-isoB')
    try {
      const accountB = await makeAccount(prisma, userB, 5000)
      const goal = await makeGoal(prisma, userA, 1000)
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))

      // User B cannot see user A's goal via a user-scoped lookup.
      const visibleToB = await prisma.goal.findFirst({ where: { id: goal.id, userId: userB } })
      expect(visibleToB).toBeNull()

      // User B cannot fund user A's goal (goal lookup inside postTransaction is user-scoped).
      await expect(
        ledger.postTransaction(userB, { type: 'transfer', title: 'Cross-user fund attempt', categoryId: null, goalId: goal.id, fromAccountId: accountB, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 100, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-cross-user' })
      ).rejects.toMatchObject({ code: 'UNKNOWN_GOAL' })

      // And user A cannot fund using user B's account.
      await expect(
        ledger.postTransaction(userA, { type: 'transfer', title: 'Cross-user account attempt', categoryId: null, goalId: goal.id, fromAccountId: accountB, toAccountId: null, occurredOn: '2026-09-01', occurredTime: null, amountMinor: 100, feeMinor: 0, currencyCode: 'PHP', source: 'manual', status: 'cleared', note: null, idempotencyKey: 'goal-cross-account' })
      ).rejects.toMatchObject({ code: 'UNKNOWN_ACCOUNT' })

      const untouchedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })
      expect(untouchedGoal.currentMinor).toBe(0n)
    } finally {
      await prisma.user.delete({ where: { id: userA } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: userB } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })
})
