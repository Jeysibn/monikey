import { describe, expect, it, vi } from 'vitest'
import { claimDueJob, enqueueJob, failJob, finishJob } from '../../src/modules/worker/jobs.js'

describe('durable worker jobs', () => {
  it('uses a deduplication key to make scheduling idempotent', async () => {
    const prisma = { workerJob: { upsert: vi.fn().mockResolvedValue({ id: 'job-1' }) } } as any
    await enqueueJob(prisma, { type: 'daily', runAt: new Date('2026-09-12T00:00:00Z'), dedupKey: 'daily:2026-09-12' })
    expect(prisma.workerJob.upsert).toHaveBeenCalledOnce()
    expect(prisma.workerJob.upsert.mock.calls[0][0].where).toEqual({ dedupKey: 'daily:2026-09-12' })
  })

  it('claims with a database lock and returns no job when none is due', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) } as any
    await expect(claimDueJob(prisma)).resolves.toBeNull()
    expect(prisma.$queryRaw).toHaveBeenCalledOnce()
  })

  it('finishes jobs and records retry/dead failures', async () => {
    const prisma = { workerJob: { update: vi.fn() }, $executeRaw: vi.fn() } as any
    await finishJob(prisma, '00000000-0000-4000-8000-000000000001')
    await failJob(prisma, '00000000-0000-4000-8000-000000000001', new Error('provider unavailable'))
    expect(prisma.workerJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'succeeded' }) }))
    expect(prisma.$executeRaw).toHaveBeenCalledOnce()
  })
})
