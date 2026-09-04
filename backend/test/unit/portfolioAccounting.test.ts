import { describe, expect, it } from 'vitest'
import {
  Decimal,
  InvestmentOversellError,
  applyBuy,
  applySell,
  calculatePortfolio,
  calculatePosition,
  calculateUnrealizedPnL,
  calculateWeightedAverageCost,
  type DecimalValue,
  type Trade,
} from '../../src/modules/investments/portfolioAccounting.js'

const AAPL = 'instrument-aapl'
const d = (v: DecimalValue) => new Decimal(v)

function trade(overrides: Partial<Trade> & Pick<Trade, 'id' | 'type' | 'units' | 'priceMinor' | 'occurredOn'>): Trade {
  return { instrumentId: AAPL, feeMinor: 0, ...overrides }
}

describe('portfolioAccounting — mandatory P&L scenario (plan §3)', () => {
  it('computes weighted average cost after two buys', () => {
    const trades = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'buy', units: 5, priceMinor: 12000, occurredOn: new Date('2026-01-02') }),
    ]
    const position = calculatePosition(AAPL, trades)
    expect(position.unitsHeld.toNumber()).toBe(15)
    expect(position.remainingCostBasisMinor.toNumber()).toBe(160000) // $1,600.00 in cents
    expect(calculateWeightedAverageCost(position.remainingCostBasisMinor, position.unitsHeld).toDecimalPlaces(2).toNumber()).toBeCloseTo(10666.67, 1) // $106.6667 in cents
  })

  it('computes realized P&L and remaining position after a partial sell, without fees', () => {
    const trades = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'buy', units: 5, priceMinor: 12000, occurredOn: new Date('2026-01-02') }),
      trade({ id: 't3', type: 'sell', units: 8, priceMinor: 13000, occurredOn: new Date('2026-01-03') }),
    ]
    const position = calculatePosition(AAPL, trades)
    const sell = position.sells[0]!

    expect(sell.grossProceedsMinor.toNumber()).toBe(104000) // $1,040.00
    expect(sell.allocatedCostBasisMinor.toDecimalPlaces(2).toNumber()).toBeCloseTo(85333.33, 1) // ≈ $853.33
    expect(sell.realizedPnlMinor.toDecimalPlaces(2).toNumber()).toBeCloseTo(18666.67, 1) // ≈ +$186.67

    expect(position.unitsHeld.toNumber()).toBe(7)
    expect(position.remainingCostBasisMinor.toDecimalPlaces(2).toNumber()).toBeCloseTo(74666.67, 1) // ≈ $746.67
    expect(calculateWeightedAverageCost(position.remainingCostBasisMinor, position.unitsHeld).toDecimalPlaces(2).toNumber()).toBeCloseTo(10666.67, 1) // average cost unchanged by the sell
  })

  it('reports independent unrealized and realized P&L at a later market price', () => {
    const trades = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'buy', units: 5, priceMinor: 12000, occurredOn: new Date('2026-01-02') }),
      trade({ id: 't3', type: 'sell', units: 8, priceMinor: 13000, occurredOn: new Date('2026-01-03') }),
    ]
    const position = calculatePosition(AAPL, trades)
    const { marketValueMinor, unrealizedPnlMinor } = calculateUnrealizedPnL(position, 12500)

    expect(marketValueMinor.toNumber()).toBe(87500) // $875.00
    expect(unrealizedPnlMinor.toDecimalPlaces(2).toNumber()).toBeCloseTo(12833.33, 1) // ≈ +$128.33
    expect(position.realizedPnlMinor.toDecimalPlaces(2).toNumber()).toBeCloseTo(18666.67, 1) // realized P&L unchanged by market movement
  })

  it('keeps the previously realized P&L after selling the remaining units', () => {
    const trades = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'buy', units: 5, priceMinor: 12000, occurredOn: new Date('2026-01-02') }),
      trade({ id: 't3', type: 'sell', units: 8, priceMinor: 13000, occurredOn: new Date('2026-01-03') }),
      trade({ id: 't4', type: 'sell', units: 7, priceMinor: 12500, occurredOn: new Date('2026-01-04') }),
    ]
    const position = calculatePosition(AAPL, trades)
    expect(position.unitsHeld.toNumber()).toBe(0)
    expect(position.remainingCostBasisMinor.toNumber()).toBe(0)
    // first sell's ~+186.67 must still be included in the lifetime total
    expect(position.realizedPnlMinor.toDecimalPlaces(2).toNumber()).toBeGreaterThan(18666)
    expect(position.sells).toHaveLength(2)
  })
})

describe('portfolioAccounting — fees (plan §26)', () => {
  it('adds buy fee to cost basis', () => {
    const trades = [trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, feeMinor: 500, occurredOn: new Date('2026-01-01') })]
    const position = calculatePosition(AAPL, trades)
    expect(position.remainingCostBasisMinor.toNumber()).toBe(100500) // $1,005.00
  })

  it('subtracts sell fee from proceeds before computing realized P&L', () => {
    const trades = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'sell', units: 10, priceMinor: 12000, feeMinor: 500, occurredOn: new Date('2026-01-02') }),
    ]
    const position = calculatePosition(AAPL, trades)
    const sell = position.sells[0]!
    expect(sell.netProceedsMinor.toNumber()).toBe(119500) // $1,195.00
    expect(sell.realizedPnlMinor.toNumber()).toBe(19500) // $195.00, not $200
  })
})

describe('portfolioAccounting — oversell (plan §2)', () => {
  it('throws InvestmentOversellError rather than allowing negative units', () => {
    const state = applyBuy(
      { instrumentId: AAPL, unitsHeld: d(0), remainingCostBasisMinor: d(0), realizedPnlMinor: d(0), feesMinor: d(0), sells: [] },
      trade({ id: 't1', type: 'buy', units: 5, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
    )
    expect(() =>
      applySell(state, trade({ id: 't2', type: 'sell', units: 6, priceMinor: 11000, occurredOn: new Date('2026-01-02') })),
    ).toThrow(InvestmentOversellError)
  })
})

describe('portfolioAccounting — closed position + re-buy (plan §31)', () => {
  it('closes the position to zero units but keeps realized P&L, then starts a fresh cost basis on re-buy', () => {
    const trades = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'sell', units: 10, priceMinor: 15000, occurredOn: new Date('2026-01-02') }),
    ]
    const closed = calculatePosition(AAPL, trades)
    expect(closed.unitsHeld.toNumber()).toBe(0)
    expect(closed.remainingCostBasisMinor.toNumber()).toBe(0)
    expect(closed.realizedPnlMinor.toNumber()).toBe(50000) // $500 lifetime realized gain

    const rebought = calculatePosition(AAPL, [
      ...trades,
      trade({ id: 't3', type: 'buy', units: 4, priceMinor: 20000, occurredOn: new Date('2026-01-03') }),
    ])
    expect(rebought.unitsHeld.toNumber()).toBe(4)
    expect(rebought.remainingCostBasisMinor.toNumber()).toBe(80000) // new cost basis starts fresh from the new buy
    expect(rebought.realizedPnlMinor.toNumber()).toBe(50000) // prior realized gain preserved
  })
})

describe('portfolioAccounting — crypto precision', () => {
  it('retains fractional units without destructive rounding', () => {
    const BTC = 'instrument-btc'
    const trades: Trade[] = [
      { id: 't1', instrumentId: BTC, type: 'buy', units: '0.0012345678', priceMinor: 6_800_000, occurredOn: new Date('2026-01-01') },
      { id: 't2', instrumentId: BTC, type: 'sell', units: '0.0002345678', priceMinor: 7_385_000, occurredOn: new Date('2026-01-02') },
    ]
    const position = calculatePosition(BTC, trades)
    expect(position.unitsHeld.toString()).toBe('0.001')
    expect(position.sells[0]!.grossProceedsMinor.toDecimalPlaces(4).toNumber()).toBeCloseTo(0.0002345678 * 7_385_000, 2)
  })
})

describe('calculatePortfolio', () => {
  it('excludes closed positions from holdings but keeps them queryable, and rolls up a portfolio summary', () => {
    const trades: Trade[] = [
      trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') }),
      trade({ id: 't2', type: 'sell', units: 10, priceMinor: 15000, occurredOn: new Date('2026-01-02') }),
      { id: 't3', instrumentId: 'instrument-msft', type: 'buy', units: 5, priceMinor: 20000, occurredOn: new Date('2026-01-03') },
    ]
    const dividends = [{ instrumentId: 'instrument-msft', amountMinor: 1000 }]
    const quotes = [{ instrumentId: 'instrument-msft', priceMinor: 22000, currencyCode: 'USD', source: 'alpha_vantage', fetchedAt: new Date(), stale: false }]

    const result = calculatePortfolio(trades, dividends, quotes)

    expect(result.holdings).toHaveLength(1)
    expect(result.holdings[0]!.instrumentId).toBe('instrument-msft')
    expect(result.closedPositions).toHaveLength(1)
    expect(result.closedPositions[0]!.realizedPnlMinor.toNumber()).toBe(50000)

    expect(result.summary.realizedPnlMinor.toNumber()).toBe(50000)
    expect(result.summary.dividendsMinor.toNumber()).toBe(1000)
    expect(result.summary.portfolioValueMinor.toNumber()).toBe(110000) // 5 * 22000
    expect(result.summary.unrealizedPnlMinor.toNumber()).toBe(10000) // 110000 - 100000
    expect(result.summary.totalReturnMinor.toNumber()).toBe(61000) // 50000 + 10000 + 1000
  })

  it('never fabricates a market value when no quote is available', () => {
    const trades: Trade[] = [trade({ id: 't1', type: 'buy', units: 10, priceMinor: 10000, occurredOn: new Date('2026-01-01') })]
    const result = calculatePortfolio(trades, [], [])
    expect(result.holdings[0]!.quote).toBeNull()
    expect(result.holdings[0]!.marketValueMinor).toBeNull()
    expect(result.holdings[0]!.unrealizedPnlMinor).toBeNull()
  })
})
