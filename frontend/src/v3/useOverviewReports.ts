import { useEffect, useMemo, useState } from 'react'
import type { FinanceState, ReportingPeriod } from '../domain/finance'
import { addDaysToIso } from '../utils/date'
import { historyFromTracked, periodFlowMinor, spendingByCategory, type CategorySpend, type HistoryPoint } from './overviewModel'

export const backendMode = () => import.meta.env.VITE_FINANCE_BACKEND === 'true'

export type Remote<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable'; message: string } | { status: 'ready'; data: T }

export interface PeriodReport { spendingMinor: bigint; incomeMinor: bigint; categories: CategorySpend[] }

type SummaryDto = { income: string; expenses: string }
type CategoryDto = { categoryId: string; categoryName: string; spent: string }
type TrackedDto = { date: string; netTrackedPosition: string }

/** Cache entry keyed by request so a stale response is never shown for a newer period. */
function useRemote<T>(key: string, enabled: boolean, load: (signal: AbortSignal) => Promise<T>): Remote<T> | null {
  const [entry, setEntry] = useState<{ key: string; value: Remote<T> } | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    load(controller.signal)
      .then((data) => setEntry({ key, value: { status: 'ready', data } }))
      .catch((error: unknown) => { if (!controller.signal.aborted) setEntry({ key, value: { status: 'error', message: error instanceof Error ? error.message : 'Request failed' } }) })
    return () => controller.abort()
    // `load` is derived from `key`; the key is the single source of truth for re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])
  if (!enabled) return null
  return entry && entry.key === key ? entry.value : { status: 'loading' }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'include', signal })
  if (!response.ok) throw new Error(`${url} responded ${response.status}`)
  return response.json() as Promise<T>
}

/**
 * Income, spending and category breakdown for a period.
 * Backend mode uses the authoritative report endpoints (cleared, reversal pairs excluded, no transaction cap);
 * mock mode derives the same semantics from the in-memory state.
 */
export function usePeriodReport(state: FinanceState, period: ReportingPeriod): Remote<PeriodReport> {
  const enabled = backendMode()
  const from = period.start
  const to = addDaysToIso(period.end, -1)
  const remote = useRemote<PeriodReport>(`report|${from}|${to}`, enabled, async (signal) => {
    const [summary, cats] = await Promise.all([
      getJson<SummaryDto & Record<string, string>>(`/api/v1/reports/summary?view=${viewFor(from, to)}&period=${from.slice(0, 7)}`, signal),
      getJson<CategoryDto[]>(`/api/v1/reports/spending-by-category?from=${from}&to=${to}`, signal),
    ])
    const total = BigInt(summary.expenses)
    const rows: CategorySpend[] = cats.map((c) => {
      const known = state.categories.find((k) => k.id === c.categoryId)
      return { categoryId: c.categoryId, name: known?.name ?? c.categoryName, color: known?.color ?? 'var(--v3-muted)', amountMinor: BigInt(c.spent), sharePct: 0 }
    })
    const categorized = rows.reduce((s, r) => s + r.amountMinor, 0n)
    if (total > categorized) rows.push({ categoryId: '', name: 'Uncategorized', color: 'var(--v3-muted)', amountMinor: total - categorized, sharePct: 0 })
    rows.sort((a, b) => (a.amountMinor === b.amountMinor ? 0 : a.amountMinor > b.amountMinor ? -1 : 1))
    const denominator = rows.reduce((s, r) => s + r.amountMinor, 0n)
    for (const r of rows) r.sharePct = denominator > 0n ? Number((r.amountMinor * 100n + denominator / 2n) / denominator) : 0
    return { spendingMinor: total, incomeMinor: BigInt(summary.income), categories: rows.filter((r) => r.amountMinor > 0n) }
  })
  const local = useMemo<PeriodReport | null>(() => {
    if (enabled) return null
    const flow = periodFlowMinor(state, period)
    return { spendingMinor: flow.spending, incomeMinor: flow.income, categories: spendingByCategory(state, period) }
  }, [enabled, state, period])
  if (remote) return remote
  return { status: 'ready', data: local! }
}

/** The summary endpoint takes a view; map a calendar-aligned period back to it. */
function viewFor(from: string, to: string): 'monthly' | 'quarterly' | 'yearly' {
  const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1
  return months >= 12 ? 'yearly' : months >= 3 ? 'quarterly' : 'monthly'
}

/** Net tracked position history. Only server-computed ledger history is ever shown; demo mode has none. */
export function useNetTrackedHistory(period: ReportingPeriod): Remote<HistoryPoint[]> {
  const enabled = backendMode()
  const from = period.start
  const to = addDaysToIso(period.end, -1)
  const remote = useRemote<HistoryPoint[]>(`history|${from}|${to}`, enabled, async (signal) => {
    const rows = await getJson<TrackedDto[]>(`/api/v1/reports/net-tracked-position?from=${from}&to=${to}`, signal)
    return historyFromTracked(rows)
  })
  return remote ?? { status: 'unavailable', message: 'History is not recorded in demo mode, so no trend is shown. Connect a backend to see net tracked position over time.' }
}

export interface BudgetPerf { allocated: bigint; spent: bigint; rows: { categoryId: string; name: string; allocated: bigint; spent: bigint }[] }
type BudgetDto = { totalAllocated: string; totalSpent: string; categories: { categoryId: string; categoryName: string; allocated: string; spent: string }[] }

/** Budget performance for a calendar month (budgets are monthly). Backend: authoritative endpoint; 404 means no budget. */
export function useBudgetPerformance(periodStart: string): Remote<BudgetPerf | null> | null {
  const enabled = backendMode()
  return useRemote<BudgetPerf | null>(`budget|${periodStart}`, enabled, async (signal) => {
    const response = await fetch(`/api/v1/reports/budget-performance?period=${periodStart.slice(0, 7)}`, { credentials: 'include', signal })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`budget-performance responded ${response.status}`)
    const dto = (await response.json()) as BudgetDto
    return { allocated: BigInt(dto.totalAllocated), spent: BigInt(dto.totalSpent), rows: dto.categories.map((c) => ({ categoryId: c.categoryId, name: c.categoryName, allocated: BigInt(c.allocated), spent: BigInt(c.spent) })) }
  })
}
