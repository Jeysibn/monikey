import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { AsyncFinanceProvider } from '../state/asyncFinanceContext'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { BackendFinanceGate } from './BackendFinanceGate'

const financeState = { accounts: [], creditCards: [], categories: [], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [] }
const gateway = (load: FinanceGateway['load']): FinanceGateway => ({ load, addTransaction: vi.fn(), addManualAccount: vi.fn(), addManualCreditCard: vi.fn(), createGoal: vi.fn(), addGoalFunds: vi.fn(), createBudgetPeriod: vi.fn(), setBudgetAllocation: vi.fn(), addBudgetCategory: vi.fn() })
const wrapper = (value: FinanceGateway) => ({ children }: { children: ReactNode }) => <AsyncFinanceProvider gateway={value}><BackendFinanceGate>{children}</BackendFinanceGate></AsyncFinanceProvider>

describe('BackendFinanceGate', () => {
  it('presents accessible registration and retries bootstrap after the real auth request succeeds', async () => {
    const load = vi.fn().mockRejectedValueOnce(new FinanceApiError(401, 'UNAUTHORIZED', 'Authentication required.')).mockResolvedValueOnce(financeState)
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }))
    render(<p>Finances ready</p>, { wrapper: wrapper(gateway(load)) })

    await screen.findByRole('heading', { name: 'Create your account' })
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(screen.getByText('Finances ready')).toBeDefined())
    expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/register', expect.objectContaining({ credentials: 'include', method: 'POST' }))
    fetcher.mockRestore()
  })
})
