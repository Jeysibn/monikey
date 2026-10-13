import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'
import { V3Overview } from './V3Overview'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function renderOverview() {
  return render(
    <FinanceProvider clock={fixedClock('2026-08-30')}>
      <MemoryRouter initialEntries={['/v3']}>
        <Routes>
          <Route path="/v3" element={<V3Overview />} />
          <Route path="/accounts" element={<h1>Classic Accounts</h1>} />
          <Route path="/transactions" element={<h1>Classic Transactions</h1>} />
        </Routes>
      </MemoryRouter>
    </FinanceProvider>,
  )
}

describe('V3 Overview summary', () => {
  it('shows four favorite accounts first with real balances', () => {
    renderOverview()
    const list = screen.getByRole('list', { name: 'Featured accounts' })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(4)
    expect(cards[0]!.textContent).toContain('4,120.00')
    expect(cards[1]!.textContent).toContain('640.00')
    expect(cards[2]!.textContent).toContain('120.00')
    // DOM order: accounts region before position and activity
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))
    expect(regions).toEqual(['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity'])
  })
  it('presents the credit card as outstanding debt, not available credit', () => {
    renderOverview()
    const card = screen.getByRole('link', { name: /Visa Platinum credit card, outstanding balance owed/ })
    expect(card.textContent).toContain('Owed')
    expect(card.textContent).toContain('1,460.00')
    expect(card.textContent).toContain('Outstanding debt')
    expect(card.textContent).not.toContain('3,540')
  })
  it('computes net tracked position as liquid minus card debt', () => {
    renderOverview()
    expect(screen.getByTestId('v3-liquid').textContent).toContain('8,040.00')
    expect(screen.getByTestId('v3-debt').textContent).toContain('2,070.00')
    expect(screen.getByTestId('v3-net').textContent).toContain('5,970.00')
  })
  it('shows the monthly budget line from budget totals', () => {
    renderOverview()
    expect(screen.getByTestId('v3-budget-line').textContent).toMatch(/Budgeted categories: .*of .*11,600\.00/)
    expect(screen.getByRole('progressbar', { name: 'Budgeted categories used' })).toBeTruthy()
  })
  it('lists recent activity newest first and links to existing pages', () => {
    renderOverview()
    const rows = within(screen.getByRole('list', { name: 'Recent transactions' })).getAllByRole('listitem')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.textContent).toContain('Grab Ride')
    fireEvent.click(screen.getByRole('link', { name: 'All activity' }))
    expect(screen.getByRole('heading', { name: 'Classic Transactions' })).toBeTruthy()
  })
  it('navigates account cards to the existing Accounts page', () => {
    renderOverview()
    fireEvent.click(screen.getByRole('link', { name: /^Checking, balance/ }))
    expect(screen.getByRole('heading', { name: 'Classic Accounts' })).toBeTruthy()
  })
})

describe('Summary/Insights tabs', () => {
  it('is an accessible tablist with arrow key support and roving tabindex', () => {
    renderOverview()
    const [summary, insights] = screen.getAllByRole('tab')
    expect(summary!.getAttribute('aria-selected')).toBe('true')
    expect(summary!.tabIndex).toBe(0)
    expect(insights!.tabIndex).toBe(-1)
    fireEvent.keyDown(summary!, { key: 'ArrowRight' })
    expect(insights!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('v3-tab-insights')
    fireEvent.keyDown(insights!, { key: 'Home' })
    expect(summary!.getAttribute('aria-selected')).toBe('true')
  })
})

describe('V3 Insights', () => {
  const open = () => { renderOverview(); fireEvent.click(screen.getByRole('tab', { name: 'Insights' })) }
  it('shows an honest unavailable state for history in mock mode (no fabricated trend)', () => {
    open()
    const h = screen.getByTestId('v3-history')
    expect(h.textContent).toContain('not recorded in demo mode')
    expect(h.querySelector('svg')).toBeNull()
  })
  it('shows spending by category and budget vs actual', () => {
    open()
    expect(within(screen.getByTestId('v3-categories')).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('v3-bva')).getAllByRole('progressbar').length).toBeGreaterThan(0)
  })
  it('timeframe selector changes the period and explains monthly-only budgets', () => {
    open()
    expect(screen.getByTestId('v3-period-label').textContent).toBe('August 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Quarterly' }))
    expect(screen.getByTestId('v3-period-label').textContent).toMatch(/Q3|2026/)
    expect(screen.getByTestId('v3-bva').textContent).toContain('Budgets are monthly')
  })
  const routed = (tracked: unknown[], extra: Record<string, () => Response> = {}) => vi.fn(async (url: string) => {
    for (const [k, v] of Object.entries(extra)) if (url.includes(k)) return v()
    if (url.includes('net-tracked-position')) return new Response(JSON.stringify(tracked), { status: 200 })
    if (url.includes('reports/summary')) return new Response(JSON.stringify({ income: '500000', expenses: '350000' }), { status: 200 })
    if (url.includes('spending-by-category')) return new Response(JSON.stringify([{ categoryId: 'c1', categoryName: 'Food', spent: '300000' }]), { status: 200 })
    if (url.includes('budget-performance')) return new Response(JSON.stringify({ totalAllocated: '400000', totalSpent: '300000', categories: [{ categoryId: 'c1', categoryName: 'Food', allocated: '400000', spent: '300000' }] }), { status: 200 })
    return new Response('{}', { status: 404 })
  })
  it('backend mode: uses the ledger-derived history and report endpoints, with an Uncategorized remainder', async () => {
    vi.stubEnv('VITE_FINANCE_BACKEND', 'true')
    const two = [{ date: '2026-08-01', netTrackedPosition: '100000' }, { date: '2026-08-02', netTrackedPosition: '150000' }]
    vi.stubGlobal('fetch', routed(two))
    open()
    expect((await screen.findByTestId('v3-history-summary')).textContent).toContain('1,500.00')
    const cats = await screen.findByTestId('v3-cat-total')
    expect(cats.textContent).toContain('3,500.00')
    expect(screen.getByTestId('v3-categories').textContent).toContain('Uncategorized')
    expect(screen.getByTestId('v3-categories').textContent).toContain('500.00')
    cleanup()
    vi.stubGlobal('fetch', routed(two.slice(0, 1)))
    open()
    expect((await screen.findByTestId('v3-history')).textContent).toContain('Not enough tracked history')
  })
  it('backend mode: a missing budget (404) shows the empty state, not an error', async () => {
    vi.stubEnv('VITE_FINANCE_BACKEND', 'true')
    vi.stubGlobal('fetch', routed([], { 'budget-performance': () => new Response('{}', { status: 404 }) }))
    open()
    expect((await screen.findByTestId('v3-bva')).textContent).toContain('No budget set for this month')
  })
  it('reports errors per section without breaking the page', async () => {
    vi.stubEnv('VITE_FINANCE_BACKEND', 'true')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    open()
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('v3-history').textContent).toContain('could not be loaded')
    expect(screen.getByTestId('v3-categories')).toBeTruthy()
  })
})
