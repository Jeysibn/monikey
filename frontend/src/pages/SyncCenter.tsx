import { useCallback, useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/Card'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { localFirstStore, type SyncOutboxOperation } from '../services/localFirstStore'

export function SyncCenter() {
  const asyncFinance = useAsyncFinanceOptional()
  const offline = asyncFinance?.offline ?? false
  const [operations, setOperations] = useState<SyncOutboxOperation[]>([])
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null)
  const refresh = useCallback(() => {
    void Promise.all([localFirstStore.outbox(), localFirstStore.latestSnapshot()]).then(([next, snapshot]) => {
      setOperations(next.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setSnapshotDate(snapshot?.syncedAt ?? null)
    })
  }, [])
  useEffect(() => { refresh() }, [refresh])
  const pending = operations.filter((operation) => operation.status === 'pending' || operation.status === 'syncing').length
  const failed = operations.filter((operation) => operation.status === 'failed' || operation.status === 'conflict').length
  const retryOperation = (operation: SyncOutboxOperation) => {
    void localFirstStore.updateOperation({ ...operation, status: 'pending', lastError: null }).then(() => { refresh(); asyncFinance?.retry() })
  }
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">LOCAL-FIRST</p><h1>Sync Center</h1><p className="muted">PostgreSQL remains authoritative. Local data is a fallback and pending intentions are replayed through normal finance mutations.</p></div><button className="btn btn--ghost" type="button" onClick={() => { asyncFinance?.retry(); refresh() }}>Retry sync</button></div>
    <Card><CardTitle>Connection</CardTitle><p role="status">{offline ? 'Server unreachable — using the latest local snapshot.' : 'Connected to Monikey'}</p><p className="muted">Last synced: {snapshotDate ? new Date(snapshotDate).toLocaleString() : 'Not available'}</p></Card>
    <Card><CardTitle>Pending operations</CardTitle><p>{pending} waiting · {failed} needing attention</p>{operations.length === 0 ? <p className="muted">No local operations.</p> : <ul>{operations.map((operation) => <li key={operation.operationId}>{operation.operationType.replaceAll('_', ' ')} · <strong>{operation.status}</strong>{operation.lastError ? ` · ${operation.lastError}` : ''}{(operation.status === 'failed' || operation.status === 'conflict') && <button type="button" className="crypto-text-action" onClick={() => retryOperation(operation)}>Retry</button>}</li>)}</ul>}</Card>
    <Card><CardTitle>Receipt OCR</CardTitle><p className="muted">Receipt images can be stored locally and processed in a browser worker. OCR results are suggestions only and require review before ledger entry.</p></Card>
  </div>
}
