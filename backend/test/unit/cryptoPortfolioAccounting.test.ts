import { describe, expect, it } from 'vitest'
import {
  CryptoLocationInsufficientUnitsError,
  CryptoTransferSameLocationError,
  CryptoInsufficientUnitsError,
  calculateCryptoPosition,
  calculateCryptoLocationBalances,
  totalTransferFeeUnits,
} from '../../src/modules/investments/cryptoPortfolioAccounting.js'
import { Decimal } from '../../src/modules/investments/portfolioAccounting.js'

const at = (time: string) => new Date(`2026-09-09T${time}Z`)
// Persistence order, independent of occurredAt: event `n` was the nth row written.
const created = (n: number) => new Date(`2026-01-01T00:00:${String(n).padStart(2, '0')}Z`)

describe('crypto location accounting', () => {
  it('moves principal between locations and removes only the network fee from total holdings', () => {
    const balances = calculateCryptoLocationBalances(
      [{ id: 'buy', type: 'buy', locationId: 'binance', units: '0.01000', occurredAt: at('01:00:00'), createdAt: created(1) }],
      [{ id: 'transfer', fromLocationId: 'binance', toLocationId: 'ledger', units: '0.00500', networkFeeUnits: '0.00002', occurredAt: at('02:00:00'), createdAt: created(2) }],
    )
    expect(balances.get('binance')!.toString()).toBe('0.00498')
    expect(balances.get('ledger')!.toString()).toBe('0.005')
    expect([...balances.values()].reduce((sum, value) => sum.plus(value), new Decimal(0)).toString()).toBe('0.00998')
  })

  it('rejects a transfer that exceeds the selected source location', () => {
    expect(() => calculateCryptoLocationBalances(
      [{ id: 'buy', type: 'buy', locationId: 'binance', units: '1', occurredAt: at('01:00:00'), createdAt: created(1) }],
      [{ id: 'transfer', fromLocationId: 'binance', toLocationId: 'ledger', units: '1', networkFeeUnits: '0.01', occurredAt: at('02:00:00'), createdAt: created(2) }],
    )).toThrow(CryptoLocationInsufficientUnitsError)
  })

  it('rejects a sell that exceeds the selected location even when another location holds units', () => {
    expect(() => calculateCryptoLocationBalances([
      { id: 'binance-buy', type: 'buy', locationId: 'binance', units: '1', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'ledger-buy', type: 'buy', locationId: 'ledger', units: '1', occurredAt: at('02:00:00'), createdAt: created(2) },
      { id: 'binance-sell', type: 'sell', locationId: 'binance', units: '1.1', occurredAt: at('03:00:00'), createdAt: created(3) },
    ], [])).toThrow(CryptoLocationInsufficientUnitsError)
  })

  it('rejects a same-location transfer and sums high-precision fees exactly', () => {
    expect(() => calculateCryptoLocationBalances([], [{ id: 'same', fromLocationId: 'ledger', toLocationId: 'ledger', units: '1', networkFeeUnits: '0', occurredAt: at('01:00:00'), createdAt: created(1) }]))
      .toThrow(CryptoTransferSameLocationError)
    expect(totalTransferFeeUnits([
      { id: 'a', fromLocationId: 'a', toLocationId: 'b', units: '1', networkFeeUnits: '0.000000000000000001', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'b', fromLocationId: 'a', toLocationId: 'b', units: '1', networkFeeUnits: '0.000000000000000002', occurredAt: at('02:00:00'), createdAt: created(2) },
    ]).equals('0.000000000000000003')).toBe(true)
  })

  it('orders same-timestamp trade and transfer activity by persistence order, never by random id', () => {
    // Both events are recorded at the identical minute. The buy was actually
    // submitted (and thus persisted) first; a lexical id sort could put a
    // random UUID for the transfer ahead of the buy and reject it for
    // insufficient units even though the user's real sequence is valid.
    const sameMinute = at('09:15:00')
    const balances = calculateCryptoLocationBalances(
      [{ id: 'zzz-buy', type: 'buy', locationId: 'binance', units: '0.01', occurredAt: sameMinute, createdAt: created(1) }],
      [{ id: 'aaa-transfer', fromLocationId: 'binance', toLocationId: 'ledger', units: '0.005', networkFeeUnits: '0', occurredAt: sameMinute, createdAt: created(2) }],
    )
    expect(balances.get('binance')!.toString()).toBe('0.005')
    expect(balances.get('ledger')!.toString()).toBe('0.005')
  })
})

describe('crypto portfolio accounting — total invested (P&L % denominator)', () => {
  it('keeps totalInvestedBase nonzero for a fully-closed position, so total-return % is never hidden behind a null', () => {
    const position = calculateCryptoPosition([
      { id: 'buy', type: 'buy', units: '1', priceAmount: '100', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'sell', type: 'sell', units: '1', priceAmount: '150', feeAmount: '0', fxRateToBase: '1', occurredAt: at('02:00:00'), createdAt: created(2) },
    ])
    // Fully closed: remaining cost basis is (correctly) zero, but the coin
    // was profitable — totalInvestedBase must still reflect the original
    // $100 spent so realizedPnlBase(50)/totalInvestedBase(100) = 50%.
    expect(position.units.toString()).toBe('0')
    expect(position.costBasisBase.toString()).toBe('0')
    expect(position.realizedPnlBase.toString()).toBe('50')
    expect(position.totalInvestedBase.toString()).toBe('100')
  })

  it('accumulates totalInvestedBase across multiple DCA buys, unaffected by a later partial sell', () => {
    const position = calculateCryptoPosition([
      { id: 'buy-1', type: 'buy', units: '1', priceAmount: '100', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'buy-2', type: 'buy', units: '1', priceAmount: '200', feeAmount: '0', fxRateToBase: '1', occurredAt: at('02:00:00'), createdAt: created(2) },
      { id: 'sell', type: 'sell', units: '1', priceAmount: '250', feeAmount: '0', fxRateToBase: '1', occurredAt: at('03:00:00'), createdAt: created(3) },
    ])
    // Total invested = 100 + 200 = 300, regardless of the partial sell.
    expect(position.totalInvestedBase.toString()).toBe('300')
    // Remaining cost basis reflects only the unsold unit (average cost 150).
    expect(position.costBasisBase.toString()).toBe('150')
  })

  it('adds a rebuy to totalInvestedBase after a full sell-then-rebuy cycle', () => {
    const position = calculateCryptoPosition([
      { id: 'buy-1', type: 'buy', units: '1', priceAmount: '100', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'sell', type: 'sell', units: '1', priceAmount: '120', feeAmount: '0', fxRateToBase: '1', occurredAt: at('02:00:00'), createdAt: created(2) },
      { id: 'buy-2', type: 'buy', units: '1', priceAmount: '90', feeAmount: '0', fxRateToBase: '1', occurredAt: at('03:00:00'), createdAt: created(3) },
    ])
    expect(position.totalInvestedBase.toString()).toBe('190')
    expect(position.costBasisBase.toString()).toBe('90')
    expect(position.realizedPnlBase.toString()).toBe('20')
  })
})

describe('crypto portfolio accounting', () => {
  it('uses historical FX and weighted average cost for DCA and a partial sell', () => {
    const position = calculateCryptoPosition([
      { id: 'buy-1', type: 'buy', units: '0.001', priceAmount: '100000', feeAmount: '1', fxRateToBase: '57', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'buy-2', type: 'buy', units: '0.001', priceAmount: '120000', feeAmount: '1', fxRateToBase: '56', occurredAt: at('02:00:00'), createdAt: created(2) },
      { id: 'sell', type: 'sell', units: '0.0005', priceAmount: '130000', feeAmount: '1', fxRateToBase: '55', occurredAt: at('03:00:00'), createdAt: created(3) },
    ])
    // Purchase cost: 5,757 + 6,776; sell proceeds: 3,520.
    expect(position.units.toString()).toBe('0.0015')
    expect(position.costBasisBase.toString()).toBe('9399.75')
    expect(position.realizedPnlBase.toString()).toBe('386.75')
  })

  it('rejects an oversell without silently clamping balances', () => {
    expect(() => calculateCryptoPosition([
      { id: 'buy', type: 'buy', units: '1', priceAmount: '1', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00'), createdAt: created(1) },
      { id: 'sell', type: 'sell', units: '1.000000000000000001', priceAmount: '1', feeAmount: '0', fxRateToBase: '1', occurredAt: at('02:00:00'), createdAt: created(2) },
    ])).toThrow(CryptoInsufficientUnitsError)
  })

  it('treats a coin-denominated network fee as a zero-proceeds disposal, not a transfer sale', () => {
    const position = calculateCryptoPosition(
      [{ id: 'buy', type: 'buy', units: '1', priceAmount: '100', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00'), createdAt: created(1) }],
      [{ id: 'fee', networkFeeUnits: '0.01', occurredAt: at('02:00:00'), createdAt: created(2) }],
    )
    expect(position.units.toString()).toBe('0.99')
    expect(position.costBasisBase.toString()).toBe('99')
    expect(position.realizedPnlBase.toString()).toBe('-1')
  })

  it('orders a same-timestamp BUY then SELL by persistence order, so the sell never appears to run before its buy', () => {
    const sameMinute = at('09:15:00')
    // Deliberately give the sell a lexically smaller id than the buy so a
    // random-UUID tiebreak would (incorrectly) evaluate it first and throw.
    const position = calculateCryptoPosition([
      { id: 'sell-id-comes-first-alphabetically', type: 'sell', units: '0.005', priceAmount: '100000', feeAmount: '0', fxRateToBase: '1', occurredAt: sameMinute, createdAt: created(2) },
      { id: 'zzz-buy', type: 'buy', units: '0.01', priceAmount: '90000', feeAmount: '0', fxRateToBase: '1', occurredAt: sameMinute, createdAt: created(1) },
    ])
    expect(position.units.toString()).toBe('0.005')
    expect(position.realizedPnlBase.toString()).toBe('50')
  })

  it('orders same-timestamp BUY + BUY + SELL deterministically by persistence order', () => {
    const sameMinute = at('09:15:00')
    const events = [
      { id: 'c-sell', type: 'sell' as const, units: '0.001', priceAmount: '100000', feeAmount: '0', fxRateToBase: '1', occurredAt: sameMinute, createdAt: created(3) },
      { id: 'a-buy', type: 'buy' as const, units: '0.001', priceAmount: '80000', feeAmount: '0', fxRateToBase: '1', occurredAt: sameMinute, createdAt: created(1) },
      { id: 'b-buy', type: 'buy' as const, units: '0.001', priceAmount: '90000', feeAmount: '0', fxRateToBase: '1', occurredAt: sameMinute, createdAt: created(2) },
    ]
    const first = calculateCryptoPosition(events)
    // Recalculating from a persisted (already-sorted) read must reproduce the
    // identical result regardless of the array's incoming order.
    const second = calculateCryptoPosition([...events].reverse())
    expect(first.units.toString()).toBe(second.units.toString())
    expect(first.realizedPnlBase.toString()).toBe(second.realizedPnlBase.toString())
    expect(first.units.toString()).toBe('0.001')
  })
})
