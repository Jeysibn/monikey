import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FinanceState, Transaction } from '../domain/finance'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import type { InvestmentGateway, Portfolio } from '../services/apiInvestmentGateway'
import { AsyncFinanceProvider, useAsyncFinance } from './asyncFinanceContext'

const state: FinanceState = { accounts: [], creditCards: [], categories: [], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [] }
const transaction: Transaction = { id: 'tx-1', type: 'income', title: 'Pay', date: '2026-08-31', amount: 10, source: 'manual', status: 'cleared' }
const gateway = (load: FinanceGateway['load']): FinanceGateway => ({
  load,
  addTransaction: vi.fn().mockResolvedValue(transaction),
  updateTransaction: vi.fn(),
  reverseTransaction: vi.fn(),
  addManualAccount: vi.fn(),
  addManualCreditCard: vi.fn(),
  updateAccount: vi.fn(),
  updateCreditCard: vi.fn(),
  archiveAccount: vi.fn(),
  archiveCreditCard: vi.fn(),
  createGoal: vi.fn(),
  addGoalFunds: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  createBudgetPeriod: vi.fn(),
  setBudgetAllocation: vi.fn().mockResolvedValue({ id: 'food', allocated: 100, spent: 0 }),
  addBudgetCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
})
const wrapper = (value: FinanceGateway) => ({ children }: { children: ReactNode }) => <AsyncFinanceProvider gateway={value}>{children}</AsyncFinanceProvider>

const portfolio: Portfolio = {
  baseCurrency: 'PHP',
  summary: { portfolioValueMinor: 100, remainingCostBasisMinor: 80, realizedPnlMinor: 0, unrealizedPnlMinor: 20, dividendsMinor: 0, feesMinor: 0, totalReturnMinor: 20, totalReturnPct: 25, todaysChangeMinor: null, todaysChangePct: null, baseValuationUnavailable: false },
  holdings: [],
  closedPositions: [],
  trades: [],
  dividends: [],
}
const investmentGateway = (getPortfolio: InvestmentGateway['getPortfolio']): InvestmentGateway => ({
  getPortfolio,
  addTrade: vi.fn(),
  updateTrade: vi.fn(),
  deleteTrade: vi.fn(),
  addDividend: vi.fn(),
  refreshQuotes: vi.fn(),
})

describe('AsyncFinanceProvider investment portfolio', () => {
  // Regression test: a failed portfolio fetch used to be swallowed silently
  // (empty `catch {}`), leaving `investmentPortfolio` at `null` forever with
  // no way for a consumer to tell "no backend" apart from "backend errored".
  it('surfaces a failed portfolio fetch via investmentPortfolioError instead of swallowing it', async () => {
    const load = vi.fn().mockResolvedValue(state)
    const getPortfolio = vi.fn().mockRejectedValueOnce(new Error('portfolio service unreachable'))
    const result = renderHook(() => useAsyncFinance(), {
      wrapper: ({ children }) => <AsyncFinanceProvider gateway={gateway(load)} investmentGateway={investmentGateway(getPortfolio)}>{children}</AsyncFinanceProvider>,
    })
    await waitFor(() => expect(result.result.current.investmentPortfolioError?.message).toBe('portfolio service unreachable'))
    expect(result.result.current.investmentPortfolio).toBeNull()
  })

  it('clears investmentPortfolioError once retryInvestmentPortfolio succeeds', async () => {
    const load = vi.fn().mockResolvedValue(state)
    const getPortfolio = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(portfolio)
    const result = renderHook(() => useAsyncFinance(), {
      wrapper: ({ children }) => <AsyncFinanceProvider gateway={gateway(load)} investmentGateway={investmentGateway(getPortfolio)}>{children}</AsyncFinanceProvider>,
    })
    await waitFor(() => expect(result.result.current.investmentPortfolioError).not.toBeNull())
    act(() => result.result.current.retryInvestmentPortfolio())
    await waitFor(() => expect(result.result.current.investmentPortfolio).toEqual(portfolio))
    expect(result.result.current.investmentPortfolioError).toBeNull()
  })

  it('keeps the last-known-good portfolio snapshot when a later refresh fails', async () => {
    const load = vi.fn().mockResolvedValue(state)
    const getPortfolio = vi.fn().mockResolvedValueOnce(portfolio).mockRejectedValueOnce(new Error('timeout'))
    const result = renderHook(() => useAsyncFinance(), {
      wrapper: ({ children }) => <AsyncFinanceProvider gateway={gateway(load)} investmentGateway={investmentGateway(getPortfolio)}>{children}</AsyncFinanceProvider>,
    })
    await waitFor(() => expect(result.result.current.investmentPortfolio).toEqual(portfolio))
    act(() => result.result.current.retryInvestmentPortfolio())
    await waitFor(() => expect(result.result.current.investmentPortfolioError?.message).toBe('timeout'))
    // Stale, but not discarded — the UI can still show the last-known value
    // alongside the error banner instead of blanking out.
    expect(result.result.current.investmentPortfolio).toEqual(portfolio)
  })
})

describe('AsyncFinanceProvider', () => {
  it('exposes loading then ready state and supports async mutations', async () => {
    const load = vi.fn().mockResolvedValue(state)
    const result = renderHook(() => useAsyncFinance(), { wrapper: wrapper(gateway(load)) })
    expect(result.result.current.status).toBe('loading')
    await waitFor(() => expect(result.result.current.status).toBe('ready'))
    await act(async () => { await result.result.current.addTransaction({ type: 'income', title: 'Pay', accountId: 'a', date: '2026-08-31', amount: 10 }) })
    expect(result.result.current.state?.transactions).toEqual([transaction])
  })

  it('exposes an error and retries the load on demand', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(state)
    const result = renderHook(() => useAsyncFinance(), { wrapper: wrapper(gateway(load)) })
    await waitFor(() => expect(result.result.current.status).toBe('error'))
    expect(result.result.current.error?.message).toBe('offline')
    act(() => result.result.current.retry())
    await waitFor(() => expect(result.result.current.status).toBe('ready'))
    expect(load).toHaveBeenCalledTimes(2)
  })
})
