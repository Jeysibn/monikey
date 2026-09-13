import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export async function enqueueJob(prisma: PrismaClient, input: { type: string; runAt: Date; dedupKey?: string; maxAttempts?: number }) {
  if (input.dedupKey) {
    return prisma.workerJob.upsert({ where: { dedupKey: input.dedupKey }, update: {}, create: { type: input.type, runAt: input.runAt, dedupKey: input.dedupKey, maxAttempts: input.maxAttempts ?? 5 } })
  }
  return prisma.workerJob.create({ data: { type: input.type, runAt: input.runAt, maxAttempts: input.maxAttempts ?? 5 } })
}

export async function claimDueJob(prisma: PrismaClient, workerId = randomUUID()) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE worker_jobs SET status = 'running', locked_at = NOW(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = NOW()
    WHERE id = (SELECT id FROM worker_jobs WHERE (status = 'pending' OR (status = 'running' AND locked_at < NOW() - INTERVAL '10 minutes')) AND run_at <= NOW() AND attempts < max_attempts ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`
  return rows[0]?.id ?? null
}

export async function finishJob(prisma: PrismaClient, id: string) { await prisma.workerJob.update({ where: { id }, data: { status: 'succeeded', lockedAt: null } }) }
export async function failJob(prisma: PrismaClient, id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  await prisma.$executeRaw`UPDATE worker_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END, run_at = CASE WHEN attempts >= max_attempts THEN run_at ELSE NOW() + (POWER(2, attempts) * INTERVAL '1 minute') END, locked_at = NULL, last_error = ${message}, updated_at = NOW() WHERE id = ${id}::uuid`
}
