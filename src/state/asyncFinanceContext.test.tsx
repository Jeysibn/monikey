import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FinanceState, Transaction } from '../domain/finance'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import { AsyncFinanceProvider, useAsyncFinance } from './asyncFinanceContext'

const state: FinanceState = { accounts: [], creditCards: [], categories: [], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [] }
const transaction: Transaction = { id: 'tx-1', type: 'income', title: 'Pay', date: '2026-08-31', amount: 10, source: 'manual', status: 'cleared' }
const gateway = (load: FinanceGateway['load']): FinanceGateway => ({ load, addTransaction: vi.fn().mockResolvedValue(transaction), addManualAccount: vi.fn(), addManualCreditCard: vi.fn() })
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
