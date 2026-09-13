import { describe, expect, it, vi } from 'vitest'
import { LedgerService } from '../../src/modules/ledger/ledger.service.js'

/**
 * Cash-linked crypto deletion depends on reverseTransactionWithCallback
 * running the ledger reversal and the caller's own cleanup inside ONE
 * Prisma transaction. These tests fake `$transaction` the way Prisma's real
 * implementation behaves (run the callback, propagate a thrown error as a
 * rejection) so we can prove the contract without a live database.
 */
function fakePrismaTransaction() {
  const tx = { marker: 'fake-tx' }
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  }
  return { prisma, tx }
}

describe('LedgerService.reverseTransactionWithCallback', () => {
  it('runs the reversal and the caller callback inside the same transaction', async () => {
    const { prisma, tx } = fakePrismaTransaction()
    const reverseTransaction = vi.fn(async () => ({ id: 'reversal-1' }))
    const repo = { reverseTransaction } as any
    const service = new LedgerService(prisma as any, repo)

    const callback = vi.fn(async (calledTx: unknown) => {
      expect(calledTx).toBe(tx)
    })

    const result = await service.reverseTransactionWithCallback('user-1', 'txn-1', {}, callback)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(reverseTransaction).toHaveBeenCalledWith(tx, 'user-1', 'txn-1', undefined)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(result).toBeUndefined()
  })

  it('propagates a callback failure so the whole transaction rolls back (cash reversal is not left standing alone)', async () => {
    const { prisma } = fakePrismaTransaction()
    const reverseTransaction = vi.fn(async () => ({ id: 'reversal-1' }))
    const repo = { reverseTransaction } as any
    const service = new LedgerService(prisma as any, repo)

    const boom = new Error('crypto trade delete failed')
    const callback = vi.fn(async () => {
      throw boom
    })

    await expect(service.reverseTransactionWithCallback('user-1', 'txn-1', {}, callback)).rejects.toBe(boom)
    // The reversal ran (inside the transaction) but the whole $transaction
    // call rejected, which is what makes Prisma roll back everything it did
    // in that callback — including the reversal's own writes.
    expect(reverseTransaction).toHaveBeenCalledTimes(1)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('never calls the caller-supplied cleanup if the reversal itself throws first', async () => {
    const { prisma } = fakePrismaTransaction()
    const reversalError = new Error('reversal failed')
    const reverseTransaction = vi.fn(async () => {
      throw reversalError
    })
    const repo = { reverseTransaction } as any
    const service = new LedgerService(prisma as any, repo)
    const callback = vi.fn(async () => {})

    await expect(service.reverseTransactionWithCallback('user-1', 'txn-1', {}, callback)).rejects.toBe(reversalError)
    expect(callback).not.toHaveBeenCalled()
  })
})
