import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { V3Planning } from './V3Planning'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const open = () => render(<FinanceProvider clock={fixedClock('2026-08-30')}><MemoryRouter><V3Planning /></MemoryRouter></FinanceProvider>)

describe('V3 Planning (demo data)', () => {
  it('shows the month, budget totals, category rows with accessible progress bars, and recurring bills', () => {
    open()
    expect(screen.getByTestId('v3-plan-month').textContent).toBe('August 2026')
    expect(screen.getByTestId('v3-plan-summary')).toBeTruthy()
    const shopping = screen.getByTestId('v3-plan-row-shopping')
    expect(shopping.textContent).toContain('Over budget')
    expect(within(shopping).getByRole('progressbar', { name: 'Shopping budget used' }).getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByRole('progressbar', { name: 'Overall budget used' })).toBeTruthy()
    expect(screen.getByTestId('v3-plan-bills').textContent).toContain('Netflix')
  })

  it('lists budgetable categories without an allocation and never income-only categories', () => {
    open()
    const unbudgeted = screen.getByTestId('v3-plan-categories')
    expect(unbudgeted.textContent).not.toContain('Salary')
  })

  it('edits an allocation with exact minor units and confirms it', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Food & Groceries budget' }))
    const input = screen.getByLabelText('Monthly budget for Food & Groceries') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: '1,700.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByTestId('v3-plan-notice').textContent).toContain('Saved ₱1,700.50 for Food & Groceries.'))
    expect(screen.getByTestId('v3-plan-row-food').textContent).toContain('1,700.50')
  })

  it('rejects invalid amounts with an accessible message and keeps the input', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Food & Groceries budget' }))
    const input = screen.getByLabelText('Monthly budget for Food & Groceries') as HTMLInputElement
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toMatch(/negative/)
    expect(input.value).toBe('-5')
  })

  it('Escape cancels editing', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Food & Groceries budget' }))
    fireEvent.keyDown(screen.getByLabelText('Monthly budget for Food & Groceries'), { key: 'Escape' })
    expect(screen.queryByLabelText('Monthly budget for Food & Groceries')).toBeNull()
  })

  it('demo data offers no way to pay, post or advance a recurring bill, and says nothing is recorded automatically', () => {
    open()
    const bills = screen.getByTestId('v3-plan-bills')
    expect(within(bills).queryAllByRole('button')).toHaveLength(0)
    expect(bills.textContent).not.toMatch(/mark.*paid|pay now/i)
    expect(bills.textContent).toMatch(/never records a bill by itself/i)
    expect(bills.textContent).not.toMatch(/may record a bill by itself/i)
  })
})

describe('V3 Planning (backend mode)', () => {
  const period = (allocated: string, spent: string, over: Record<string, unknown> = {}) => ({ id: 'p1', periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-08-31T00:00:00.000Z', allocations: [{ categoryId: 'food', allocatedMinor: allocated, spentMinor: spent }], ...over })

  function server(handlers: { budgets?: () => Response | Promise<Response>; post?: (url: string, init?: RequestInit) => Response | Promise<Response> }) {
    const calls: { url: string; method: string; body?: string }[] = []
    vi.stubEnv('VITE_FINANCE_BACKEND', 'true')
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body as string | undefined })
      if (method !== 'GET') return handlers.post ? handlers.post(url, init) : new Response('{}', { status: 201 })
      if (url.includes('/reports/summary')) return new Response(JSON.stringify({ income: '0', expenses: '300000' }), { status: 200 })
      if (url.includes('/reports/spending-by-category')) return new Response(JSON.stringify([{ categoryId: 'food', categoryName: 'Food', spent: '300000' }]), { status: 200 })
      if (url.endsWith('/budgets')) return handlers.budgets ? handlers.budgets() : new Response(JSON.stringify([period('400000', '300000')]), { status: 200 })
      return new Response('{}', { status: 404 })
    }))
    return calls
  }

  it('uses server-computed amounts as-is and separates total from budgeted spending', async () => {
    server({})
    open()
    expect((await screen.findByTestId('v3-plan-allocated')).textContent).toContain('4,000.00')
    expect(screen.getByTestId('v3-plan-spent').textContent).toContain('3,000.00')
    expect(screen.getByTestId('v3-plan-remaining').textContent).toContain('1,000.00')
    expect(screen.getByTestId('v3-plan-total').textContent).toContain('All spending this month: ₱3,000.00')
  })

  it('shows the empty-budget state when the month has no period', async () => {
    server({ budgets: () => new Response('[]', { status: 200 }) })
    open()
    expect((await screen.findByTestId('v3-plan-empty')).textContent).toContain('No budget for August 2026')
  })

  it('shows a retryable error and recovers', async () => {
    let fail = true
    server({ budgets: () => (fail ? new Response('{}', { status: 500 }) : new Response('[]', { status: 200 })) })
    open()
    expect((await screen.findByTestId('v3-plan-error')).textContent).toContain("couldn't be loaded")
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('v3-plan-empty')).toBeTruthy()
  })

  it('creates the month period only when missing, then saves the allocation', async () => {
    const calls = server({ budgets: () => new Response('[]', { status: 200 }), post: (url) => url.endsWith('/budgets') ? new Response(JSON.stringify(period('0', '0', { allocations: [] })), { status: 201 }) : new Response('{}', { status: 201 }) })
    open()
    await screen.findByTestId('v3-plan-empty')
    fireEvent.click(screen.getByRole('button', { name: 'Set your first budget' }))
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: '250.75' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByTestId('v3-plan-notice')).toBeTruthy())
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts[0]).toMatchObject({ url: '/api/v1/budgets' })
    expect(JSON.parse(posts[0]!.body!)).toMatchObject({ periodStart: '2026-08-01', periodEnd: '2026-08-31', incomePoolMinor: '0' })
    expect(posts[1]!.url).toBe('/api/v1/budgets/p1/allocations')
    expect(JSON.parse(posts[1]!.body!).allocatedMinor).toBe('25075')
  })

  it('does not re-post an existing period (that would reset its income pool)', async () => {
    const calls = server({})
    open()
    await screen.findByTestId('v3-plan-allocated')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Food & Groceries budget' }))
    fireEvent.change(screen.getByLabelText('Monthly budget for Food & Groceries'), { target: { value: '4500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByTestId('v3-plan-notice')).toBeTruthy())
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url)).toEqual(['/api/v1/budgets/p1/allocations'])
  })

  it('saved but refresh failed: says so, keeps the data, and retries only the refresh', async () => {
    let reloads = 0
    const calls = server({ budgets: () => (++reloads === 2 ? new Response('{}', { status: 500 }) : new Response(JSON.stringify([period('400000', '300000')]), { status: 200 })) })
    open()
    await screen.findByTestId('v3-plan-allocated')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Food & Groceries budget' }))
    fireEvent.change(screen.getByLabelText('Monthly budget for Food & Groceries'), { target: { value: '4500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByTestId('v3-plan-stale')).textContent).toContain("saved, but the latest figures couldn't be loaded")
    expect(screen.getByTestId('v3-plan-allocated')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
    await waitFor(() => expect(screen.queryByTestId('v3-plan-stale')).toBeNull())
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('a failed save keeps the typed amount and shows the server message', async () => {
    server({ post: () => new Response(JSON.stringify({ error: { code: 'UNKNOWN_CATEGORY', message: 'Category not found.' } }), { status: 422 }) })
    open()
    await screen.findByTestId('v3-plan-allocated')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Food & Groceries budget' }))
    const input = screen.getByLabelText('Monthly budget for Food & Groceries') as HTMLInputElement
    fireEvent.change(input, { target: { value: '4500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Category not found.')
    expect(input.value).toBe('4500')
  })

  it('navigates months within the supported window and never makes a write while browsing', async () => {
    const calls = server({})
    open()
    await screen.findByTestId('v3-plan-allocated')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByTestId('v3-plan-month').textContent).toBe('July 2026')
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByTestId('v3-plan-month').textContent).toBe('September 2026')
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(true)
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
  })
})
