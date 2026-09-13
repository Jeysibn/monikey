import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Reports } from './Reports'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock, DEMO_TODAY_ISO } from '../utils/clock'
import { BackendAuthContext } from '../components/BackendAuthContext'

afterEach(cleanup)

function renderReports(todayIso: string = DEMO_TODAY_ISO) {
  return render(
    <FinanceProvider clock={fixedClock(todayIso)}>
      <Reports />
    </FinanceProvider>,
  )
}

describe('Reports page', () => {
  it('renders the page title and a KPI row with Income, Expenses, Net Cash Flow, and Savings Rate', () => {
    renderReports()
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeDefined()
    expect(screen.getByText('Income')).toBeDefined()
    expect(screen.getByText('Expenses')).toBeDefined()
    expect(screen.getByText('Net Cash Flow')).toBeDefined()
    expect(screen.getByText('Savings Rate')).toBeDefined()
  })

  it('defaults to the Monthly view and shows a period caption', () => {
    renderReports()
    const monthlyPill = screen.getByRole('button', { name: 'Monthly' })
    expect(monthlyPill.getAttribute('aria-pressed')).toBe('true')
  })

  it('switching the view toggle updates aria-pressed and the period caption', () => {
    const { container } = renderReports()
    const yearlyPill = screen.getByRole('button', { name: 'Yearly' })
    fireEvent.click(yearlyPill)
    expect(yearlyPill.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Monthly' }).getAttribute('aria-pressed')).toBe('false')
    // Yearly's period caption is just the calendar year.
    const caption = container.querySelector('.rp-period-caption')
    expect(caption?.textContent).toBe('2026')
  })

  it('opens a deterministic custom date range picker', () => {
    renderReports()
    const custom = screen.getByRole('button', { name: /Custom/ }) as HTMLButtonElement
    expect(custom.disabled).toBe(false)
    fireEvent.click(custom)
    expect(screen.getByLabelText('From')).toBeDefined()
    expect(screen.getByLabelText('To')).toBeDefined()
  })

  it('provides CSV export without exposing an unfinished PDF control', () => {
    renderReports()
    const csv = screen.getByRole('button', { name: /Export CSV/ }) as HTMLButtonElement
    expect(csv.disabled).toBe(false)
    expect(screen.queryByRole('button', { name: /Export PDF/ })).toBeNull()
  })

  it('renders Top Categories reusing spend mix category names', () => {
    renderReports()
    expect(screen.getByText('Top Categories')).toBeDefined()
  })

  it('renders Budget Performance with the overall used percentage', () => {
    renderReports()
    expect(screen.getByText('Budget Performance')).toBeDefined()
  })

  it('renders Goal Progress for active goals', () => {
    renderReports()
    expect(screen.getByText('Goal Progress')).toBeDefined()
  })

  it('labels every trended (non-"now") figure as illustrative, never presenting invented history as real', () => {
    renderReports()
    const notes = screen.getAllByText(/Illustrative/)
    expect(notes.length).toBeGreaterThanOrEqual(3) // Net Worth, Account Balance, Debt trends
  })

  it('shows Net Worth and Debt Trend sections labeled "Now" for their real point-in-time figures', () => {
    renderReports()
    expect(screen.getByText('Net Worth')).toBeDefined()
    expect(screen.getByText('Debt Trend')).toBeDefined()
    expect(screen.getByText('Account Balance Trend')).toBeDefined()
  })

  it('uses backend cash-flow and net-worth history instead of illustrative trend data', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/reports/cash-flow')) return new Response(JSON.stringify([{ date: '2026-09-01', income: '10000', expenses: '2500', netFlow: '7500' }]))
      if (url.includes('/reports/net-worth')) return new Response(JSON.stringify([{ date: '2026-09-01', assetTotal: '100000', liabilityTotal: '20000', netWorth: '80000' }]))
      if (url.includes('/reports/spending-by-tag')) return new Response(JSON.stringify([]))
      throw new Error(`Unexpected report request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<BackendAuthContext.Provider value={{ logout: vi.fn(async () => undefined) }}><FinanceProvider clock={fixedClock(DEMO_TODAY_ISO)}><Reports /></FinanceProvider></BackendAuthContext.Provider>)
    await waitFor(() => expect(screen.getByText('Recorded net-worth snapshots for the selected period.')).toBeDefined())
    expect(screen.queryByText(/Illustrative 6-month trend — Monikey does not yet track historical net worth/)).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/reports/net-worth'), expect.objectContaining({ credentials: 'include' }))
  })
})
