import type { PrismaClient } from '@prisma/client'

export async function enqueueDueBillNotifications(prisma: PrismaClient, todayIso: string): Promise<number> {
  const end = new Date(`${todayIso}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 7)
  const items = await prisma.recurringItem.findMany({ where: { status: 'active', nextDueDate: { lte: end } }, select: { id: true, userId: true, merchant: true, amountMinor: true, nextDueDate: true } })
  let enqueued = 0
  for (const item of items) {
    const dueDate = item.nextDueDate.toISOString().slice(0, 10)
    const result = await prisma.notificationOutbox.upsert({ where: { dedupeKey: `bill-due:${item.id}:${dueDate}` }, create: { userId: item.userId, kind: 'bill_due', dedupeKey: `bill-due:${item.id}:${dueDate}`, payload: { recurringItemId: item.id, merchant: item.merchant, amountMinor: Number(item.amountMinor), dueDate } }, update: {} })
    if (result.createdAt.getTime() === result.updatedAt.getTime()) enqueued += 1
  }
  return enqueued
}

export async function enqueueWeeklySummaryNotifications(prisma: PrismaClient, todayIso: string): Promise<number> {
  const end = new Date(`${todayIso}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 7)
  const users = await prisma.user.findMany({ where: { preferences: { weeklySummaryEmail: true } }, select: { id: true } })
  let enqueued = 0
  for (const user of users) {
    const transactions = await prisma.transaction.findMany({ where: { userId: user.id, occurredOn: { gte: start, lt: end }, status: 'cleared' }, select: { type: true, amountMinor: true } })
    const incomeMinor = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amountMinor), 0)
    const expenseMinor = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amountMinor), 0)
    await prisma.notificationOutbox.upsert({ where: { dedupeKey: `weekly-summary:${user.id}:${todayIso}` }, create: { userId: user.id, kind: 'weekly_summary', dedupeKey: `weekly-summary:${user.id}:${todayIso}`, payload: { from: start.toISOString().slice(0, 10), to: todayIso, incomeMinor, expenseMinor } }, update: {} })
    enqueued += 1
  }
  return enqueued
}
