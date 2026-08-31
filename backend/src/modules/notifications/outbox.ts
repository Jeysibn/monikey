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
