import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FinanceState, Transaction } from '../domain/finance'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import { FinanceApiError } from '../services/apiFinanceGateway'
import { AsyncFinanceProvider } from '../state/asyncFinanceContext'
import { localFirstStore } from '../services/localFirstStore'
import { V3QuickAdd } from './V3QuickAdd'

vi.mock('../services/localFirstStore', async (orig) => {
  const mod = await orig<typeof import('../services/localFirstStore')>()
  return { ...mod, localFirstStore: { ...mod.localFirstStore, enqueue: vi.fn().mockResolvedValue(undefined), outbox: vi.fn().mockResolvedValue([]), saveSnapshot: vi.fn().mockResolvedValue(undefined), latestSnapshot: vi.fn().mockResolvedValue(undefined) } }
})

const state: FinanceState = {
  accounts: [
    { id: 'a1', name: 'Checking', type: 'checking', classification: 'asset', balance: 1000, balanceMinor: '100000', syncStatus: 'manual', favoriteRank: 1 },
    { id: 'a2', name: 'Cash', type: 'cash', classification: 'asset', balance: 50, balanceMinor: '5000', syncStatus: 'manual' },
  ],
  creditCards: [{ id: 'c1', name: 'Visa', lastFour: '4242', network: 'visa', balance: 250, balanceMinor: '25000', limit: 1000, limitMinor: '100000', dueDate: '2026-10-20', minPayment: 10, minPaymentMinor: '1000' }],
  categories: [{ id: 'food', name: 'Food', color: '#000', budgetable: true, transactionKinds: ['expense'] }, { id: 'pay', name: 'Salary', color: '#000', budgetable: false, transactionKinds: ['income'] }],
  transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [], favoritesConfigured: true,
}
const posted: Transaction = { id: 'tx1', type: 'expense', title: 'Food', date: '2026-10-14', amount: 12.5, source: 'manual', status: 'cleared' }

function gateway(add: FinanceGateway['addTransaction']): FinanceGateway {
  const noop = vi.fn()
  return { todayIso: '2026-10-14', load: vi.fn().mockResolvedValue(state), addTransaction: add, updateTransaction: noop, reverseTransaction: noop, addManualAccount: noop, addManualCreditCard: noop, updateAccount: noop, updateCreditCard: noop, archiveAccount: noop, archiveCreditCard: noop, setFavorites: noop, createGoal: noop, addGoalFunds: noop, updateGoal: noop, deleteGoal: noop, createBudgetPeriod: noop, setBudgetAllocation: noop, addCategory: noop, updateCategory: noop, setCategoryBudget: noop, deleteCategory: noop } as unknown as FinanceGateway
}

async function open(add: FinanceGateway['addTransaction'], onClose = vi.fn()) {
  render(<MemoryRouter><AsyncFinanceProvider gateway={gateway(add)}><Gate onClose={onClose} /></AsyncFinanceProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Quick add' })
  return onClose
}
import { useAsyncFinance } from '../state/asyncFinanceContext'
function Gate({ onClose }: { onClose: () => void }) {
  const f = useAsyncFinance()
  return f.status === 'ready' ? <V3QuickAdd onClose={onClose} /> : <p>loading</p>
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }
})
beforeEach(() => { vi.mocked(localFirstStore.enqueue).mockClear() })
afterEach(cleanup)

const amount = () => screen.getByLabelText('Amount') as HTMLInputElement
const type = (name: string) => fireEvent.click(screen.getByRole('radio', { name }))
const submit = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }))
const pickCategory = (name: string) => fireEvent.change(screen.getByLabelText('Category'), { target: { value: name } })

describe('V3 Quick Add', () => {
  it('offers the four actions and focuses the amount', async () => {
    await open(vi.fn())
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['expense', 'income', 'transfer', 'card_payment'])
    expect(document.activeElement).toBe(amount())
  })

  it('posts an expense with exact minor units and a stable key, then closes', async () => {
    const add = vi.fn().mockResolvedValue(posted)
    const onClose = await open(add)
    fireEvent.change(amount(), { target: { value: '12.50' } })
    pickCategory('food')
    submit('Add expense')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0]![0]).toMatchObject({ type: 'expense', accountId: 'a1', categoryId: 'food', amountMinor: '1250', date: '2026-10-14' })
    expect(add.mock.calls[0]![0].idempotencyKey).toBeTruthy()
  })

  it('shows field errors, keeps the entry, and recovers after fixing them', async () => {
    const add = vi.fn().mockResolvedValue(posted)
    const onClose = await open(add)
    fireEvent.change(amount(), { target: { value: '5' } })
    submit('Add expense')
    const alert = await screen.findByText('Choose a category.')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(screen.getByLabelText('Category').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Category'))
    expect(amount().value).toBe('5')
    expect(add).not.toHaveBeenCalled()
    pickCategory('food')
    expect(screen.queryByText('Choose a category.')).toBeNull()
    submit('Add expense')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('ignores repeated clicks while a submit is in flight', async () => {
    let resolve!: (t: Transaction) => void
    const add = vi.fn().mockReturnValue(new Promise<Transaction>((r) => { resolve = r }))
    const onClose = await open(add)
    fireEvent.change(amount(), { target: { value: '3' } })
    pickCategory('food')
    const form = screen.getByRole('button', { name: 'Add expense' }).closest('form')!
    fireEvent.submit(form); fireEvent.submit(form); fireEvent.submit(form)
    expect(add).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { resolve(posted) })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('submits a card payment as a transfer and blocks overpayment', async () => {
    const add = vi.fn().mockResolvedValue({ ...posted, type: 'transfer' })
    const onClose = await open(add)
    type('Card Payment')
    expect(screen.queryByLabelText('Category')).toBeNull()
    fireEvent.change(amount(), { target: { value: '300' } })
    submit('Pay card')
    expect((await screen.findByText(/can't exceed/)).textContent).toContain('250.00')
    expect(add).not.toHaveBeenCalled()
    fireEvent.change(amount(), { target: { value: '100' } })
    submit('Pay card')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(add.mock.calls[0]![0]).toMatchObject({ type: 'transfer', fromAccountId: 'a1', toAccountId: 'c1', amountMinor: '10000' })
    expect(add.mock.calls[0]![0].categoryId).toBeUndefined()
  })

  it('never lists a credit card as an income destination', async () => {
    await open(vi.fn())
    type('Income')
    const select = screen.getByLabelText('Deposit to') as HTMLSelectElement
    expect([...select.options].some((o) => /Visa/.test(o.text))).toBe(false)
    expect(select.value).toBe('a1')
  })

  it('puts transfer fee and other optional fields behind a disclosure, required fields stay visible', async () => {
    await open(vi.fn())
    type('Transfer')
    expect(screen.getByLabelText('From')).toBeTruthy()
    expect(screen.getByLabelText('To')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: /optional details/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Transfer fee')).toBeTruthy()
  })

  it('queues on a network failure with the SAME key, and never claims it posted', async () => {
    const add = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await open(add)
    fireEvent.change(amount(), { target: { value: '9' } })
    pickCategory('food')
    submit('Add expense')
    const panel = await screen.findByTestId('v3-qa-queued')
    expect(panel.textContent).toMatch(/not posted yet/)
    expect(panel.textContent).not.toMatch(/saved\b(?! on this device)/)
    expect(screen.getByRole('link', { name: 'Review in Sync Center' }).getAttribute('href')).toBe('/sync')
    const op = vi.mocked(localFirstStore.enqueue).mock.calls[0]![0]
    expect(op).toMatchObject({ operationType: 'create_transaction', status: 'pending' })
    expect(op.idempotencyKey).toBe((add.mock.calls[0]![0] as { idempotencyKey: string }).idempotencyKey)
  })

  it('keeps the entry and the same key after an unconfirmed 5xx; a definite rejection keeps data and re-keys only when edited', async () => {
    const add = vi.fn()
      .mockRejectedValueOnce(new FinanceApiError(503, 'UNAVAILABLE', 'down'))
      .mockRejectedValueOnce(new FinanceApiError(422, 'INSUFFICIENT_FUNDS', 'Not enough funds.', 'amountMinor'))
      .mockRejectedValueOnce(new FinanceApiError(422, 'INSUFFICIENT_FUNDS', 'Not enough funds.', 'amountMinor'))
      .mockResolvedValue(posted)
    const onClose = await open(add)
    fireEvent.change(amount(), { target: { value: '9' } })
    pickCategory('food')
    submit('Add expense')
    expect((await screen.findByTestId('v3-qa-form-error')).textContent).toMatch(/may have been saved/)
    expect(amount().value).toBe('9')
    submit('Add expense')
    expect(await screen.findByText('Not enough funds.')).toBeTruthy()
    submit('Add expense') // unchanged retry after a definite rejection keeps the key
    await waitFor(() => expect(add).toHaveBeenCalledTimes(3))
    const keys = add.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey)
    expect(new Set(keys).size).toBe(1)
    fireEvent.change(amount(), { target: { value: '4' } })
    submit('Add expense')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((add.mock.calls[3]![0] as { idempotencyKey: string }).idempotencyKey).not.toBe(keys[0])
  })

  it('Escape asks before discarding unsaved input; an untouched sheet closes straight away', async () => {
    const onClose = await open(vi.fn())
    const dialog = screen.getByRole('dialog', { hidden: true })
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const onClose2 = await open(vi.fn())
    fireEvent.change(amount(), { target: { value: '7' } })
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }))
    expect(onClose2).not.toHaveBeenCalled()
    expect(screen.getByText('Discard this entry?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(amount().value).toBe('7')
    fireEvent.click(screen.getByRole('button', { name: 'Close quick add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose2).toHaveBeenCalled()
  })

  it('reuses an earlier transaction as a draft dated today', async () => {
    const withHistory = { ...state, transactions: [{ ...posted, id: 'old', title: 'Coffee', categoryId: 'food', accountId: 'a2', date: '2026-10-01', amount: 4.5, amountMinor: '450' }] }
    const gw = gateway(vi.fn())
    ;(gw.load as ReturnType<typeof vi.fn>).mockResolvedValue(withHistory)
    render(<MemoryRouter><AsyncFinanceProvider gateway={gw}><Gate onClose={vi.fn()} /></AsyncFinanceProvider></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Quick add' })
    fireEvent.change(screen.getByLabelText('Reuse an earlier one'), { target: { value: 'old' } })
    expect(amount().value).toBe('4.50')
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('food')
    expect((screen.getByLabelText('Paid from') as HTMLSelectElement).value).toBe('a2')
    expect((screen.getByLabelText('Description', { selector: 'input' }) as HTMLInputElement).value).toBe('Coffee')
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-14')
  })
})
