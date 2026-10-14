import type { PrismaClient } from '@prisma/client'

export interface RecurringWorkerLogger {
  warn(obj: Record<string, unknown>, msg?: string): void
}

export interface RecurringScanResult {
  due: number
  overdue: number
}

/**
 * Stage 6B: a due date NEVER creates a financial transaction. This scan is read-only: it counts active
 * bills that are due today or overdue so the worker can log and the notification step can remind the user.
 * It does not post to the ledger, change a balance, advance a schedule, set `lastPaidDate`, pause an item
 * or write anything at all. Only an explicit user confirmation (RecurringService.confirm) records a payment.
 * There is intentionally no flag that turns automatic posting back on.
 */
export async function scanDueRecurringItems(prisma: PrismaClient, todayIso: string, logger?: RecurringWorkerLogger, userId?: string): Promise<RecurringScanResult> {
  const items = await prisma.recurringItem.findMany({ where: { status: 'active', ...(userId ? { userId } : {}), nextDueDate: { lte: new Date(`${todayIso}T00:00:00Z`) } }, select: { id: true, nextDueDate: true } })
  const today = new Date(`${todayIso}T00:00:00Z`).getTime()
  const overdue = items.filter((item) => item.nextDueDate.getTime() < today).length
  if (items.length > 0) logger?.warn({ due: items.length - overdue, overdue, userId }, 'recurring bills are waiting for the user to confirm payment (nothing was posted)')
  return { due: items.length - overdue, overdue }
}
