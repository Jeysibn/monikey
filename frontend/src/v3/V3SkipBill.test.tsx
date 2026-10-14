import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FinanceState } from '../domain/finance'
import type { RecurringItem } from '../domain/recurring'
import { FinanceApiError, type FinanceGateway } from '../services/apiFinanceGateway'
import type { ConfirmPaymentResult, RecurringGateway } from '../services/apiRecurringGateway'
import { AsyncFinanceProvider } from '../state/asyncFinanceContext'
import { V3Planning } from './V3Planning'

vi.mock('../services/localFirstStore', async (orig) => {
  const mod = await orig<typeof import('../services/localFirstStore')>()
  return { ...mod, localFirstStore: { ...mod.localFirstStore, enqueue: vi.fn().mockResolvedValue(undefined), outbox: vi.fn().mockResolvedValue([]), saveSnapshot: vi.fn().mockResolvedValue(undefined), latestSnapshot: vi.fn().mockResolvedValue(undefined) } }
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

const state: FinanceState = {
  accounts: [{ id: 'a1', name: 'Checking', type: 'checking', classification: 'asset', balance: 1000, balanceMinor: '100000', syncStatus: 'manual' }],
  creditCards: [], categories: [{ id: 'bills', name: 'Bills', color: '#000', budgetable: true, transactionKinds: ['expense'] }], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [],
}
const bill = (over: Partial<RecurringItem>): RecurringItem => ({ id: 'r1', merchant: 'Landlord', amount: 450, amountMinor: '45000', frequency: 'monthly', nextDueDate: '2026-10-10', accountId: 'a1', categoryId: 'bills', autopay: false, status: 'active', ...over }) as RecurringItem
const skipped = (item: RecurringItem, outcome: 'skipped' | 'replayed' = 'skipped'): ConfirmPaymentResult => ({ outcome, recurring: { ...item, nextDueDate: '2026-11-10' }, occurrence: { dueDate: item.nextDueDate, status: 'skipped', transactionId: null }, transactionId: null })

function setup(items: RecurringItem[], skipCycle: NonNullable<RecurringGateway['skipCycle']>, confirmPayment = vi.fn()) {
  const load = vi.fn().mockResolvedValue(state)
  const gw = { todayIso: '2026-10-14', load } as unknown as FinanceGateway
  const rec = { load: vi.fn().mockResolvedValue(items), suggestions: vi.fn().mockResolvedValue([]), skipCycle, confirmPayment } as unknown as RecurringGateway
  render(<MemoryRouter><AsyncFinanceProvider gateway={gw} recurringGateway={rec}><V3Planning /></AsyncFinanceProvider></MemoryRouter>)
  return { load, rec, confirmPayment }
}
const open = async (id = 'r1') => { fireEvent.click(await screen.findByTestId(`v3-plan-skip-${id}`)); return screen.findByTestId('v3-skip-dialog') }
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') } })

describe('V3 Planning: skip a recurring cycle', () => {
  it('offers Skip only for due or overdue active bills', async () => {
    setup([bill({ id: 'r1' }), bill({ id: 'r2', nextDueDate: '2026-10-14' }), bill({ id: 'r3', nextDueDate: '2026-12-01' }), bill({ id: 'r4', status: 'paused' })], vi.fn())
    await screen.findByTestId('v3-plan-skip-r1')
    expect(screen.getByTestId('v3-plan-skip-r2')).toBeTruthy()
    expect(screen.queryByTestId('v3-plan-skip-r3')).toBeNull()
    expect(screen.queryByTestId('v3-plan-skip-r4')).toBeNull()
  })

  it('explains that skipping is not paying, sends nothing until confirmed, then refetches', async () => {
    const skip = vi.fn().mockImplementation(async () => skipped(bill({})))
    const { load, confirmPayment } = setup([bill({})], skip)
    const dialog = await open()
    expect(skip).not.toHaveBeenCalled()
    expect(within(dialog).getByTestId('v3-skip-explain').textContent).toMatch(/does not record a payment.*no expense.*no account balance changes/)
    const loads = load.mock.calls.length
    fireEvent.click(within(dialog).getByTestId('v3-skip-submit'))
    const ok = await screen.findByTestId('v3-skip-success')
    expect(ok.textContent).toMatch(/skipped, not paid/)
    expect(skip).toHaveBeenCalledTimes(1)
    expect(skip).toHaveBeenCalledWith('r1', { expectedDueDate: '2026-10-10' })
    expect(confirmPayment).not.toHaveBeenCalled()
    expect(load.mock.calls.length).toBeGreaterThan(loads)
    expect(screen.queryByTestId('v3-skip-stale')).toBeNull()
  })

  it('ignores a double click while in flight', async () => {
    let resolve!: (v: ConfirmPaymentResult) => void
    const skip = vi.fn().mockImplementation(() => new Promise<ConfirmPaymentResult>((r) => { resolve = r }))
    setup([bill({})], skip)
    const dialog = await open()
    const btn = within(dialog).getByTestId('v3-skip-submit')
    fireEvent.click(btn); fireEvent.click(btn)
    expect(skip).toHaveBeenCalledTimes(1)
    resolve(skipped(bill({})))
    await screen.findByTestId('v3-skip-success')
  })

  it('shows the server refusal and records nothing on a 4xx', async () => {
    setup([bill({})], vi.fn().mockRejectedValue(new FinanceApiError(409, 'DUE_DATE_MISMATCH', 'This bill moved to a different due date. Refresh and try again.')))
    const dialog = await open()
    fireEvent.click(within(dialog).getByTestId('v3-skip-submit'))
    expect((await screen.findByTestId('v3-skip-error')).textContent).toMatch(/different due date/)
    expect(screen.queryByTestId('v3-skip-success')).toBeNull()
  })

  it('treats a network failure as uncertain and Check again re-sends the same cycle safely', async () => {
    const skip = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(skipped(bill({}), 'replayed'))
    setup([bill({})], skip)
    const dialog = await open()
    fireEvent.click(within(dialog).getByTestId('v3-skip-submit'))
    await screen.findByTestId('v3-skip-uncertain')
    expect(screen.queryByTestId('v3-skip-success')).toBeNull()
    fireEvent.click(within(dialog).getByTestId('v3-skip-submit'))
    expect((await screen.findByTestId('v3-skip-success')).textContent).toMatch(/already skipped/)
    expect(skip).toHaveBeenNthCalledWith(2, 'r1', { expectedDueDate: '2026-10-10' })
  })

  it('keeps the skip when the refresh fails and the retry only refetches', async () => {
    const skip = vi.fn().mockImplementation(async () => skipped(bill({})))
    const { load } = setup([bill({})], skip)
    const dialog = await open()
    load.mockRejectedValueOnce(new Error('down'))
    fireEvent.click(within(dialog).getByTestId('v3-skip-submit'))
    await screen.findByTestId('v3-skip-stale')
    fireEvent.click(within(dialog).getByText('Retry refresh'))
    await waitFor(() => expect(screen.queryByTestId('v3-skip-stale')).toBeNull())
    expect(skip).toHaveBeenCalledTimes(1)
  })

  it('focuses Cancel first so Enter cannot skip by accident', async () => {
    setup([bill({})], vi.fn())
    const dialog = await open()
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByText('Cancel')))
  })
})
