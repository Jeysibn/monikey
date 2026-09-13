import type { AddTransactionInput } from '../domain/finance'
import type { FinanceGateway } from './apiFinanceGateway'
import { localFirstStore, type SyncOutboxOperation } from './localFirstStore'

export interface OutboxSyncResult {
  synced: number
  failed: number
  conflicts: number
}

function dependencyReady(operation: SyncOutboxOperation, operations: SyncOutboxOperation[]): boolean {
  return operation.dependencyIds.every((dependencyId) => operations.some((candidate) => candidate.operationId === dependencyId && candidate.status === 'synced'))
}

/** Replay offline intentions through the same authoritative gateway used online. */
export async function syncPendingOutbox(gateway: FinanceGateway): Promise<OutboxSyncResult> {
  const operations = (await localFirstStore.outbox()).filter((operation) => operation.status === 'pending' || operation.status === 'failed')
  let synced = 0
  let failed = 0
  let conflicts = 0
  for (const operation of operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!dependencyReady(operation, await localFirstStore.outbox())) continue
    if (operation.operationType !== 'create_transaction') {
      await localFirstStore.updateOperation({ ...operation, status: 'failed', attemptCount: operation.attemptCount + 1, lastError: 'Operation type is not enabled for V1 replay.' })
      failed++
      continue
    }
    const syncing = { ...operation, status: 'syncing' as const, attemptCount: operation.attemptCount + 1 }
    await localFirstStore.updateOperation(syncing)
    try {
      await gateway.addTransaction(operation.payload as AddTransactionInput)
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
