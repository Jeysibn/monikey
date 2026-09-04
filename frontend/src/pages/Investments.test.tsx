import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Investments } from './Investments'
import { FinanceProvider } from '../state/FinanceProvider'
import { AsyncFinanceProvider } from '../state/asyncFinanceContext'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import { FinanceApiError } from '../services/apiFinanceGateway'
import type { InvestmentGateway } from '../services/apiInvestmentGateway'
import type { FinanceState } from '../domain/finance'
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

const emptyState: FinanceState = { accounts: [], creditCards: [], categories: [], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [] }
const fakeFinanceGateway: FinanceGateway = {
  load: async () => emptyState,
  addTransaction: async () => { throw new Error('not used') },
  updateTransaction: async () => { throw new Error('not used') },
  reverseTransaction: async () => { throw new Error('not used') },
  addManualAccount: async () => { throw new Error('not used') },
  addManualCreditCard: async () => { throw new Error('not used') },
  updateAccount: async () => { throw new Error('not used') },
  updateCreditCard: async () => { throw new Error('not used') },
  archiveAccount: async () => { throw new Error('not used') },
  archiveCreditCard: async () => { throw new Error('not used') },
  createGoal: async () => { throw new Error('not used') },
  addGoalFunds: async () => { throw new Error('not used') },
  updateGoal: async () => { throw new Error('not used') },
  deleteGoal: async () => { throw new Error('not used') },
  createBudgetPeriod: async () => { throw new Error('not used') },
  setBudgetAllocation: async () => { throw new Error('not used') },
  addBudgetCategory: async () => { throw new Error('not used') },
  updateCategory: async () => { throw new Error('not used') },
  deleteCategory: async () => { throw new Error('not used') },
}

describe('Investments page with a real (mocked) investment backend', () => {
  it('shows a warning banner with retry when the portfolio fetch fails, instead of failing silently', async () => {
    const getPortfolio = vi.fn().mockRejectedValue(new Error('portfolio service unreachable'))
    const investmentGateway: InvestmentGateway = { getPortfolio, addTrade: vi.fn(), updateTrade: vi.fn(), deleteTrade: vi.fn(), addDividend: vi.fn(), refreshQuotes: vi.fn() }
    render(
      <AsyncFinanceProvider gateway={fakeFinanceGateway} investmentGateway={investmentGateway}>
        <Investments />
      </AsyncFinanceProvider>,
    )
    const banner = await screen.findByText(/couldn.t reach the portfolio service/i)
    expect(banner.textContent).toMatch(/portfolio service unreachable/)

    getPortfolio.mockResolvedValueOnce({ baseCurrency: 'PHP', summary: { portfolioValueMinor: 0, remainingCostBasisMinor: 0, realizedPnlMinor: 0, unrealizedPnlMinor: 0, dividendsMinor: 0, feesMinor: 0, totalReturnMinor: 0, totalReturnPct: 0, todaysChangeMinor: null, todaysChangePct: null, baseValuationUnavailable: false }, holdings: [], closedPositions: [], trades: [], dividends: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText(/couldn.t reach the portfolio service/i)).toBeNull())
  })

  it('re-buying a closed (fully sold) ticker reuses its real recorded metadata instead of generic defaults', async () => {
    // Regression test: the ticker dropdown, and the metadata lookup used
    // when submitting, both used to only look at open holdings — a fully
    // sold ("closed") position fell through to defaults (assetClass:
    // 'equity', sector: 'Other') that mismatched the instrument's real,
    // previously recorded metadata (assetClass: 'crypto', sector:
    // 'Cryptocurrency'), tripping a spurious INSTRUMENT_METADATA_MISMATCH on
    // a perfectly legitimate re-buy.
    const closedBtc = {
      instrumentId: 'inst-btc', ticker: 'BTC', name: 'BTC', assetClass: 'crypto', sector: 'Cryptocurrency',
      units: 0, averageCostMinor: 0, costBasisMinor: 0, realizedPnlMinor: 500, dividendsReceivedMinor: 0, feesPaidMinor: 0,
      latestPriceMinor: null, latestPriceBaseMinor: null, marketValueMinor: null, unrealizedPnlMinor: null, nativeCurrencyCode: 'USD',
      marketValueBaseMinor: null, unrealizedPnlBaseMinor: null, change24hPct: null, change24hBaseMinor: null, dailyChangeBaseMinor: null,
      baseValuationUnavailable: false, quoteSource: null, quoteFetchedAt: null, quoteStale: false,
    }
    const addTrade = vi.fn().mockResolvedValue(undefined)
    const investmentGateway: InvestmentGateway = {
      getPortfolio: vi.fn().mockResolvedValue({ baseCurrency: 'PHP', summary: { portfolioValueMinor: 0, remainingCostBasisMinor: 0, realizedPnlMinor: 500, unrealizedPnlMinor: 0, dividendsMinor: 0, feesMinor: 0, totalReturnMinor: 500, totalReturnPct: 0, todaysChangeMinor: null, todaysChangePct: null, baseValuationUnavailable: false }, holdings: [], closedPositions: [closedBtc], trades: [], dividends: [] }),
      addTrade,
      updateTrade: vi.fn(),
      deleteTrade: vi.fn(),
      addDividend: vi.fn(),
      refreshQuotes: vi.fn(),
    }
    render(
      <AsyncFinanceProvider gateway={fakeFinanceGateway} investmentGateway={investmentGateway}>
        <Investments />
      </AsyncFinanceProvider>,
    )
    await waitFor(() => expect(investmentGateway.getPortfolio).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '+ Log transaction' }))
    // BTC must be selectable from the dropdown (it's a closed position, not
    // an open holding) rather than only reachable via free-text new-ticker entry.
    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'BTC' } })
    fireEvent.change(screen.getByLabelText('Units'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Price per unit'), { target: { value: '65000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log transaction' }))

    await waitFor(() => expect(addTrade).toHaveBeenCalled())
    expect(addTrade.mock.calls[0]![0]).toMatchObject({ ticker: 'BTC', name: 'BTC', assetClass: 'crypto', sector: 'Cryptocurrency' })
  })

  it('routes an INVESTMENT_OVERSELL error to the units field, not the ticker field', async () => {
    const overSellError = new FinanceApiError(422, 'INVESTMENT_OVERSELL', 'Sell quantity exceeds current units.', 'units')
    const investmentGateway: InvestmentGateway = {
      getPortfolio: vi.fn().mockResolvedValue({ baseCurrency: 'PHP', summary: { portfolioValueMinor: 0, remainingCostBasisMinor: 0, realizedPnlMinor: 0, unrealizedPnlMinor: 0, dividendsMinor: 0, feesMinor: 0, totalReturnMinor: 0, totalReturnPct: 0, todaysChangeMinor: null, todaysChangePct: null, baseValuationUnavailable: false }, holdings: [], closedPositions: [], trades: [], dividends: [] }),
      addTrade: vi.fn().mockRejectedValue(overSellError),
      updateTrade: vi.fn(),
      deleteTrade: vi.fn(),
      addDividend: vi.fn(),
      refreshQuotes: vi.fn(),
    }
    render(
      <AsyncFinanceProvider gateway={fakeFinanceGateway} investmentGateway={investmentGateway}>
        <Investments />
      </AsyncFinanceProvider>,
    )
    await waitFor(() => expect(investmentGateway.getPortfolio).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '+ Log transaction' }))
    // No existing holdings in this fixture, so the ticker field starts in
    // "new ticker" mode already — fill the free-text ticker input directly.
    fireEvent.change(screen.getByPlaceholderText('e.g. AAPL'), { target: { value: 'AAPL' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Apple Inc.'), { target: { value: 'Apple' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Technology'), { target: { value: 'Technology' } })
    fireEvent.change(screen.getByLabelText('Units'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Price per unit'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log transaction' }))

    await waitFor(() => expect(investmentGateway.addTrade).toHaveBeenCalled())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/exceeds current units/i)
    expect(alert.id).toContain('units')
  })
})
