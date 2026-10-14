import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FinanceState, Transaction } from '../domain/finance'
import { mapApiTransaction, type ApiTransaction } from '../services/apiFinanceGateway'
import { filterLocal, isReversalPart, serverQuery, type ActivityFilters } from './activityModel'
import { backendMode } from './useOverviewReports'

export interface ActivityFeed {
  rows: Transaction[]
  status: 'loading' | 'ready' | 'error'
  loadingMore: boolean
  moreError: boolean
  hasMore: boolean
  loadMore: () => void
  retry: () => void
}

type Page = { items: ApiTransaction[]; nextCursor: string | null; hasMore: boolean }
const PAGE = 50

async function fetchPage(query: string, signal?: AbortSignal): Promise<Page> {
  const response = await fetch(`/api/v1/transactions?${query}`, { credentials: 'include', signal })
  if (!response.ok) throw new Error(`transactions responded ${response.status}`)
  return response.json() as Promise<Page>
}

/**
 * Activity rows for the current filters.
 * Backend mode pages the server (cursor, 50 per page) so histories beyond the 1,000-row bootstrap cap are reachable.
 * Mock mode filters the in-memory state with identical semantics and pages locally.
 * `refreshKey` should change after a mutation so the first page is re-read.
 */
export function useActivityFeed(state: FinanceState, filters: ActivityFilters, refreshKey: unknown): ActivityFeed {
  const remoteEnabled = backendMode()
  const key = serverQuery(filters)
  const [attempt, setAttempt] = useState(0)
  const [remote, setRemote] = useState<{ key: string; rows: Transaction[]; next: string | null; status: 'loading' | 'ready' | 'error' } | null>(null)
  const [more, setMore] = useState<{ loading: boolean; error: boolean }>({ loading: false, error: false })
  const [localLimit, setLocalLimit] = useState(PAGE)

  useEffect(() => {
    if (!remoteEnabled) return
    const controller = new AbortController()
    fetchPage(key, controller.signal)
      .then((page) => { setRemote({ key, rows: page.items.map(mapApiTransaction), next: page.nextCursor, status: 'ready' }); setMore({ loading: false, error: false }) })
      .catch(() => { if (!controller.signal.aborted) setRemote({ key, rows: [], next: null, status: 'error' }) })
    return () => controller.abort()
  }, [remoteEnabled, key, attempt, refreshKey])

  const loadMore = useCallback(() => {
    if (!remoteEnabled) { setLocalLimit((n) => n + PAGE); return }
    if (!remote || remote.key !== key || !remote.next || more.loading) return
    const cursor = remote.next
    setMore({ loading: true, error: false })
    fetchPage(serverQuery(filters, cursor))
      .then((page) => {
        setRemote((current) => (current && current.key === key ? { ...current, rows: [...current.rows, ...page.items.map(mapApiTransaction)], next: page.nextCursor } : current))
        setMore({ loading: false, error: false })
      })
      .catch(() => setMore({ loading: false, error: true }))
  }, [remoteEnabled, remote, key, more.loading, filters])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const localRows = useMemo(() => (remoteEnabled ? [] : filterLocal(state, state.transactions, filters)), [remoteEnabled, state, filters])

  if (!remoteEnabled) {
    return { rows: localRows.slice(0, localLimit), status: 'ready', loadingMore: false, moreError: false, hasMore: localRows.length > localLimit, loadMore, retry }
  }
  if (!remote || remote.key !== key) return { rows: [], status: 'loading', loadingMore: false, moreError: false, hasMore: false, loadMore, retry }
  const rows = filters.showReversed ? remote.rows : remote.rows.filter((t) => !isReversalPart(t))
  return { rows, status: remote.status, loadingMore: more.loading, moreError: more.error, hasMore: remote.next !== null, loadMore, retry }
}

/** Single transaction for deep links (`?tx=`) that may not be in the loaded pages. */
export function useTransactionById(state: FinanceState, id: string | null, loaded: Transaction[]): { tx: Transaction | null; status: 'idle' | 'loading' | 'ready' | 'missing' } {
  const local = id ? loaded.find((t) => t.id === id) ?? state.transactions.find((t) => t.id === id) ?? null : null
  const [fetched, setFetched] = useState<{ id: string; tx: Transaction | null } | null>(null)
  const needFetch = backendMode() && Boolean(id) && !local
  useEffect(() => {
    if (!needFetch || !id) return
    const controller = new AbortController()
    fetch(`/api/v1/transactions/${id}`, { credentials: 'include', signal: controller.signal })
      .then((r) => (r.ok ? r.json() as Promise<ApiTransaction> : null))
      .then((body) => setFetched({ id, tx: body ? mapApiTransaction(body) : null }))
      .catch(() => { if (!controller.signal.aborted) setFetched({ id, tx: null }) })
    return () => controller.abort()
  }, [needFetch, id])
  if (!id) return { tx: null, status: 'idle' }
  if (local) return { tx: local, status: 'ready' }
  if (!needFetch) return { tx: null, status: 'missing' }
  if (!fetched || fetched.id !== id) return { tx: null, status: 'loading' }
  return fetched.tx ? { tx: fetched.tx, status: 'ready' } : { tx: null, status: 'missing' }
}
