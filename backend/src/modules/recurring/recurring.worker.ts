import type { PrismaClient } from '@prisma/client'
import type { LedgerService } from '../ledger/ledger.service.js'

export interface RecurringWorkerLogger {
  warn(obj: Record<string, unknown>, msg?: string): void
}

export interface RecurringRunResult {
  processed: number
  failed: number
}

/**
 * Processes all active definitions due on or before `todayIso`. The ledger
 * idempotency key is derived from the definition and its due date, so a
 * second worker or a retry cannot create a second financial charge.
 *
 * A failure on one item (e.g. its linked account/category was archived or
 * removed after the recurring item was created) must never abort the rest of
 * the run — see QA Phase 5 Attempt 1, Defects 1 and 3. Each item is processed
 * in its own try/catch: a failure is logged and the item is auto-paused so it
 * stops retrying against a permanently-broken link, while every other due
 * item in the same run still gets processed.
 */
export async function processDueRecurringItems(prisma: PrismaClient, ledgerService: LedgerService, todayIso: string, logger?: RecurringWorkerLogger): Promise<RecurringRunResult> {
  const dueItems = await prisma.recurringItem.findMany({ where: { status: 'active', nextDueDate: { lte: new Date(`${todayIso}T00:00:00Z`) }, account: { archivedAt: null } }, orderBy: { nextDueDate: 'asc' } })
  let processed = 0
  let failed = 0
  for (const item of dueItems) {
    const dueDate = item.nextDueDate.toISOString().slice(0, 10)
    const idempotencyKey = `recurring:${item.id}:${dueDate}`
    try {
      await ledgerService.postTransaction(item.userId, { type: 'expense', title: item.merchant, categoryId: item.categoryId, goalId: null, fromAccountId: item.accountId, toAccountId: null, occurredOn: dueDate, occurredTime: null, amountMinor: Number(item.amountMinor), feeMinor: 0, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment', idempotencyKey })
      await prisma.recurringItem.update({ where: { id: item.id }, data: { nextDueDate: advanceDueDate(item.nextDueDate, item.frequency), lastPaidDate: item.nextDueDate } })
      processed += 1
    } catch (err) {
      failed += 1
      logger?.warn({ itemId: item.id, err }, 'failed to post recurring transaction')
      // Auto-pause rather than retry forever against a permanently-broken
      // link (deleted/archived category, etc.). Best-effort: if even the
      // pause update fails, log it too but keep processing the remaining
      // due items — a stuck item must never stop the run.
      await prisma.recurringItem.update({ where: { id: item.id }, data: { status: 'paused' } }).catch((pauseErr: unknown) => {
        logger?.warn({ itemId: item.id, err: pauseErr }, 'failed to auto-pause recurring item after error')
      })
    }
  }
  return { processed, failed }
}

function advanceDueDate(date: Date, frequency: 'weekly' | 'monthly' | 'yearly'): Date {
  const next = new Date(date)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1)
  else next.setUTCFullYear(next.getUTCFullYear() + 1)
  return next
}
