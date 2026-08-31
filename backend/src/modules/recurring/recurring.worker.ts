import type { PrismaClient } from '@prisma/client'
import type { LedgerService } from '../ledger/ledger.service.js'

/**
 * Processes all active definitions due on or before `todayIso`. The ledger
 * idempotency key is derived from the definition and its due date, so a
 * second worker or a retry cannot create a second financial charge.
 */
export async function processDueRecurringItems(prisma: PrismaClient, ledgerService: LedgerService, todayIso: string): Promise<number> {
  const dueItems = await prisma.recurringItem.findMany({ where: { status: 'active', nextDueDate: { lte: new Date(`${todayIso}T00:00:00Z`) } }, orderBy: { nextDueDate: 'asc' } })
  let processed = 0
  for (const item of dueItems) {
    const dueDate = item.nextDueDate.toISOString().slice(0, 10)
    const idempotencyKey = `recurring:${item.id}:${dueDate}`
    await ledgerService.postTransaction(item.userId, { type: 'expense', title: item.merchant, categoryId: item.categoryId, goalId: null, fromAccountId: item.accountId, toAccountId: null, occurredOn: dueDate, occurredTime: null, amountMinor: Number(item.amountMinor), feeMinor: 0, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment', idempotencyKey })
    await prisma.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: advanceDueDate(item.nextDueDate, item.frequency), lastPaidDate: item.nextDueDate } })
    processed += 1
  }
  return processed
}

function advanceDueDate(date: Date, frequency: 'weekly' | 'monthly' | 'yearly'): Date {
  const next = new Date(date)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1)
  else next.setUTCFullYear(next.getUTCFullYear() + 1)
  return next
}
