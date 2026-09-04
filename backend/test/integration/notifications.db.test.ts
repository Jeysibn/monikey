// Real-Postgres integration coverage for Phase 5 (Notification Outbox).
// Added in response to QA Attempt 1 Defect 2 (zero coverage of this scope).
// Exercises `enqueueDueBillNotifications`/`enqueueWeeklySummaryNotifications`
// (dedupe-key uniqueness, user scoping) and `deliverNotificationOutbox`
// (successful delivery, and a retry/failure mode against a fake
// `EmailProvider`) directly, mirroring `budget.db.test.ts`/`ledger.db.test.ts`.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { enqueueDueBillNotifications, enqueueWeeklySummaryNotifications } from '../../src/modules/notifications/outbox.js'
import { deliverNotificationOutbox } from '../../src/modules/notifications/delivery.js'
import type { EmailMessage, EmailProvider } from '../../src/modules/notifications/email.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

async function makeUser(prisma: PrismaClient, suffix: string, weeklySummaryEmail = false) {
  const userId = randomUUID()
  await prisma.user.create({ data: { id: userId, email: `${userId}@${suffix}.test`, passwordHash: 'test', displayName: 'Notifications Test', preferences: { create: { weeklySummaryEmail } } } })
  return userId
}

async function makeAccount(prisma: PrismaClient, userId: string, balanceMinor: number) {
  const accountId = randomUUID()
  await prisma.financialAccount.create({ data: { id: accountId, userId, name: 'Test cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: balanceMinor, openingBalanceMinor: balanceMinor } })
  return accountId
}

async function makeExpenseCategory(prisma: PrismaClient, userId: string) {
  const category = await prisma.category.create({ data: { userId, name: `Bills ${randomUUID()}`, color: '#123', allowsExpense: true } })
  return category.id
}

describeIfDb('NotificationsModule outbox (real PostgreSQL)', () => {
  it('enqueues one bill-due notification per due recurring item, scoped to its owning user, with unique dedupe keys', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userA = await makeUser(prisma, 'notif-a')
    const userB = await makeUser(prisma, 'notif-b')
    try {
      const accountA = await makeAccount(prisma, userA, 100000)
      const categoryA = await makeExpenseCategory(prisma, userA)
      const accountB = await makeAccount(prisma, userB, 100000)
      const categoryB = await makeExpenseCategory(prisma, userB)
      const todayIso = '2026-09-01'

      await prisma.recurringItem.create({ data: { userId: userA, merchant: 'A Bill', amountMinor: BigInt(1000), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId: accountA, categoryId: categoryA } })
      await prisma.recurringItem.create({ data: { userId: userB, merchant: 'B Bill', amountMinor: BigInt(2000), frequency: 'monthly', nextDueDate: new Date(`${todayIso}T00:00:00Z`), accountId: accountB, categoryId: categoryB } })

      const enqueued = await enqueueDueBillNotifications(prisma, todayIso)
      expect(enqueued).toBe(2)

      const notificationsA = await prisma.notificationOutbox.findMany({ where: { userId: userA } })
      const notificationsB = await prisma.notificationOutbox.findMany({ where: { userId: userB } })
      expect(notificationsA).toHaveLength(1)
      expect(notificationsB).toHaveLength(1)
      expect(notificationsA[0]!.userId).toBe(userA)
      expect(notificationsB[0]!.userId).toBe(userB)

      // Re-running the enqueue for the same day must not create duplicate
      // rows (dedupe key is `bill-due:{itemId}:{dueDate}`, unique per row,
      // and `upsert` targets it) even though the underlying `update: {}`
      // still bumps `updatedAt` via Prisma's `@updatedAt`.
      await enqueueDueBillNotifications(prisma, todayIso)
      const totalAfterRerun = await prisma.notificationOutbox.count({ where: { userId: { in: [userA, userB] } } })
      expect(totalAfterRerun).toBe(2)

      const allDedupeKeys = [...notificationsA, ...notificationsB].map((n) => n.dedupeKey)
      expect(new Set(allDedupeKeys).size).toBe(allDedupeKeys.length)
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { userId: { in: [userA, userB] } } })
      await prisma.recurringItem.deleteMany({ where: { userId: { in: [userA, userB] } } })
      await prisma.user.delete({ where: { id: userA } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: userB } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('enqueues a weekly summary only for users opted in, with a dedupe key unique per user per day', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const optedIn = await makeUser(prisma, 'notif-optin', true)
    const optedOut = await makeUser(prisma, 'notif-optout', false)
    try {
      const todayIso = '2026-09-01'
      const enqueued = await enqueueWeeklySummaryNotifications(prisma, todayIso)
      expect(enqueued).toBeGreaterThanOrEqual(1)

      const optedInNotifications = await prisma.notificationOutbox.findMany({ where: { userId: optedIn, kind: 'weekly_summary' } })
      const optedOutNotifications = await prisma.notificationOutbox.findMany({ where: { userId: optedOut, kind: 'weekly_summary' } })
      expect(optedInNotifications).toHaveLength(1)
      expect(optedOutNotifications).toHaveLength(0)
      expect(optedInNotifications[0]!.dedupeKey).toBe(`weekly-summary:${optedIn}:${todayIso}`)

      // Re-running for the same day is a no-op (upsert on the unique dedupe key).
      await enqueueWeeklySummaryNotifications(prisma, todayIso)
      const countAfterRerun = await prisma.notificationOutbox.count({ where: { userId: optedIn, kind: 'weekly_summary' } })
      expect(countAfterRerun).toBe(1)
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { userId: { in: [optedIn, optedOut] } } })
      await prisma.user.delete({ where: { id: optedIn } }).catch(() => undefined)
      await prisma.user.delete({ where: { id: optedOut } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('delivers a pending notification and marks it sent', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'notif-deliver')
    try {
      const sent: EmailMessage[] = []
      const provider: EmailProvider = { async send(message) { sent.push(message) } }
      await prisma.notificationOutbox.create({ data: { userId, kind: 'bill_due', dedupeKey: `bill-due:${randomUUID()}:2026-09-01`, payload: { merchant: 'Netflix', amountMinor: 1500, dueDate: '2026-09-01' } } })

      const delivered = await deliverNotificationOutbox(prisma, provider)
      expect(delivered).toBe(1)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.text).toMatch(/Netflix/)

      const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { userId } })
      expect(row.status).toBe('sent')
      expect(row.sentAt).not.toBeNull()
      expect(row.lastError).toBeNull()
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })

  it('marks a notification failed with a backed-off retry time when the provider throws, without crashing the batch, and keeps trying the remaining rows', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = await makeUser(prisma, 'notif-retry')
    try {
      const provider: EmailProvider = { async send(message) {
        if (message.text.includes('Failing')) throw new Error('simulated provider outage')
      } }
      const failing = await prisma.notificationOutbox.create({ data: { userId, kind: 'bill_due', dedupeKey: `bill-due:${randomUUID()}:2026-09-01`, payload: { merchant: 'Failing Merchant', amountMinor: 1000, dueDate: '2026-09-01' } } })
      await prisma.notificationOutbox.create({ data: { userId, kind: 'bill_due', dedupeKey: `bill-due:${randomUUID()}:2026-09-02`, payload: { merchant: 'Working Merchant', amountMinor: 2000, dueDate: '2026-09-02' } } })

      const delivered = await deliverNotificationOutbox(prisma, provider)
      // The failing row does not count as delivered; the healthy row does.
      expect(delivered).toBe(1)

      const failedRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: failing.id } })
      expect(failedRow.status).toBe('failed')
      expect(failedRow.attemptCount).toBe(1)
      expect(failedRow.lastError).toMatch(/simulated provider outage/)
      expect(failedRow.availableAt.getTime()).toBeGreaterThan(Date.now())

      const rows = await prisma.notificationOutbox.findMany({ where: { userId } })
      const sentRow = rows.find((row) => row.id !== failing.id)!
      expect(sentRow.status).toBe('sent')
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })
})
