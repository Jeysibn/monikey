/**
 * Portfolio accounting engine — the single authoritative source of
 * investment math for Monikey. Pure domain module: no Fastify, no Prisma
 * client, no React. Every calculation here uses Decimal arithmetic
 * (Prisma.Decimal, which wraps decimal.js) — never native `number` math for
 * money or units — because JS floating point silently loses precision on
 * values like `0.1 + 0.2` and crypto units can carry 8+ decimal places.
 *
 * Cost-basis method: WEIGHTED_AVERAGE_COST. This module intentionally does
 * not implement FIFO/LIFO lot tracking. Monikey's realized/unrealized P&L is
 * portfolio tracking for the user's own visibility, not tax-accounting
 * advice — costs basis, holding periods, and wash-sale rules that a tax
 * authority requires are out of scope.
 *
 * Trades are immutable historical facts (see `Trade`). Everything else in
 * this module — position, cost basis, average cost, realized P&L,
 * unrealized P&L, total return — is *derived* from trade history and
 * current market quotes. Nothing here is persisted as an independently
 * mutable field; recomputing from the same trades must always yield the
 * same answer.
 */
import { Prisma } from '@prisma/client'

export type Decimal = Prisma.Decimal
export const Decimal = Prisma.Decimal
export type DecimalValue = Prisma.Decimal | string | number

export type TradeType = 'buy' | 'sell'

/** A single immutable buy/sell record for one instrument, oldest-first input not required — callers should sort, but `calculatePosition` sorts defensively by `occurredOn` (ties broken by `sequence`, the array index if not given). */
export interface Trade {
  id: string
  instrumentId: string
  type: TradeType
  /** Units traded. High-precision decimal — crypto may be e.g. 0.00238491. */
  units: DecimalValue
  /** Trade price per unit, in minor currency units (e.g. cents). This is the historical price actually paid/received — never overwritten by a later market quote. */
  priceMinor: DecimalValue
  /** Fee charged on this trade, in minor currency units. Added to cost basis on a buy; subtracted from proceeds on a sell. Defaults to 0. */
  feeMinor?: DecimalValue
  occurredOn: Date
}

export interface Dividend {
  instrumentId: string
  amountMinor: DecimalValue
}

/** A market quote for one instrument. Trade price and market price are deliberately separate concepts — see module header. */
export interface Quote {
  instrumentId: string
  priceMinor: DecimalValue
  currencyCode: string
  source: string
  fetchedAt: Date
  /** Whether this quote is older than the asset-specific freshness TTL. Callers (the quote service) compute this — this module only threads it through to the response. */
  stale: boolean
  /** Trailing-24h price move, in the same native currency as priceMinor. Null when the provider doesn't report it (e.g. equities via Alpha Vantage) — never fabricated as 0. Purely a passthrough field; the engine does no arithmetic with it. */
  change24hMinor: DecimalValue | null
  change24hPct: DecimalValue | null
}

export class InvestmentOversellError extends Error {
  readonly code = 'INVESTMENT_OVERSELL' as const
  constructor(
    readonly instrumentId: string,
    readonly heldUnits: Decimal,
    readonly requestedUnits: Decimal,
  ) {
    super(`Cannot sell ${requestedUnits.toString()} units of instrument ${instrumentId}: only ${heldUnits.toString()} held.`)
  }
}

/** Result of applying one SELL trade — the realized P&L breakdown the Activity view needs (see plan §6/§24). */
export interface SellResult {
  tradeId: string
  grossProceedsMinor: Decimal
  feeMinor: Decimal
  netProceedsMinor: Decimal
  allocatedCostBasisMinor: Decimal
  realizedPnlMinor: Decimal
}

/** Running accounting state for one instrument, derived by folding trades in occurredOn order. */
export interface PositionState {
  instrumentId: string
  unitsHeld: Decimal
  /** Remaining weighted-average cost basis of currently-held units. */
  remainingCostBasisMinor: Decimal
  /** Lifetime realized P&L — persists even after unitsHeld reaches 0, and survives being re-bought later (plan §2 "Closed Positions", §31 "Re-buy"). */
  realizedPnlMinor: Decimal
  /** Lifetime fees paid across all buys and sells for this instrument. */
  feesMinor: Decimal
  /** One entry per SELL trade folded so far, in the order applied. */
  sells: SellResult[]
}

function toDecimal(value: DecimalValue): Decimal {
  return value instanceof Decimal ? value : new Decimal(value.toString())
}

function emptyPosition(instrumentId: string): PositionState {
  return {
    instrumentId,
    unitsHeld: new Decimal(0),
    remainingCostBasisMinor: new Decimal(0),
    realizedPnlMinor: new Decimal(0),
    feesMinor: new Decimal(0),
    sells: [],
  }
}

/** Weighted average cost per unit of the currently-held units. Returns 0 when nothing is held (avoids division by zero). */
export function calculateWeightedAverageCost(remainingCostBasisMinor: DecimalValue, unitsHeld: DecimalValue): Decimal {
  const units = toDecimal(unitsHeld)
  if (units.lessThanOrEqualTo(0)) return new Decimal(0)
  return toDecimal(remainingCostBasisMinor).dividedBy(units)
}

/**
 * BUY: units and cost basis both increase. Fee is added to cost basis, so it
 * raises average cost rather than being tracked separately — matches plan §26.
 */
export function applyBuy(state: PositionState, trade: Trade): PositionState {
  const units = toDecimal(trade.units)
  const priceMinor = toDecimal(trade.priceMinor)
  const feeMinor = toDecimal(trade.feeMinor ?? 0)
  const grossCostMinor = units.times(priceMinor)
  return {
    ...state,
    unitsHeld: state.unitsHeld.plus(units),
    remainingCostBasisMinor: state.remainingCostBasisMinor.plus(grossCostMinor).plus(feeMinor),
    feesMinor: state.feesMinor.plus(feeMinor),
  }
}

/**
 * SELL: allocate cost basis at the *pre-sell* weighted average, realize the
 * difference between net proceeds and that allocation, and reduce units/cost
 * basis by exactly the allocated amount — so the average cost of whatever
 * remains is unchanged (module header: weighted-average invariant), aside
 * from rounding. Throws InvestmentOversellError rather than allowing units
 * to go negative (plan §2 "Overselling" — INVESTMENT_OVERSELL is fatal to
 * the attempted trade, never silently clamped).
 */
export function applySell(state: PositionState, trade: Trade): PositionState {
  const units = toDecimal(trade.units)
  if (units.greaterThan(state.unitsHeld)) {
    throw new InvestmentOversellError(state.instrumentId, state.unitsHeld, units)
  }
  const priceMinor = toDecimal(trade.priceMinor)
  const feeMinor = toDecimal(trade.feeMinor ?? 0)
  const averageCostMinor = calculateWeightedAverageCost(state.remainingCostBasisMinor, state.unitsHeld)
  const allocatedCostBasisMinor = averageCostMinor.times(units)
  const grossProceedsMinor = units.times(priceMinor)
  const netProceedsMinor = grossProceedsMinor.minus(feeMinor)
  const realizedPnlMinor = netProceedsMinor.minus(allocatedCostBasisMinor)

  const remainingUnits = state.unitsHeld.minus(units)
  // When the position closes exactly, force cost basis to 0 rather than
  // leaving a rounding residue — a fully sold holding must not carry a
  // dangling non-zero cost basis into a later re-buy (plan §31).
  const remainingCostBasisMinor = remainingUnits.lessThanOrEqualTo(0)
    ? new Decimal(0)
    : Decimal.max(0, state.remainingCostBasisMinor.minus(allocatedCostBasisMinor))

  const sellResult: SellResult = {
    tradeId: trade.id,
    grossProceedsMinor,
    feeMinor,
    netProceedsMinor,
    allocatedCostBasisMinor,
    realizedPnlMinor,
  }

  return {
    ...state,
    unitsHeld: remainingUnits,
    remainingCostBasisMinor,
    realizedPnlMinor: state.realizedPnlMinor.plus(realizedPnlMinor),
    feesMinor: state.feesMinor.plus(feeMinor),
    sells: [...state.sells, sellResult],
  }
}

/**
 * Fold one instrument's trade history (any order) into its current
 * accounting state. This is the only place units/cost basis/realized P&L
 * are computed — never reconstruct them ad hoc elsewhere (plan §5).
 */
export function calculatePosition(instrumentId: string, trades: Trade[]): PositionState {
  const ordered = [...trades].sort((a, b) => a.occurredOn.getTime() - b.occurredOn.getTime())
  let state = emptyPosition(instrumentId)
  for (const trade of ordered) {
    state = trade.type === 'buy' ? applyBuy(state, trade) : applySell(state, trade)
  }
  return state
}

export interface UnrealizedPnl {
  marketValueMinor: Decimal
  unrealizedPnlMinor: Decimal
  /** Null when nothing is held (percent of zero cost basis is undefined) or cost basis is 0. */
  unrealizedPnlPct: Decimal | null
}

/** Unrealized P&L on currently-held units only — market value minus remaining (weighted-average) cost basis. Independent of realized P&L (plan §1 "Unrealized P&L"). */
export function calculateUnrealizedPnL(state: PositionState, marketPriceMinor: DecimalValue): UnrealizedPnl {
  const marketValueMinor = state.unitsHeld.times(toDecimal(marketPriceMinor))
  const unrealizedPnlMinor = marketValueMinor.minus(state.remainingCostBasisMinor)
  const unrealizedPnlPct = state.remainingCostBasisMinor.greaterThan(0)
    ? unrealizedPnlMinor.dividedBy(state.remainingCostBasisMinor).times(100)
    : null
  return { marketValueMinor, unrealizedPnlMinor, unrealizedPnlPct }
}

export interface HoldingResult {
  instrumentId: string
  unitsHeld: Decimal
  averageCostMinor: Decimal
  remainingCostBasisMinor: Decimal
  realizedPnlMinor: Decimal
  dividendsReceivedMinor: Decimal
  feesPaidMinor: Decimal
  sells: SellResult[]
  quote: Quote | null
  marketValueMinor: Decimal | null
  unrealizedPnlMinor: Decimal | null
  unrealizedPnlPct: Decimal | null
}

export interface PortfolioSummary {
  portfolioValueMinor: Decimal
  remainingCostBasisMinor: Decimal
  realizedPnlMinor: Decimal
  unrealizedPnlMinor: Decimal
  dividendsMinor: Decimal
  feesMinor: Decimal
  /** Total Return = Realized P&L + Unrealized P&L + Dividends − Fees (plan §21/§25). Fees are already netted into realized/unrealized P&L per-trade (§26), so this subtraction only removes the double-count for holdings where market value is unavailable and unrealized P&L is therefore excluded — see calculatePortfolioSummary. */
  totalReturnMinor: Decimal
  totalReturnPct: Decimal | null
}

export interface PortfolioResult {
  holdings: HoldingResult[]
  /** Instruments with a fully closed position (unitsHeld = 0) but non-zero lifetime activity — kept out of `holdings`, but their realized P&L/fees/dividends must remain visible (plan §31). */
  closedPositions: HoldingResult[]
  summary: PortfolioSummary
}

/**
 * Top-level entry point: fold every trade per instrument, attach the latest
 * quote (or null if unavailable — never fabricated), and roll everything up
 * into a portfolio summary. Deterministic: same trades + same quotes always
 * produce the same result.
 */
export function calculatePortfolio(trades: Trade[], dividends: Dividend[], quotes: Quote[]): PortfolioResult {
  const tradesByInstrument = new Map<string, Trade[]>()
  for (const trade of trades) {
    const list = tradesByInstrument.get(trade.instrumentId) ?? []
    list.push(trade)
    tradesByInstrument.set(trade.instrumentId, list)
  }

  const dividendsByInstrument = new Map<string, Decimal>()
  for (const dividend of dividends) {
    const current = dividendsByInstrument.get(dividend.instrumentId) ?? new Decimal(0)
    dividendsByInstrument.set(dividend.instrumentId, current.plus(toDecimal(dividend.amountMinor)))
  }

  const quoteByInstrument = new Map<string, Quote>()
  for (const quote of quotes) quoteByInstrument.set(quote.instrumentId, quote)

  const holdings: HoldingResult[] = []
  const closedPositions: HoldingResult[] = []

  let portfolioValueMinor = new Decimal(0)
  let remainingCostBasisMinor = new Decimal(0)
  let realizedPnlMinor = new Decimal(0)
  let unrealizedPnlMinor = new Decimal(0)
  let dividendsMinor = new Decimal(0)
  let feesMinor = new Decimal(0)

  for (const [instrumentId, instrumentTrades] of tradesByInstrument) {
    const position = calculatePosition(instrumentId, instrumentTrades)
    const quote = quoteByInstrument.get(instrumentId) ?? null
    const dividendsReceivedMinor = dividendsByInstrument.get(instrumentId) ?? new Decimal(0)

    const isOpen = position.unitsHeld.greaterThan(0)
    const valuation = isOpen && quote ? calculateUnrealizedPnL(position, quote.priceMinor) : null

    const holding: HoldingResult = {
      instrumentId,
      unitsHeld: position.unitsHeld,
      averageCostMinor: calculateWeightedAverageCost(position.remainingCostBasisMinor, position.unitsHeld),
      remainingCostBasisMinor: position.remainingCostBasisMinor,
      realizedPnlMinor: position.realizedPnlMinor,
      dividendsReceivedMinor,
      feesPaidMinor: position.feesMinor,
      sells: position.sells,
      quote,
      marketValueMinor: valuation?.marketValueMinor ?? null,
      unrealizedPnlMinor: valuation?.unrealizedPnlMinor ?? null,
      unrealizedPnlPct: valuation?.unrealizedPnlPct ?? null,
    }

    if (isOpen) holdings.push(holding)
    else closedPositions.push(holding)

    realizedPnlMinor = realizedPnlMinor.plus(position.realizedPnlMinor)
    dividendsMinor = dividendsMinor.plus(dividendsReceivedMinor)
    feesMinor = feesMinor.plus(position.feesMinor)
    if (isOpen) {
      remainingCostBasisMinor = remainingCostBasisMinor.plus(position.remainingCostBasisMinor)
      if (valuation) {
        portfolioValueMinor = portfolioValueMinor.plus(valuation.marketValueMinor)
        unrealizedPnlMinor = unrealizedPnlMinor.plus(valuation.unrealizedPnlMinor)
      }
    }
  }

  // Dividend-only instruments (no trades on record, e.g. a legacy/manual
  // dividend entry) still contribute to lifetime dividends.
  for (const [instrumentId, amount] of dividendsByInstrument) {
    if (!tradesByInstrument.has(instrumentId)) dividendsMinor = dividendsMinor.plus(amount)
  }

  // Fees are already netted into realizedPnlMinor (sell) and
  // remainingCostBasisMinor→unrealizedPnlMinor (buy), so Total Return does
  // NOT subtract feesMinor again here — doing so would double-count. The
  // `feesMinor` field is still reported standalone for display (plan §21).
  const totalReturn = realizedPnlMinor.plus(unrealizedPnlMinor).plus(dividendsMinor)
  const totalReturnPct = remainingCostBasisMinor.greaterThan(0) ? totalReturn.dividedBy(remainingCostBasisMinor).times(100) : null

  return {
    holdings,
    closedPositions,
    summary: {
      portfolioValueMinor,
      remainingCostBasisMinor,
      realizedPnlMinor,
      unrealizedPnlMinor,
      dividendsMinor,
      feesMinor,
      totalReturnMinor: totalReturn,
      totalReturnPct,
    },
  }
}
