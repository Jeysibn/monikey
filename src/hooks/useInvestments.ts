import { useCallback, useMemo, useRef, useState } from 'react'
import { useFinance } from './useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import type {
  AllocationSlice,
  AssetClass,
  Dividend,
  EnrichedHolding,
  HoldingDetail,
  InvestmentTransaction,
  InvestmentTransactionType,
  LogInvestmentTransactionInput,
} from '../domain/investments'
import type { PortfolioHolding } from '../services/apiInvestmentGateway'

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
  const asyncFinance = useAsyncFinanceOptional()
  const holdings = finance.state.portfolio
  // Authoritative backend portfolio (weighted-avg cost basis, realized/
  // unrealized P&L, dividends, fees) — present whenever a real investment
  // backend is configured. `null` in mock mode, where the client-side
  // fallback below (mock detail + naive market-value math) still applies.
  const portfolio = asyncFinance?.investmentPortfolio ?? null

  const [loggedTransactions, setLoggedTransactions] = useState<InvestmentTransaction[]>([])
  const [deletedTransactionIds, setDeletedTransactionIds] = useState<Set<string>>(new Set())
  const [transactionEdits, setTransactionEdits] = useState<Map<string, Partial<InvestmentTransaction>>>(new Map())
  const nextSeq = useRef(0)

  const toEnrichedHolding = useCallback((h: PortfolioHolding): EnrichedHolding => {
    const averageCost = h.averageCostMinor / 100
    const costBasis = h.costBasisMinor / 100
    // Only ever the backend's own quote — never fabricated from cost basis —
    // so a holding with no cached quote falls back to its average cost only
    // as a last-known reference price, not a claim of current market value.
    const price = h.latestPriceMinor != null ? h.latestPriceMinor / 100 : averageCost
    // Prefer the base-currency (portfolio display currency) figure — already
    // FX-converted server-side — and fall back to the native-currency one
    // only when conversion wasn't possible (h.baseValuationUnavailable) or
    // no quote currency conversion was needed in the first place.
    const marketValueSourceMinor = h.marketValueBaseMinor ?? h.marketValueMinor
    const unrealizedPnlSourceMinor = h.unrealizedPnlBaseMinor ?? h.unrealizedPnlMinor
    const marketValue = marketValueSourceMinor != null ? marketValueSourceMinor / 100 : h.units * price
    const totalReturn = unrealizedPnlSourceMinor != null ? unrealizedPnlSourceMinor / 100 : marketValue - costBasis
    return {
      ticker: h.ticker,
      name: h.name,
      units: h.units,
      price,
      changePct: 0, // day-change is Phase 3 (quote-provider) work — never invented client-side
      history: [price],
      averageCost,
      sector: h.sector,
      assetClass: h.assetClass as AssetClass,
      marketValue,
      costBasis,
      totalReturn,
      totalReturnPct: costBasis > 0 ? (totalReturn / costBasis) * 100 : 0,
      dailyReturn: 0,
      allocationPct: 0, // filled in below once the portfolio total is known
    }
  }, [])

  const backendHoldings: EnrichedHolding[] = useMemo(() => {
    if (!portfolio) return []
    const rows = portfolio.holdings.map(toEnrichedHolding)
    const total = rows.reduce((sum, h) => sum + h.marketValue, 0) || 1
    return rows.map((h) => ({ ...h, allocationPct: (h.marketValue / total) * 100 }))
  }, [portfolio, toEnrichedHolding])

  const mockHoldings: EnrichedHolding[] = useMemo(() => {
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

  const enrichedHoldings = portfolio ? backendHoldings : mockHoldings

  // With a backend portfolio, value/cost basis/gain-loss come straight from
  // the engine's summary rollup (which also folds in closed positions and
  // dividends per plan §3) rather than being re-derived from the visible
  // holdings rows.
  const portfolioValue = useMemo(
    () => portfolio ? portfolio.summary.portfolioValueMinor / 100 : enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0),
    [portfolio, enrichedHoldings],
  )
  const totalCostBasis = useMemo(
    () => portfolio ? portfolio.summary.remainingCostBasisMinor / 100 : enrichedHoldings.reduce((sum, h) => sum + h.costBasis, 0),
    [portfolio, enrichedHoldings],
  )
  const totalGainLoss = portfolio ? portfolio.summary.unrealizedPnlMinor / 100 : portfolioValue - totalCostBasis
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0
  // Day-change (todaysChange/Pct) requires a quote provider's prior-close
  // field, which is Phase 3 work (see `QuoteSnapshot.previousCloseMinor` /
  // `.change24hMinor` on the backend, not yet populated). Reporting 0 here
  // rather than a client-derived guess is deliberate — see plan's ban on
  // treating stock "Today's Change" and crypto "24h Change" as interchangeable.
  const todaysChange = useMemo(() => portfolio ? 0 : enrichedHoldings.reduce((sum, h) => sum + h.dailyReturn, 0), [portfolio, enrichedHoldings])
  const todaysChangePct = useMemo(() => {
    if (portfolio) return 0
    const previousTotal = enrichedHoldings.reduce((sum, h) => sum + (h.price / (1 + h.changePct / 100)) * h.units, 0)
    return previousTotal > 0 ? (todaysChange / previousTotal) * 100 : 0
  }, [portfolio, enrichedHoldings, todaysChange])

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

  // Backend trades carry the authoritative fee/idempotency-key fields the
  // older `investmentActivity` bootstrap shape doesn't; prefer `portfolio`
  // when it's loaded. Falls back to `investmentActivity`/seed data only when
  // no investment backend is configured (mock mode).
  const baseTransactions: InvestmentTransaction[] = useMemo(() => {
    if (portfolio) return portfolio.trades.map((t) => ({ id: t.id, ticker: t.ticker, type: t.type, units: t.units, price: t.priceMinor / 100, amount: t.units * (t.priceMinor / 100), date: t.occurredOn, note: t.note ?? undefined }))
    return finance.state.investmentActivity?.trades ?? SEED_TRANSACTIONS
  }, [portfolio, finance.state.investmentActivity])

  const transactions = useMemo(
    () =>
      [...baseTransactions, ...loggedTransactions]
        .filter((t) => !deletedTransactionIds.has(t.id))
        .map((t) => {
          const edit = transactionEdits.get(t.id)
          return edit ? { ...t, ...edit, amount: (edit.units ?? t.units) * (edit.price ?? t.price) } : t
        })
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [baseTransactions, loggedTransactions, deletedTransactionIds, transactionEdits],
  )

  const [loggedDividends, setLoggedDividends] = useState<Dividend[]>([])

  const dividends: Dividend[] = useMemo(() => {
    if (portfolio) {
      const tickerByInstrumentId = new Map<string, string>()
      for (const h of [...portfolio.holdings, ...portfolio.closedPositions]) tickerByInstrumentId.set(h.instrumentId, h.ticker)
      return portfolio.dividends.map((d) => ({ id: d.id, ticker: tickerByInstrumentId.get(d.instrumentId) ?? d.instrumentId, amount: d.amountMinor / 100, date: d.occurredOn }))
    }
    return [...loggedDividends, ...(finance.state.investmentActivity?.dividends ?? SEED_DIVIDENDS)]
  }, [portfolio, finance.state.investmentActivity, loggedDividends])
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

  // Mock-mode-only local overlay, same pattern as `logTransaction`. When a
  // real backend is configured, the page calls `asyncFinance.addInvestmentDividend`
  // directly instead (see Investments.tsx) — this path never runs there.
  const logDividend = useCallback((input: { ticker: string; amount: number; date: string }): void => {
    nextSeq.current += 1
    const seq = nextSeq.current
    setLoggedDividends((current) => [{ id: `div-manual-${seq}`, ticker: input.ticker, amount: input.amount, date: input.date }, ...current])
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
    logDividend,
    editTransaction,
    deleteTransaction,
  }
}
