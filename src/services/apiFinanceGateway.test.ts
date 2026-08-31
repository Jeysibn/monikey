import { describe, expect, it, vi } from 'vitest'
import { ApiFinanceGateway, FinanceApiError } from './apiFinanceGateway'

const account = (overrides: Record<string, unknown> = {}) => ({
  id: 'account-1', name: 'Checking', institution: 'BPI', accountType: 'checking', classification: 'asset', currentBalanceMinor: 412050, lastFour: '4471', syncStatus: 'manual', manual: true, ...overrides,
})

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ApiFinanceGateway', () => {
  it('maps bootstrap minor units and server enums into the frontend domain', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ financeState: {
      accounts: [account(), account({ id: 'card-1', classification: 'liability', accountType: 'credit_card', currentBalanceMinor: 146000, creditCardDetail: { network: 'visa', creditLimitMinor: 500000, dueDay: 15, minimumPaymentMinor: 7500 } })],
      transactions: [{ id: 'tx-1', type: 'expense', title: 'Cafe', categoryId: 'food', goalId: null, fromAccountId: 'account-1', toAccountId: null, occurredOn: '2026-08-29', occurredTime: '09:14:00', amountMinor: 640, feeMinor: 0, source: 'manual', status: 'cleared', note: null }],
      categories: [{ id: 'food', name: 'Food', color: 'teal', budgetable: true, allowsIncome: false, allowsExpense: true }], budgets: [], goals: [],
    } }))
    const state = await new ApiFinanceGateway('/api/v1', fetcher).load()
    expect(state.accounts[0]).toMatchObject({ id: 'account-1', balance: 4120.5, type: 'checking' })
    expect(state.creditCards[0]).toMatchObject({ id: 'card-1', balance: 1460, limit: 5000, dueDate: '2026-08-15' })
    expect(state.transactions[0]).toMatchObject({ amount: -6.4, accountId: 'account-1', time: '09:14' })
    expect(state.categories[0].transactionKinds).toEqual(['expense'])
    expect(fetcher).toHaveBeenCalledWith('/api/v1/bootstrap', expect.objectContaining({ credentials: 'include' }))
  })

  it('posts positive minor-unit amounts and maps an expense response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ transaction: { id: 'tx-2', type: 'expense', title: 'Lunch', categoryId: 'food', goalId: null, fromAccountId: 'account-1', toAccountId: null, occurredOn: '2026-08-31', occurredTime: null, amountMinor: 1234, feeMinor: 50, source: 'manual', status: 'cleared', note: 'test' } }))
    const result = await new ApiFinanceGateway('/api/v1', fetcher).addTransaction({ type: 'expense', title: 'Lunch', categoryId: 'food', accountId: 'account-1', date: '2026-08-31', amount: 12.34, fee: 0.5 })
    expect(result).toMatchObject({ amount: -12.34, fee: 0.5 })
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ amountMinor: 1234, feeMinor: 50, fromAccountId: 'account-1', toAccountId: null })
  })

  it('surfaces non-success API responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 422))
    await expect(new ApiFinanceGateway('/api/v1', fetcher).addManualAccount({ name: 'Cash', type: 'cash', balance: 0 })).rejects.toMatchObject({ status: 422, code: 'INTERNAL_ERROR' })
  })

  it('preserves the backend error envelope for domain validation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ error: { code: 'ASSET_OVERDRAFT', message: 'Insufficient balance.', field: 'amountMinor' } }, 422))
    const error = await new ApiFinanceGateway('/api/v1', fetcher).addManualAccount({ name: 'Cash', type: 'cash', balance: 0 }).catch((cause) => cause)
    expect(error).toBeInstanceOf(FinanceApiError)
    expect(error).toMatchObject({ status: 422, code: 'ASSET_OVERDRAFT', message: 'Insufficient balance.', field: 'amountMinor' })
  })

  it('uses minor units for budget period and allocation commands', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: 'period-1', periodStart: '2026-08-01', periodEnd: '2026-09-01', incomePoolMinor: 250000, allocations: [] }))
      .mockResolvedValueOnce(response({ id: 'allocation-1', categoryId: 'food', allocatedMinor: 160000 }))
    const api = new ApiFinanceGateway('/api/v1', fetcher)
    await api.createBudgetPeriod('2026-08-01', '2026-09-01', 2500)
    const allocation = await api.setBudgetAllocation('period-1', 'food', 1600)
    expect(allocation).toMatchObject({ id: 'food', allocated: 1600 })
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ incomePoolMinor: 250000 })
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({ allocatedMinor: 160000 })
  })
})
