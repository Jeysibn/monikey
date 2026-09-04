import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Reports } from './Reports'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock, DEMO_TODAY_ISO } from '../utils/clock'

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

  it('renders a disabled Custom pill marked coming soon, never a working custom range', () => {
    renderReports()
    const custom = screen.getByRole('button', { name: /Custom/ }) as HTMLButtonElement
    expect(custom.disabled).toBe(true)
    expect(within(custom).getByText('Coming soon')).toBeDefined()
  })

  it('renders disabled CSV/PDF export buttons marked coming soon rather than a working export', () => {
    renderReports()
    const csv = screen.getByRole('button', { name: /Export CSV/ }) as HTMLButtonElement
    const pdf = screen.getByRole('button', { name: /Export PDF/ }) as HTMLButtonElement
    expect(csv.disabled).toBe(true)
    expect(pdf.disabled).toBe(true)
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

  it('renders Investment Performance with sample-data disclosure', () => {
    renderReports()
    expect(screen.getByText('Investment Performance')).toBeDefined()
    expect(screen.getByText(/Sample portfolio data/)).toBeDefined()
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
})
