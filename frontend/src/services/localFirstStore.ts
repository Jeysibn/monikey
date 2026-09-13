export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'

export interface SyncOutboxOperation {
  operationId: string
  idempotencyKey: string
  operationType: 'create_transaction' | 'crypto_activity' | 'capture_receipt' | 'attach_receipt'
  payload: unknown
  createdAt: string
  status: OutboxStatus
  attemptCount: number
  lastError: string | null
  dependencyIds: string[]
}

export interface LocalFinanceSnapshot {
  key: 'latest'
  value: unknown
  syncedAt: string
}

const DB_NAME = 'monikey-local-first'
const DB_VERSION = 1
const STORES = ['snapshots', 'outbox', 'receiptFiles', 'receiptMetadata', 'ocrJobs'] as const

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Could not open local Monikey storage'))
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === 'snapshots' ? 'key' : 'operationId' })
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function put<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(value)
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage write failed'))
    transaction.oncomplete = () => resolve()
  })
  db.close()
}

async function get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
    request.onerror = () => reject(request.error ?? new Error('Local storage read failed'))
    request.onsuccess = () => resolve(request.result as T | undefined)
  })
  db.close()
  return value
}

async function all<T>(storeName: string): Promise<T[]> {
  const db = await openDb()
  const value = await new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onerror = () => reject(request.error ?? new Error('Local storage read failed'))
    request.onsuccess = () => resolve(request.result as T[])
  })
  db.close()
  return value
}

async function remove(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(key)
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage delete failed'))
    transaction.oncomplete = () => resolve()
  })
  db.close()
}

export const localFirstStore = {
  saveSnapshot(snapshot: LocalFinanceSnapshot): Promise<void> { return put('snapshots', snapshot) },
  latestSnapshot(): Promise<LocalFinanceSnapshot | undefined> { return get('snapshots', 'latest') },
  enqueue(operation: SyncOutboxOperation): Promise<void> { return put('outbox', operation) },
  outbox(): Promise<SyncOutboxOperation[]> { return all('outbox') },
  updateOperation(operation: SyncOutboxOperation): Promise<void> { return put('outbox', operation) },
  removeOperation(operationId: string): Promise<void> { return remove('outbox', operationId) },
  saveReceiptFile(value: { operationId: string; blob: Blob }): Promise<void> { return put('receiptFiles', value) },
  receiptFile(operationId: string): Promise<{ operationId: string; blob: Blob } | undefined> { return get('receiptFiles', operationId) },
}

export function newOperationId(): string {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
