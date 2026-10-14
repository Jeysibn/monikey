import { useCallback, useEffect, useRef, useState } from 'react'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { monthBounds, periodForMonth, type BudgetPeriodView, type MonthKey } from './planningModel'

type PeriodDto = { id: string; periodStart: string; periodEnd: string; allocations: { categoryId: string; allocatedMinor: string; spentMinor: string }[] }

export type BudgetsState =
  | { status: 'loading'; periods: null; refreshError: null }
  | { status: 'error'; periods: null; refreshError: string }
  | { status: 'ready'; periods: BudgetPeriodView[]; /** Set when a reload failed but the last good data is still shown. */ refreshError: string | null }

const day = (iso: string) => iso.slice(0, 10)
const toView = (p: PeriodDto): BudgetPeriodView => ({ id: p.id, periodStart: day(p.periodStart), periodEnd: day(p.periodEnd), allocations: p.allocations.map((a) => ({ categoryId: a.categoryId, allocatedMinor: BigInt(a.allocatedMinor), spentMinor: BigInt(a.spentMinor) })) })

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', ...init, headers: { ...(init?.body !== undefined && { 'Content-Type': 'application/json' }) } })
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
    throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Request failed (${response.status})`, payload?.error?.field)
  }
  return response.json() as Promise<T>
}

export type SaveOutcome =
  | { ok: true; refreshed: boolean }
  | { ok: false; message: string }

/**
 * Backend budget periods plus the one write Planning needs. Server-computed `spentMinor` is used as-is (cleared expenses,
 * reversal pairs excluded, inclusive end date); nothing is recomputed on the client. The period is created only when the month
 * has none, because re-posting an existing period would reset its income pool.
 */
export function usePlanningBudgets(enabled: boolean, refreshKey: string) {
  const [state, setState] = useState<BudgetsState>({ status: 'loading', periods: null, refreshError: null })
  const cacheRef = useRef<BudgetPeriodView[] | null>(null)

  const load = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    try {
      const periods = (await api<PeriodDto[]>('/budgets', { signal })).map(toView)
      cacheRef.current = periods
      setState({ status: 'ready', periods, refreshError: null })
      return true
    } catch (error) {
      if (signal?.aborted) return false
      const message = error instanceof Error ? error.message : 'Request failed'
      setState(cacheRef.current ? { status: 'ready', periods: cacheRef.current, refreshError: message } : { status: 'error', periods: null, refreshError: message })
      return false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [enabled, load, refreshKey])

  const save = useCallback(async (month: MonthKey, categoryId: string, allocatedMinor: bigint): Promise<SaveOutcome> => {
    try {
      let period = cacheRef.current ? periodForMonth(cacheRef.current, month) : null
      if (!period) {
        const { start, end } = monthBounds(month)
        const created = await api<PeriodDto>('/budgets', { method: 'POST', body: JSON.stringify({ periodStart: start, periodEnd: end, incomePoolMinor: '0' }) })
        period = toView(created)
      }
      await api(`/budgets/${period.id}/allocations`, { method: 'POST', body: JSON.stringify({ categoryId, allocatedMinor: allocatedMinor.toString() }) })
    } catch (error) {
      return { ok: false, message: error instanceof TypeError ? 'Could not reach the server. Your amount is still in the box. Try again.' : error instanceof Error ? error.message : 'Could not save the budget.' }
    }
    // The write is confirmed from here on; a failed reload must not look like a failed save.
    return { ok: true, refreshed: await load() }
  }, [load])

  return { budgets: state, reload: load, save }
}
