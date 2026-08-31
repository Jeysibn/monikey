import type { PrismaClient } from '@prisma/client'
import type { EmailProvider } from './email.js'

export async function deliverNotificationOutbox(prisma: PrismaClient, provider: EmailProvider, limit = 25): Promise<number> {
  let delivered = 0
  for (let index = 0; index < limit; index += 1) {
    const candidate = await prisma.notificationOutbox.findFirst({ where: { status: { in: ['pending', 'failed'] }, availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' } })
    if (!candidate) break
    const claimed = await prisma.notificationOutbox.updateMany({ where: { id: candidate.id, status: candidate.status }, data: { status: 'sending', attemptCount: { increment: 1 } } })
    if (claimed.count === 0) continue
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: candidate.userId }, select: { email: true } })
      const payload = candidate.payload as { merchant?: string; amountMinor?: number; dueDate?: string; from?: string; to?: string; incomeMinor?: number; expenseMinor?: number }
      const isSummary = candidate.kind === 'weekly_summary'
      await provider.send({ to: user.email, subject: isSummary ? 'Monikey weekly summary' : 'Monikey bill reminder', text: isSummary ? `Weekly summary (${payload.from} to ${payload.to}): income ${((payload.incomeMinor ?? 0) / 100).toFixed(2)}, expenses ${((payload.expenseMinor ?? 0) / 100).toFixed(2)}.` : `${payload.merchant ?? 'A recurring bill'} of ${((payload.amountMinor ?? 0) / 100).toFixed(2)} is due on ${payload.dueDate ?? 'an upcoming date'}.` })
      await prisma.notificationOutbox.update({ where: { id: candidate.id }, data: { status: 'sent', sentAt: new Date(), lastError: null } })
      delivered += 1
    } catch (error) {
      const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 2 ** Math.min(candidate.attemptCount, 6) * 1_000))
      await prisma.notificationOutbox.update({ where: { id: candidate.id }, data: { status: 'failed', availableAt: retryAt, lastError: error instanceof Error ? error.message : 'Notification delivery failed' } })
    }
  }
  return delivered
}
