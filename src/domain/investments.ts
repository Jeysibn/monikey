// Domain types for the Investments page.
//
// `FinanceState.portfolio` (`Holding[]`, defined in `domain/finance.ts`) is the
// one source of truth for what is actually held — ticker, name, current price,
// units, and a short price history — and this module never redefines it. What
// lives here is purely investment-specific detail that `Holding` doesn't
// carry: cost basis, sector/asset-class classification, and the transaction/
// dividend activity behind a position. `useInvestments` is the only place
// that layers mock values against these types — this file is types only.

/** How a holding is classified for the Asset Allocation breakdown. */
export type AssetClass = 'equity' | 'etf' | 'crypto' | 'reit' | 'bond'

/**
 * Per-ticker detail layered onto a `Holding` from `FinanceState.portfolio`.
 * `averageCost` is the average price paid per unit (cost basis per unit),
 * used to derive total return alongside the holding's current price.
 */
export interface HoldingDetail {
  ticker: string
  averageCost: number
  sector: string
  assetClass: AssetClass
}

/**
 * A `Holding` merged with its `HoldingDetail`, plus every value derived from
 * the two — market value, cost basis, total return, daily return, and share
 * of the total portfolio. This is the shape the Holdings table renders one
 * row from, computed once in `useInvestments` so the page never repeats the
 * arithmetic per render.
 */
export interface EnrichedHolding {
  ticker: string
  name: string
  units: number
  price: number
  changePct: number
  history: number[]
  averageCost: number
  sector: string
  assetClass: AssetClass
  /** `price * units`. */
  marketValue: number
  /** `averageCost * units`. */
  costBasis: number
  /** `marketValue - costBasis`. */
  totalReturn: number
  /** `totalReturn / costBasis * 100`. */
  totalReturnPct: number
  /** Today's price move in currency: `(price - previousPrice) * units`. */
  dailyReturn: number
  /** This holding's share of total portfolio market value, 0–100. */
  allocationPct: number
}

/** One slice of the Asset Allocation breakdown (grouped by sector). */
export interface AllocationSlice {
  sector: string
  marketValue: number
  pct: number
  color: string
}

export type InvestmentTransactionType = 'buy' | 'sell'

/**
 * One entry in the Investment Transactions activity feed — a manually
 * logged buy/sell, or a seeded mock entry. `date` is a strict `YYYY-MM-DD`
 * (see `utils/date.ts`). This is a standalone activity log: logging one here
 * does not change the read-only `Holding` units/price it refers to.
 */
export interface InvestmentTransaction {
  id: string
  ticker: string
  type: InvestmentTransactionType
  units: number
  price: number
  /** `units * price`, for display. */
  amount: number
  date: string
  note?: string
}

/** Input for manually logging a buy/sell against a held ticker. */
export interface LogInvestmentTransactionInput {
  ticker: string
  type: InvestmentTransactionType
  units: number
  price: number
  date: string
  note?: string
}

/** A dividend payout recorded against a held ticker. */
export interface Dividend {
  id: string
  ticker: string
  amount: number
  date: string
}
