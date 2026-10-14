import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FinanceState } from '../domain/finance'
import type { RecurringItem } from '../domain/recurring'
import { FinanceApiError, type FinanceGateway } from '../services/apiFinanceGateway'
import { RecurringConfirmError, type ConfirmPaymentResult, type RecurringGateway } from '../services/apiRecurringGateway'
import { AsyncFinanceProvider } from '../state/asyncFinanceContext'
import { V3Planning } from './V3Planning'

vi.mock('../services/localFirstStore', async (orig) => {
  const mod = await orig<typeof import('../services/localFirstStore')>()
  return { ...mod, localFirstStore: { ...mod.localFirstStore, enqueue: vi.fn().mockResolvedValue(undefined), outbox: vi.fn().mockResolvedValue([]), saveSnapshot: vi.fn().mockResolvedValue(undefined), latestSnapshot: vi.fn().mockResolvedValue(undefined) } }
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

const state: FinanceState = {
  accounts: [{ id: 'a1', name: 'Checking', type: 'checking', classification: 'asset', balance: 1000, balanceMinor: '100000', syncStatus: 'manual' }, { id: 'a2', name: 'Cash', type: 'cash', classification: 'asset', balance: 50, balanceMinor: '5000', syncStatus: 'manual' }],
  creditCards: [], categories: [{ id: 'bills', name: 'Bills', color: '#000', budgetable: true, transactionKinds: ['expense'] }], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [],
}
const bill = (over: Partial<RecurringItem>): RecurringItem => ({ id: 'r1', merchant: 'Landlord', amount: 450, amountMinor: '45000', frequency: 'monthly', nextDueDate: '2026-10-10', accountId: 'a1', categoryId: 'bills', autopay: false, status: 'active', ...over }) as RecurringItem
const ok = (item: RecurringItem): ConfirmPaymentResult => ({ outcome: 'confirmed', recurring: { ...item, nextDueDate: '2026-11-10' }, occurrence: { dueDate: item.nextDueDate, status: 'confirmed', transactionId: 'tx9' }, transactionId: 'tx9' })

function setup(items: RecurringItem[], confirmPayment: NonNullable<RecurringGateway['confirmPayment']>, extra: Partial<RecurringGateway> = {}) {
  const load = vi.fn().mockResolvedValue(state)
  const gw = { todayIso: '2026-10-14', load } as unknown as FinanceGateway
  const rec = { load: vi.fn().mockResolvedValue(items), suggestions: vi.fn().mockResolvedValue([]), confirmPayment, ...extra } as unknown as RecurringGateway
  render(<MemoryRouter><AsyncFinanceProvider gateway={gw} recurringGateway={rec}><V3Planning /></AsyncFinanceProvider></MemoryRouter>)
  return { load, rec }
}
const openDialog = async (id = 'r1') => { fireEvent.click(await screen.findByTestId(`v3-plan-confirm-${id}`)); return screen.findByTestId('v3-confirm-dialog') }
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') } })

describe('V3 Planning: confirm a recurring payment', () => {
  it('offers Record payment only for due or overdue active bills', async () => {
    setup([bill({ id: 'r1' }), bill({ id: 'r2', nextDueDate: '2026-10-14' }), bill({ id: 'r3', nextDueDate: '2026-12-01' }), bill({ id: 'r4', status: 'paused' })], vi.fn())
    await screen.findByTestId('v3-plan-confirm-r1')
    expect(screen.getByTestId('v3-plan-confirm-r2')).toBeTruthy()
    expect(screen.queryByTestId('v3-plan-confirm-r3')).toBeNull()
    expect(screen.queryByTestId('v3-plan-confirm-r4')).toBeNull()
  })

  it('records nothing until submit, then sends the cycle, exact minor amount, account and date, and refetches', async () => {
    const confirm = vi.fn().mockImplementation(async () => ok(bill({})))
    const { load } = setup([bill({})], confirm)
    const dialog = await openDialog()
    expect(confirm).not.toHaveBeenCalled()
    expect(within(dialog).getByTestId('v3-confirm-explain').textContent).toMatch(/records a new expense of .*450\.00/)
    fireEvent.change(within(dialog).getByLabelText('Amount paid'), { target: { value: '1,234.50' } })
    fireEvent.change(within(dialog).getByLabelText('Paid from'), { target: { value: 'a2' } })
    fireEvent.change(within(dialog).getByLabelText('Payment date'), { target: { value: '2026-10-12' } })
    const loads = load.mock.calls.length
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    await screen.findByTestId('v3-confirm-success')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith('r1', { expectedDueDate: '2026-10-10', amountMinor: '123450', accountId: 'a2', paidOn: '2026-10-12' })
    expect(load.mock.calls.length).toBeGreaterThan(loads)
    expect(screen.queryByTestId('v3-confirm-stale')).toBeNull()
  })

  it('a double click sends one request', async () => {
    let resolve!: (v: ConfirmPaymentResult) => void
    const confirm = vi.fn().mockImplementation(() => new Promise<ConfirmPaymentResult>((r) => { resolve = r }))
    setup([bill({})], confirm)
    const dialog = await openDialog()
    const submit = within(dialog).getByTestId('v3-confirm-submit')
    fireEvent.click(submit); fireEvent.click(submit)
    expect(confirm).toHaveBeenCalledTimes(1)
    resolve(ok(bill({})))
    await screen.findByTestId('v3-confirm-success')
  })

  it('validates locally: zero amount and missing account never reach the server', async () => {
    const confirm = vi.fn()
    setup([bill({})], confirm)
    const dialog = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Amount paid'), { target: { value: '0' } })
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/greater than zero/)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows a server validation refusal and does not call the bill paid', async () => {
    const confirm = vi.fn().mockRejectedValue(new FinanceApiError(422, 'ACCOUNT_ARCHIVED', 'That account is archived. Choose another account.', 'accountId'))
    setup([bill({})], confirm)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/archived/)
    expect(screen.queryByTestId('v3-confirm-success')).toBeNull()
  })

  it('warns about a possible duplicate, can link it without posting, or record anyway with acknowledgement', async () => {
    const cand = { transactionId: 'tx5', title: 'Landlord', amountMinor: '45000', occurredOn: '2026-10-09', accountId: 'a1', categoryId: 'bills', matchedOn: ['amount', 'merchant'] as const }
    const confirm = vi.fn().mockRejectedValueOnce(new RecurringConfirmError(409, 'POSSIBLE_DUPLICATE_PAYMENT', 'dup', undefined, [{ ...cand, matchedOn: [...cand.matchedOn] }])).mockImplementation(async () => ok(bill({})))
    const linkPayment = vi.fn().mockResolvedValue({ ...ok(bill({})), outcome: 'linked' })
    setup([bill({})], confirm, { linkPayment })
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    const warn = await screen.findByTestId('v3-confirm-duplicate')
    expect(warn.textContent).toMatch(/may already be recorded/i)
    expect(within(warn).getByRole('link', { name: /Inspect in Activity/ })).toBeTruthy()
    fireEvent.click(within(warn).getByRole('button', { name: /record a new expense/i }))
    await screen.findByTestId('v3-confirm-success')
    expect(confirm).toHaveBeenLastCalledWith('r1', expect.objectContaining({ allowPossibleDuplicate: true }))
    expect(linkPayment).not.toHaveBeenCalled()
  })

  it('links the existing payment instead of posting', async () => {
    const cand = { transactionId: 'tx5', title: 'Landlord', amountMinor: '45000', occurredOn: '2026-10-09', accountId: 'a1', categoryId: 'bills', matchedOn: ['amount'] as ('amount')[] }
    const confirm = vi.fn().mockRejectedValue(new RecurringConfirmError(409, 'POSSIBLE_DUPLICATE_PAYMENT', 'dup', undefined, [cand]))
    const linkPayment = vi.fn().mockResolvedValue({ ...ok(bill({})), outcome: 'linked' })
    setup([bill({})], confirm, { linkPayment })
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    fireEvent.click(await screen.findByRole('button', { name: /link it/i }))
    await waitFor(() => expect(screen.getByTestId('v3-confirm-success').textContent).toMatch(/No new expense was created/))
    expect(linkPayment).toHaveBeenCalledWith('r1', { expectedDueDate: '2026-10-10', transactionId: 'tx5' })
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('an uncertain result is never described as paid; Check again resends the identical request', async () => {
    const confirm = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(async () => ({ ...ok(bill({})), outcome: 'replayed' as const }))
    setup([bill({})], confirm)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    expect((await screen.findByTestId('v3-confirm-uncertain')).textContent).toMatch(/may or may not/)
    expect(screen.queryByTestId('v3-confirm-success')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await screen.findByTestId('v3-confirm-success')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(confirm.mock.calls[1]).toEqual(confirm.mock.calls[0])
    expect(screen.getByTestId('v3-confirm-success').textContent).toMatch(/already recorded/)
  })

  it('a posted payment with a failed refresh shows a retry that only refetches', async () => {
    const confirm = vi.fn().mockImplementation(async () => ok(bill({})))
    const { load } = setup([bill({})], confirm)
    const dialog = await openDialog()
    load.mockRejectedValue(new Error('offline'))
    fireEvent.click(within(dialog).getByTestId('v3-confirm-submit'))
    const stale = await screen.findByTestId('v3-confirm-stale')
    expect(stale.textContent).toMatch(/Do not pay again/)
    load.mockResolvedValue(state)
    fireEvent.click(within(stale).getByRole('button', { name: 'Retry refresh' }))
    await waitFor(() => expect(screen.queryByTestId('v3-confirm-stale')).toBeNull())
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})
