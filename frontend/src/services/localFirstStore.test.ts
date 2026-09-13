import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { localFirstStore } from './localFirstStore'

function clearDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('monikey-local-first')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
  })
}

afterEach(async () => { await clearDatabase() })

describe('local-first IndexedDB persistence', () => {
  it('persists a finance snapshot and pending outbox operation across store calls', async () => {
    await localFirstStore.saveSnapshot({ key: 'latest', value: { accounts: [{ id: 'account-1', balance: '50000' }] }, syncedAt: '2026-09-13T08:00:00.000Z' })
    await localFirstStore.enqueue({ operationId: 'operation-1', idempotencyKey: 'idem-1', operationType: 'create_transaction', payload: { title: 'Offline lunch' }, createdAt: '2026-09-13T08:01:00.000Z', status: 'pending', attemptCount: 0, lastError: null, dependencyIds: [] })

    const snapshot = await localFirstStore.latestSnapshot()
    const operations = await localFirstStore.outbox()
    expect(snapshot?.value).toEqual({ accounts: [{ id: 'account-1', balance: '50000' }] })
    expect(operations).toEqual([expect.objectContaining({ operationId: 'operation-1', status: 'pending', idempotencyKey: 'idem-1' })])
  })
})
