import { useCallback, useMemo, useRef, useState } from 'react'
import { useFinance } from './useFinance'
import type {
  AllocationSlice,
  Dividend,
  EnrichedHolding,
  HoldingDetail,
  InvestmentTransaction,
  InvestmentTransactionType,
  LogInvestmentTransactionInput,
} from '../domain/investments'

// Investment-specific mock detail keyed by ticker, layered on top of the
// read-only `Holding[]` in `useFinance().state.portfolio` (ticker, name,
// price, units, history all come from there — never redefined here). This
// hook is the one place that owns this mock data; the page only ever reads
// through the hook.
const HOLDING_DETAILS: Record<string, HoldingDetail> = {
  AAPL: { ticker: 'AAPL', averageCost: 1452.1, sector: 'Technology', assetClass: 'equity' },
  AMZN: { ticker: 'AMZN', averageCost: 1050.0, sector: 'Consumer Discretionary', assetClass: 'equity' },
  MSFT: { ticker: 'MSFT', averageCost: 1798.4, sector: 'Technology', assetClass: 'equity' },
  NVDA: { ticker: 'NVDA', averageCost: 2210.75, sector: 'Semiconductors', assetClass: 'equity' },
  BTC: { ticker: 'BTC', averageCost: 52400.0, sector: 'Cryptocurrency', assetClass: 'crypto' },
  ETH: { ticker: 'ETH', averageCost: 3120.5, sector: 'Cryptocurrency', assetClass: 'crypto' },
}

const FALLBACK_DETAIL: Omit<HoldingDetail, 'ticker'> = { averageCost: 0, sector: 'Other', assetClass: 'equity' }

const SEED_TRANSACTIONS: InvestmentTransaction[] = [
  { id: 'itx-1', ticker: 'AAPL', type: 'buy', units: 50, price: 1300, amount: 65000, date: '2026-03-02', note: 'Initial position' },
  { id: 'itx-2', ticker: 'MSFT', type: 'buy', units: 41, price: 1798.4, amount: 73734.4, date: '2026-02-10' },
  { id: 'itx-3', ticker: 'NVDA', type: 'buy', units: 16, price: 2210.75, amount: 35372, date: '2026-01-15' },
  { id: 'itx-4', ticker: 'AMZN', type: 'buy', units: 20, price: 1100, amount: 22000, date: '2026-01-20' },
  { id: 'itx-5', ticker: 'AMZN', type: 'sell', units: 8, price: 1080, amount: 8640, date: '2026-05-05', note: 'Partial trim' },
  { id: 'itx-6', ticker: 'AAPL', type: 'buy', units: 54, price: 1580, amount: 85320, date: '2026-06-18' },
  { id: 'itx-7', ticker: 'BTC', type: 'buy', units: 0.42, price: 52400.0, amount: 22008, date: '2026-04-10', note: 'Initial position' },
  { id: 'itx-8', ticker: 'ETH', type: 'buy', units: 3.5, price: 3120.5, amount: 10921.75, date: '2026-04-22', note: 'Initial position' },
]

const SEED_DIVIDENDS: Dividend[] = [
  { id: 'div-1', ticker: 'AAPL', amount: 145.6, date: '2026-08-15' },
  { id: 'div-2', ticker: 'MSFT', amount: 98.4, date: '2026-07-20' },
  { id: 'div-3', ticker: 'AAPL', amount: 140.2, date: '2026-05-15' },
  { id: 'div-4', ticker: 'NVDA', amount: 32.0, date: '2026-06-01' },
]

const ALLOCATION_COLORS = ['var(--cyan)', 'var(--teal)', 'var(--purple)', 'var(--amber)', 'var(--red)', 'var(--slate-lt)']

/**
 * Reads `useFinance().state.portfolio` (read-only) for the real holding data
 * — tickers, price, units, history — and layers investment-specific mock
 * detail (average cost, sector/asset class, activity, dividends) on top,
 * exposing everything the Investments page needs already derived.
 */
export function useInvestments() {
  const finance = useFinance()
  const holdings = finance.state.portfolio

  const [loggedTransactions, setLoggedTransactions] = useState<InvestmentTransaction[]>([])
  const [deletedTransactionIds, setDeletedTransactionIds] = useState<Set<string>>(new Set())
  const [transactionEdits, setTransactionEdits] = useState<Map<string, Partial<InvestmentTransaction>>>(new Map())
  const nextSeq = useRef(0)

  const enrichedHoldings: EnrichedHolding[] = useMemo(() => {
    const totalMarketValue = holdings.reduce((sum, h) => sum + h.price * h.units, 0) || 1
    return holdings.map((h) => {
      const detail = HOLDING_DETAILS[h.ticker] ?? { ...FALLBACK_DETAIL, ticker: h.ticker }
      const marketValue = h.price * h.units
      const costBasis = detail.averageCost * h.units
      const totalReturn = marketValue - costBasis
      const totalReturnPct = costBasis > 0 ? (totalReturn / costBasis) * 100 : 0
      // changePct is today's % move; back out yesterday's price to get an
      // absolute currency figure for the "Daily Return" column.
      const previousPrice = h.price / (1 + h.changePct / 100)
      const dailyReturn = (h.price - previousPrice) * h.units
      return {
        ticker: h.ticker,
        name: h.name,
        units: h.units,
        price: h.price,
        changePct: h.changePct,
        history: h.history,
        averageCost: detail.averageCost,
        sector: detail.sector,
        assetClass: detail.assetClass,
        marketValue,
        costBasis,
        totalReturn,
        totalReturnPct,
        dailyReturn,
        allocationPct: (marketValue / totalMarketValue) * 100,
      }
    })
  }, [holdings])

  const portfolioValue = useMemo(() => enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0), [enrichedHoldings])
  const totalCostBasis = useMemo(() => enrichedHoldings.reduce((sum, h) => sum + h.costBasis, 0), [enrichedHoldings])
  const totalGainLoss = portfolioValue - totalCostBasis
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0
  const todaysChange = useMemo(() => enrichedHoldings.reduce((sum, h) => sum + h.dailyReturn, 0), [enrichedHoldings])
  const todaysChangePct = useMemo(() => {
    const previousTotal = enrichedHoldings.reduce((sum, h) => sum + (h.price / (1 + h.changePct / 100)) * h.units, 0)
    return previousTotal > 0 ? (todaysChange / previousTotal) * 100 : 0
  }, [enrichedHoldings, todaysChange])

  const allocation: AllocationSlice[] = useMemo(() => {
    const bySector = new Map<string, number>()
    for (const h of enrichedHoldings) {
      bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.marketValue)
    }
    const total = portfolioValue || 1
    return Array.from(bySector.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sector, marketValue], i) => ({
        sector,
        marketValue,
        pct: (marketValue / total) * 100,
        color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
      }))
  }, [enrichedHoldings, portfolioValue])

  // Aggregate performance history: the portfolio's total value at each
  // historical point, built by valuing every holding's own price history at
  // its current unit count. All seeded holdings carry the same number of
  // history points, so this lines up index-for-index.
  const performanceHistory: number[] = useMemo(() => {
    const pointCount = Math.max(0, ...enrichedHoldings.map((h) => h.history.length))
    const points: number[] = []
    for (let i = 0; i < pointCount; i++) {
      let total = 0
      for (const h of enrichedHoldings) {
        const value = h.history[i] ?? h.history[h.history.length - 1] ?? h.price
        total += value * h.units
      }
      points.push(total)
    }
    return points
  }, [enrichedHoldings])

  const transactions = useMemo(
    () =>
      [...(finance.state.investmentActivity?.trades ?? SEED_TRANSACTIONS), ...loggedTransactions]
        .filter((t) => !deletedTransactionIds.has(t.id))
        .map((t) => {
          const edit = transactionEdits.get(t.id)
          return edit ? { ...t, ...edit, amount: (edit.units ?? t.units) * (edit.price ?? t.price) } : t
        })
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [finance.state.investmentActivity, loggedTransactions, deletedTransactionIds, transactionEdits],
  )

  const dividends = finance.state.investmentActivity?.dividends ?? SEED_DIVIDENDS
  const totalDividends = useMemo(() => dividends.reduce((sum, d) => sum + d.amount, 0), [dividends])

  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings])

  // Appends a manually logged buy/sell to the local activity feed. This is a
  // standalone log entry — it does not (and cannot) alter the read-only
  // `Holding` units/price it refers to, since `FinanceState.portfolio` is
  // owned by the finance context, not by this page.
  const logTransaction = useCallback((input: LogInvestmentTransactionInput): void => {
    // A local monotonic counter, not `Date.now()` — nothing here should read
    // the real wall clock (TR-001); this id is never displayed or used in
    // any calculation, only as a React list key.
    nextSeq.current += 1
    const seq = nextSeq.current
    setLoggedTransactions((current) => [
      {
        id: `itx-manual-${seq}`,
        ticker: input.ticker,
        type: input.type,
        units: input.units,
        price: input.price,
        amount: input.units * input.price,
        date: input.date,
        note: input.note,
      },
      ...current,
    ])
  }, [])

  // Edits/deletes work for both seeded and manually-logged rows here — mock
  // mode has no server to reconcile against, so this is purely local
  // overlay state, same pattern as `loggedTransactions` above.
  const editTransaction = useCallback((id: string, patch: { type: InvestmentTransactionType; units: number; price: number; date: string; note?: string }): void => {
    setTransactionEdits((current) => new Map(current).set(id, patch))
  }, [])

  const deleteTransaction = useCallback((id: string): void => {
    setDeletedTransactionIds((current) => new Set(current).add(id))
  }, [])

  return {
    holdings: enrichedHoldings,
    tickers,
    portfolioValue,
    totalGainLoss,
    totalGainLossPct,
    todaysChange,
    todaysChangePct,
    allocation,
    performanceHistory,
    transactions,
    dividends,
    totalDividends,
    logTransaction,
    editTransaction,
    deleteTransaction,
  }
}
