import type { AddTransactionInput } from '../domain/finance'
import type { FinanceGateway } from './apiFinanceGateway'
import { localFirstStore, type SyncOutboxOperation } from './localFirstStore'

export interface CryptoReplayGateway { post<T>(path: string, body: unknown): Promise<T> }
export interface ReceiptReplayGateway { upload(file: File): Promise<unknown> }

export interface OutboxSyncResult {
  synced: number
  failed: number
  conflicts: number
}

function dependencyReady(operation: SyncOutboxOperation, operations: SyncOutboxOperation[]): boolean {
  return operation.dependencyIds.every((dependencyId) => operations.some((candidate) => candidate.operationId === dependencyId && candidate.status === 'synced'))
}

/** Replay offline intentions through the same authoritative gateway used online. */
export async function syncPendingOutbox(gateway: FinanceGateway, cryptoGateway?: CryptoReplayGateway, receiptGateway?: ReceiptReplayGateway): Promise<OutboxSyncResult> {
  const operations = (await localFirstStore.outbox()).filter((operation) => operation.status === 'pending' || operation.status === 'failed')
  let synced = 0
  let failed = 0
  let conflicts = 0
  for (const operation of operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!dependencyReady(operation, await localFirstStore.outbox())) continue
    if (operation.operationType !== 'create_transaction' && operation.operationType !== 'crypto_activity' && operation.operationType !== 'capture_receipt') {
      await localFirstStore.updateOperation({ ...operation, status: 'failed', attemptCount: operation.attemptCount + 1, lastError: 'Operation type is not enabled for V1 replay.' })
      failed++
      continue
    }
    const syncing = { ...operation, status: 'syncing' as const, attemptCount: operation.attemptCount + 1 }
    await localFirstStore.updateOperation(syncing)
    try {
      if (operation.operationType === 'crypto_activity') {
        if (!cryptoGateway) throw new Error('Crypto gateway is not available for replay.')
        const cryptoPayload = operation.payload as { path: string; body: unknown }
        await cryptoGateway.post(cryptoPayload.path, cryptoPayload.body)
      } else if (operation.operationType === 'capture_receipt') {
        if (!receiptGateway) throw new Error('Receipt gateway is not available for replay.')
        const receiptPayload = operation.payload as { operationId: string; filename: string; mimeType: string }
        const stored = await localFirstStore.receiptFile(receiptPayload.operationId)
        if (!stored) throw new Error('Local receipt image is missing.')
        await receiptGateway.upload(new File([stored.blob], receiptPayload.filename, { type: receiptPayload.mimeType }))
      } else await gateway.addTransaction(operation.payload as AddTransactionInput)
      await localFirstStore.updateOperation({ ...syncing, status: 'synced', lastError: null })
      synced++
    } catch (error) {
      const isConflict = error instanceof Error && /conflict|duplicate|idempotency/i.test(error.message)
      await localFirstStore.updateOperation({ ...syncing, status: isConflict ? 'conflict' : 'failed', lastError: error instanceof Error ? error.message : 'Replay failed' })
      if (isConflict) conflicts++
      else failed++
    }
  }
  return { synced, failed, conflicts }
}
