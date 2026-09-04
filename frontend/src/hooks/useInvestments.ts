import { useCallback, useMemo, useRef, useState } from 'react'
import { useFinance } from './useFinance'
import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import type {
  AllocationSlice,
  AssetClass,
  ClosedPosition,
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
  // Non-null only when a real investment backend is configured AND its most
  // recent fetch failed. Distinguishes "mock mode" (no backend at all, where
  // falling back to `mockHoldings` below is intended) from "backend
  // configured but currently unreachable" (where the same fallback is a
  // last resort, not the normal path, and the page must say so).
  const portfolioError = asyncFinance?.investmentPortfolioError ?? null
  const retryPortfolio = asyncFinance?.retryInvestmentPortfolio

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
    // Bug: this used to read `h.latestPriceMinor` directly, which is the
    // RAW native-currency quote price (e.g. USD cents for crypto) with no
    // FX conversion — displayed here with the portfolio's base-currency (₱)
    // symbol, e.g. showing "₱1.36" for an XRP quote that was actually
    // $1.36. Prefer the base-converted figure (null when conversion wasn't
    // possible) and fall back to the native one only then.
    const latestPriceSourceMinor = h.latestPriceBaseMinor ?? h.latestPriceMinor
    const price = latestPriceSourceMinor != null ? latestPriceSourceMinor / 100 : averageCost
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
      // Trailing-24h % move (CoinGecko's `usd_24h_change`, threaded through
      // the backend) — 0 only as a genuine "no data yet" fallback, since
      // EnrichedHolding.changePct isn't nullable; the KPI-level daily-change
      // total (see todaysChange below) correctly distinguishes "no data"
      // from "flat 0%" instead.
      changePct: h.change24hPct ?? 0,
      history: [price],
      averageCost,
      sector: h.sector,
      assetClass: h.assetClass as AssetClass,
      marketValue,
      costBasis,
      totalReturn,
      totalReturnPct: costBasis > 0 ? (totalReturn / costBasis) * 100 : 0,
      dailyReturn: h.dailyChangeBaseMinor != null ? h.dailyChangeBaseMinor / 100 : 0,
      allocationPct: 0, // filled in below once the portfolio total is known
    }
  }, [])

  const backendHoldings: EnrichedHolding[] = useMemo(() => {
    if (!portfolio) return []
    const rows = portfolio.holdings.map(toEnrichedHolding)
    const total = rows.reduce((sum, h) => sum + h.marketValue, 0) || 1
    return rows.map((h) => ({ ...h, allocationPct: (h.marketValue / total) * 100 }))
  }, [portfolio, toEnrichedHolding])

  // Fully-exited positions (units held = 0) — kept out of the live Holdings
  // table by the backend (see PortfolioResult.closedPositions), but their
  // realized P&L shouldn't just vanish once the last unit sells, e.g. the
  // XRP round-trip that motivated this: buy @₱1, sell @₱78, a real ₱77 gain
  // that used to disappear entirely from the page. `costBasisMinor` on a
  // closed position is forced to 0 by the engine (plan §31 — no dangling
  // cost basis carried into a future re-buy of the same ticker), so it
  // can't be used as the %-return denominator; total cost basis ever
  // allocated (sum of every buy's gross + fee) is recomputed here from the
  // raw trade history instead.
  const closedPositions: ClosedPosition[] = useMemo(() => {
    if (!portfolio) return []
    const totalBoughtMinorByInstrument = new Map<string, number>()
    for (const t of portfolio.trades) {
      if (t.type !== 'buy') continue
      const grossMinor = t.units * t.priceMinor + t.feeMinor
      totalBoughtMinorByInstrument.set(t.instrumentId, (totalBoughtMinorByInstrument.get(t.instrumentId) ?? 0) + grossMinor)
    }
    return portfolio.closedPositions.map((h) => {
      const realizedPnl = h.realizedPnlMinor / 100
      const totalBoughtMinor = totalBoughtMinorByInstrument.get(h.instrumentId) ?? 0
      return {
        ticker: h.ticker,
        name: h.name,
        sector: h.sector,
        assetClass: h.assetClass as AssetClass,
        realizedPnl,
        realizedPnlPct: totalBoughtMinor > 0 ? (realizedPnl / (totalBoughtMinor / 100)) * 100 : null,
        dividendsReceived: h.dividendsReceivedMinor / 100,
        feesPaid: h.feesPaidMinor / 100,
      }
    })
  }, [portfolio])

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
  // Bug: this used to read summary.unrealizedPnlMinor, which is 0 for any
  // fully-closed position (unitsHeld = 0 has no unrealized P&L by
  // definition — see calculatePortfolio) — so selling out of a position
  // entirely made its realized gain/loss vanish from the top "Total
  // Gain/Loss" KPI, e.g. buying XRP @₱1 and selling @₱78 (a real ₱77 gain)
  // showed "₱0.00 / +0.00%". totalReturnMinor already folds realized +
  // unrealized + dividends together (see the engine's doc comment on
  // PortfolioSummary) and is what every other portfolio app (Coinbase,
  // Binance, CoinStats) means by an all-time "total P&L" figure — use that.
  const totalGainLoss = portfolio ? portfolio.summary.totalReturnMinor / 100 : portfolioValue - totalCostBasis
  const totalGainLossPct = portfolio
    ? (portfolio.summary.totalReturnPct ?? 0)
    : totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0
  // Now backed by the quote provider's 24h-change field (CoinGecko's
  // `usd_24h_change`, threaded through as summary.todaysChangeMinor/Pct —
  // see investments.routes.ts). Null there means "no holding has 24h data
  // yet" (e.g. an all-equity portfolio, or before the worker's first
  // refresh) — reported as 0 here since the KPI card isn't nullable, same
  // convention as totalGainLossPct above.
  const todaysChange = portfolio ? (portfolio.summary.todaysChangeMinor ?? 0) / 100 : enrichedHoldings.reduce((sum, h) => sum + h.dailyReturn, 0)
  const todaysChangePct = useMemo(() => {
    if (portfolio) return portfolio.summary.todaysChangePct ?? 0
    const previousTotal = enrichedHoldings.reduce((sum, h) => sum + (h.price / (1 + h.changePct / 100)) * h.units, 0)
    return previousTotal > 0 ? (todaysChange / previousTotal) * 100 : 0
  }, [portfolio, enrichedHoldings, todaysChange])

  // Top Gainer / Top Loser callout — a staple of every tracker's overview
  // (Delta, CoinStats) surfacing which position moved most today, so a user
  // doesn't have to scan the whole Holdings table to spot it. null when
  // there's nothing to rank (no holdings at all).
  const bestPerformer = useMemo(
    () => enrichedHoldings.length === 0 ? null : enrichedHoldings.reduce((best, h) => (h.changePct > best.changePct ? h : best)),
    [enrichedHoldings],
  )
  const worstPerformer = useMemo(
    () => enrichedHoldings.length === 0 ? null : enrichedHoldings.reduce((worst, h) => (h.changePct < worst.changePct ? h : worst)),
    [enrichedHoldings],
  )

  const allocation: AllocationSlice[] = useMemo(() => {
    const bySector = new Map<string, number>()
    for (const h of enrichedHoldings) {
      bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.marketValue)
    }
    // Bug: falling back to a bare `1` when the authoritative portfolioValue
    // is 0 (e.g. a brand-new holding with no quote fetched yet, so the
    // backend correctly reports it as worth nothing yet) divided a real
    // per-holding marketValue — still shown per-row as a last-known
    // reference price, see toEnrichedHolding above — by 1 instead of by the
    // total actually being displayed, producing a percentage in the
    // billions instead of a sane one. Sum the sector values actually being
    // rendered instead, so the percentages shown always relate to each
    // other correctly regardless of whether the authoritative total lags.
    const displayedTotal = Array.from(bySector.values()).reduce((sum, v) => sum + v, 0)
    const total = portfolioValue || displayedTotal || 1
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

  // Bug: this used to read the raw mock `holdings` (finance.state.portfolio)
  // instead of `enrichedHoldings`, so in backend mode the ticker dropdown
  // always showed the mock fixture's tickers (AAPL/AMZN/MSFT/NVDA) and never
  // the user's real backend holdings — logging a trade against an existing
  // ticker the dropdown couldn't show forced free-text re-entry, which could
  // then trip the INSTRUMENT_METADATA_MISMATCH guard on a harmless
  // casing/wording difference. Also fold in closed positions (fully sold,
  // net zero units) so a since-closed ticker is still offered rather than
  // silently disappearing from the list it was created under.
  const tickers = useMemo(() => {
    if (portfolio) return [...new Set([...portfolio.holdings, ...portfolio.closedPositions].map((h) => h.ticker))]
    return enrichedHoldings.map((h) => h.ticker)
  }, [portfolio, enrichedHoldings])

  // Bug: the caller (Investments.tsx's handleLog) used to look up an
  // existing ticker's name/assetClass/sector only in `enrichedHoldings`
  // (open positions), then fall back to generic defaults ('equity', 'Other')
  // when not found. A fully-sold (closed) position — or any ticker the
  // dropdown didn't happen to include — fell through to those defaults,
  // which then almost always mismatched the instrument's real, previously
  // recorded metadata and tripped the backend's INSTRUMENT_METADATA_MISMATCH
  // guard on a perfectly legitimate re-buy. Covers closed positions too, so
  // the real recorded details are always used when they exist.
  const instrumentMetadataByTicker = useMemo(() => {
    const map = new Map<string, { name: string; assetClass: AssetClass; sector: string }>()
    if (portfolio) {
      for (const h of [...portfolio.holdings, ...portfolio.closedPositions]) map.set(h.ticker, { name: h.name, assetClass: h.assetClass as AssetClass, sector: h.sector })
    } else {
      for (const h of enrichedHoldings) map.set(h.ticker, { name: h.name, assetClass: h.assetClass, sector: h.sector })
    }
    return map
  }, [portfolio, enrichedHoldings])

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
    closedPositions,
    tickers,
    instrumentMetadataByTicker,
    portfolioValue,
    totalGainLoss,
    totalGainLossPct,
    todaysChange,
    todaysChangePct,
    bestPerformer,
    worstPerformer,
    allocation,
    performanceHistory,
    transactions,
    dividends,
    totalDividends,
    logTransaction,
    logDividend,
    editTransaction,
    deleteTransaction,
    // Set only when a real backend is configured and its most recent
    // portfolio fetch failed — never in mock mode. `usingFallbackData` is
    // true whenever the figures above are NOT the authoritative backend
    // portfolio, so the page can warn that they're an approximation.
    portfolioError,
    usingFallbackData: portfolio === null,
    retryPortfolio,
  }
}
