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

describe('crypto location accounting', () => {
  it('moves principal between locations and removes only the network fee from total holdings', () => {
    const balances = calculateCryptoLocationBalances(
      [{ id: 'buy', type: 'buy', locationId: 'binance', units: '0.01000', occurredAt: at('01:00:00') }],
      [{ id: 'transfer', fromLocationId: 'binance', toLocationId: 'ledger', units: '0.00500', networkFeeUnits: '0.00002', occurredAt: at('02:00:00') }],
    )
    expect(balances.get('binance')!.toString()).toBe('0.00498')
    expect(balances.get('ledger')!.toString()).toBe('0.005')
    expect([...balances.values()].reduce((sum, value) => sum.plus(value), new Decimal(0)).toString()).toBe('0.00998')
  })

  it('rejects a transfer that exceeds the selected source location', () => {
    expect(() => calculateCryptoLocationBalances(
      [{ id: 'buy', type: 'buy', locationId: 'binance', units: '1', occurredAt: at('01:00:00') }],
      [{ id: 'transfer', fromLocationId: 'binance', toLocationId: 'ledger', units: '1', networkFeeUnits: '0.01', occurredAt: at('02:00:00') }],
    )).toThrow(CryptoLocationInsufficientUnitsError)
  })

  it('rejects a sell that exceeds the selected location even when another location holds units', () => {
    expect(() => calculateCryptoLocationBalances([
      { id: 'binance-buy', type: 'buy', locationId: 'binance', units: '1', occurredAt: at('01:00:00') },
      { id: 'ledger-buy', type: 'buy', locationId: 'ledger', units: '1', occurredAt: at('02:00:00') },
      { id: 'binance-sell', type: 'sell', locationId: 'binance', units: '1.1', occurredAt: at('03:00:00') },
    ], [])).toThrow(CryptoLocationInsufficientUnitsError)
  })

  it('rejects a same-location transfer and sums high-precision fees exactly', () => {
    expect(() => calculateCryptoLocationBalances([], [{ id: 'same', fromLocationId: 'ledger', toLocationId: 'ledger', units: '1', networkFeeUnits: '0', occurredAt: at('01:00:00') }]))
      .toThrow(CryptoTransferSameLocationError)
    expect(totalTransferFeeUnits([
      { id: 'a', fromLocationId: 'a', toLocationId: 'b', units: '1', networkFeeUnits: '0.000000000000000001', occurredAt: at('01:00:00') },
      { id: 'b', fromLocationId: 'a', toLocationId: 'b', units: '1', networkFeeUnits: '0.000000000000000002', occurredAt: at('02:00:00') },
    ]).equals('0.000000000000000003')).toBe(true)
  })
})

describe('crypto portfolio accounting', () => {
  it('uses historical FX and weighted average cost for DCA and a partial sell', () => {
    const position = calculateCryptoPosition([
      { id: 'buy-1', type: 'buy', units: '0.001', priceAmount: '100000', feeAmount: '1', fxRateToBase: '57', occurredAt: at('01:00:00') },
      { id: 'buy-2', type: 'buy', units: '0.001', priceAmount: '120000', feeAmount: '1', fxRateToBase: '56', occurredAt: at('02:00:00') },
      { id: 'sell', type: 'sell', units: '0.0005', priceAmount: '130000', feeAmount: '1', fxRateToBase: '55', occurredAt: at('03:00:00') },
    ])
    // Purchase cost: 5,757 + 6,776; sell proceeds: 3,520.
    expect(position.units.toString()).toBe('0.0015')
    expect(position.costBasisBase.toString()).toBe('9399.75')
    expect(position.realizedPnlBase.toString()).toBe('386.75')
  })

  it('rejects an oversell without silently clamping balances', () => {
    expect(() => calculateCryptoPosition([
      { id: 'buy', type: 'buy', units: '1', priceAmount: '1', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00') },
      { id: 'sell', type: 'sell', units: '1.000000000000000001', priceAmount: '1', feeAmount: '0', fxRateToBase: '1', occurredAt: at('02:00:00') },
    ])).toThrow(CryptoInsufficientUnitsError)
  })

  it('treats a coin-denominated network fee as a zero-proceeds disposal, not a transfer sale', () => {
    const position = calculateCryptoPosition(
      [{ id: 'buy', type: 'buy', units: '1', priceAmount: '100', feeAmount: '0', fxRateToBase: '1', occurredAt: at('01:00:00') }],
      [{ id: 'fee', networkFeeUnits: '0.01', occurredAt: at('02:00:00') }],
    )
    expect(position.units.toString()).toBe('0.99')
    expect(position.costBasisBase.toString()).toBe('99')
    expect(position.realizedPnlBase.toString()).toBe('-1')
  })
})
