import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Investments } from './Investments'
import { FinanceProvider } from '../state/FinanceProvider'
import { fixedClock } from '../utils/clock'

// Vitest runs without `globals`, so Testing Library's automatic cleanup hook
// is never registered — unmount between tests explicitly (matches the other
// page/component tests in this repo, e.g. AddTransactionModal.test.tsx).
afterEach(cleanup)

function renderInvestments() {
  return render(
    <FinanceProvider clock={fixedClock('2026-08-29')}>
      <Investments />
    </FinanceProvider>,
  )
}

describe('Investments page', () => {
  it('renders the page title and every required content section', () => {
    renderInvestments()
    expect(screen.getByRole('heading', { name: 'Investments' })).toBeDefined()
    expect(screen.getByText('Portfolio Value')).toBeDefined()
    expect(screen.getByText('Total Gain/Loss')).toBeDefined()
    expect(screen.getByText('Today\'s Change')).toBeDefined()
    expect(screen.getByText('Asset Allocation')).toBeDefined()
    expect(screen.getByText('Holdings')).toBeDefined()
    expect(screen.getByText('Investment Transactions')).toBeDefined()
    expect(screen.getByText('Dividends')).toBeDefined()
    expect(screen.getByText('Performance History')).toBeDefined()
  })

  it('lists every holding from FinanceState.portfolio by ticker', () => {
    renderInvestments()
    // The mock portfolio (mockFinanceRepository.ts) seeds exactly these four
    // tickers — each renders at least once (desktop table row + mobile card).
    for (const ticker of ['AAPL', 'AMZN', 'MSFT', 'NVDA']) {
      expect(screen.getAllByText(ticker).length).toBeGreaterThan(0)
    }
  })

  it('opens the log-transaction form and appends a new entry to the activity feed', () => {
    renderInvestments()

    fireEvent.click(screen.getByRole('button', { name: '+ Log transaction' }))
    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }))
    fireEvent.change(screen.getByLabelText('Units'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Price per unit'), { target: { value: '1750' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log transaction' }))

    expect(screen.getByText(/AAPL · 5 units @/)).toBeDefined()
  })

  it('rejects an empty log-transaction submission with a field error instead of a silent no-op', () => {
    renderInvestments()

    fireEvent.click(screen.getByRole('button', { name: '+ Log transaction' }))
    fireEvent.change(screen.getByLabelText('Units'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log transaction' }))

    expect(screen.getByRole('alert').textContent).toMatch(/enter the number of units/i)
  })
})
