import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FinanceState, Transaction } from '../domain/finance'
import type { FinanceGateway } from '../services/apiFinanceGateway'
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
  setFavorites: vi.fn().mockResolvedValue(undefined),
  createGoal: vi.fn(),
  addGoalFunds: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  createBudgetPeriod: vi.fn(),
  setBudgetAllocation: vi.fn().mockResolvedValue({ id: 'food', allocated: 100, spent: 0 }),
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  setCategoryBudget: vi.fn(),
  deleteCategory: vi.fn(),
})
const wrapper = (value: FinanceGateway) => ({ children }: { children: ReactNode }) => <AsyncFinanceProvider gateway={value}>{children}</AsyncFinanceProvider>

describe('AsyncFinanceProvider', () => {
  it('exposes loading then ready state and supports async mutations', async () => {
    const load = vi.fn().mockResolvedValue(state)
    const result = renderHook(() => useAsyncFinance(), { wrapper: wrapper(gateway(load)) })
    expect(result.result.current.status).toBe('loading')
    await waitFor(() => expect(result.result.current.status).toBe('ready'))
    await act(async () => { await result.result.current.addTransaction({ type: 'income', title: 'Pay', accountId: 'a', date: '2026-08-31', amount: 10 }) })
    expect(result.result.current.state?.transactions).toEqual([transaction])
  })

  it('applies a saved favorite selection only after the server accepts it', async () => {
    const withAccounts: FinanceState = { ...state, accounts: [{ id: 'a1', name: 'A', type: 'checking', classification: 'asset', balance: 0, syncStatus: 'manual' }] }
    const gw = gateway(vi.fn().mockResolvedValue(withAccounts))
    const result = renderHook(() => useAsyncFinance(), { wrapper: wrapper(gw) })
    await waitFor(() => expect(result.result.current.status).toBe('ready'))
    ;(gw.setFavorites as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'))
    await act(async () => { await expect(result.result.current.setFavorites(['a1'])).rejects.toThrow('nope') })
    expect(result.result.current.state?.favoritesConfigured).toBeFalsy()
    await act(async () => { await result.result.current.setFavorites(['a1']) })
    expect(result.result.current.state?.favoritesConfigured).toBe(true)
    expect(result.result.current.state?.accounts[0]?.favoriteRank).toBe(1)
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
