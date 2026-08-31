import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

describeIfDb('LedgerModule (real PostgreSQL)', () => {
  it('enforces overdraft and returns the existing result for a retried idempotency key', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
    const userId = randomUUID()
    const accountId = randomUUID()
    const categoryId = randomUUID()
    try {
      await prisma.user.create({ data: { id: userId, email: `${userId}@ledger.test`, passwordHash: 'test', displayName: 'Ledger Test' } })
      await prisma.financialAccount.create({ data: { id: accountId, userId, name: 'Test cash', accountType: 'checking', classification: 'asset', currentBalanceMinor: 1000, openingBalanceMinor: 1000 } })
      await prisma.category.create({ data: { id: categoryId, userId: null, name: 'Test expense', color: '#000', allowsExpense: true } })
      const ledger = new LedgerService(prisma, new LedgerRepository(prisma))
      const input = { type: 'expense' as const, title: 'Test spend', categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: '2026-08-31', occurredTime: null, amountMinor: 400, feeMinor: 0, currencyCode: 'PHP', source: 'manual' as const, status: 'cleared' as const, note: null, idempotencyKey: 'ledger-test-retry' }
      const first = await ledger.postTransaction(userId, input)
      const retry = await ledger.postTransaction(userId, input)
      expect(retry.transaction.id).toBe(first.transaction.id)
      expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })).currentBalanceMinor).toBe(600n)
      await expect(ledger.postTransaction(userId, { ...input, title: 'Too large', amountMinor: 601, idempotencyKey: 'ledger-test-overdraft' })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' })
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined)
      await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined)
      await prisma.$disconnect()
    }
  })
})
