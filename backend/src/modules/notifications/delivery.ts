import type { PrismaClient } from '@prisma/client'
import type { EmailProvider } from './email.js'

/** Minor units (string, number or bigint) as "1,234.56" without ever passing through floating point. */
export function formatMinor(value: string | number | bigint | undefined): string {
  const minor = BigInt(value ?? 0)
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${whole}.${(abs % 100n).toString().padStart(2, '0')}`
}

/** A bill reminder is moot once its cycle was paid or skipped, the bill moved on, paused or was deleted. */
async function billReminderSuperseded(prisma: PrismaClient, payload: { recurringItemId?: string; dueDate?: string }): Promise<boolean> {
  if (!payload.recurringItemId || !payload.dueDate) return false
  const item = await prisma.recurringItem.findUnique({ where: { id: payload.recurringItemId }, select: { status: true, nextDueDate: true } })
  if (!item || item.status !== 'active' || item.nextDueDate.toISOString().slice(0, 10) !== payload.dueDate) return true
  return (await prisma.recurringOccurrence.count({ where: { recurringItemId: payload.recurringItemId, dueDate: new Date(`${payload.dueDate}T00:00:00Z`) } })) > 0
}

export async function deliverNotificationOutbox(prisma: PrismaClient, provider: EmailProvider, limit = 25): Promise<number> {
  let delivered = 0
  for (let index = 0; index < limit; index += 1) {
    const candidate = await prisma.notificationOutbox.findFirst({ where: { status: { in: ['pending', 'failed'] }, availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' } })
    if (!candidate) break
    const claimed = await prisma.notificationOutbox.updateMany({ where: { id: candidate.id, status: candidate.status }, data: { status: 'sending', attemptCount: { increment: 1 } } })
    if (claimed.count === 0) continue
    try {
      // Stage 7A: suppress reminders for cycles the user has already settled. Uses the existing 'sent' status
      // with no sentAt (an additive enum value would break older binaries that read these rows).
      if (candidate.kind === 'bill_due' && await billReminderSuperseded(prisma, candidate.payload as { recurringItemId?: string; dueDate?: string })) {
        await prisma.notificationOutbox.update({ where: { id: candidate.id }, data: { status: 'sent', sentAt: null, lastError: 'suppressed: this bill cycle was already paid, skipped or changed' } })
        continue
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: candidate.userId }, select: { email: true } })
      const payload = candidate.payload as { merchant?: string; amountMinor?: string | number; dueDate?: string; from?: string; to?: string; incomeMinor?: string | number; expenseMinor?: string | number }
      const isSummary = candidate.kind === 'weekly_summary'
      await provider.send({ to: user.email, subject: isSummary ? 'Monikey weekly summary' : 'Monikey bill reminder', text: isSummary ? `Weekly summary (${payload.from} to ${payload.to}): income ${formatMinor(payload.incomeMinor)}, expenses ${formatMinor(payload.expenseMinor)}.` : `${payload.merchant ?? 'A recurring bill'} of ${formatMinor(payload.amountMinor)} is due on ${payload.dueDate ?? 'an upcoming date'}.` })
      await prisma.notificationOutbox.update({ where: { id: candidate.id }, data: { status: 'sent', sentAt: new Date(), lastError: null } })
      delivered += 1
    } catch (error) {
      const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 2 ** Math.min(candidate.attemptCount, 6) * 1_000))
      await prisma.notificationOutbox.update({ where: { id: candidate.id }, data: { status: 'failed', availableAt: retryAt, lastError: error instanceof Error ? error.message : 'Notification delivery failed' } })
    }
  }
  return delivered
}
