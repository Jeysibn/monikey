/**
 * Crypto location accounting. This module is intentionally separate from the
 * buy/sell portfolio engine: moving coins is not a trade and must never be
 * represented as a synthetic sell followed by a synthetic buy.
 */
import { Decimal, type DecimalValue } from './portfolioAccounting.js'

export type CryptoLocationTrade = {
  id: string
  type: 'buy' | 'sell'
  locationId: string | null
  units: DecimalValue
  occurredAt: Date
}

/** A buy/sell with values retained in its trade currency and its event-time FX. */
export type CryptoTradeAccountingEvent = {
  id: string
  type: 'buy' | 'sell'
  units: DecimalValue
  priceAmount: DecimalValue
  feeAmount: DecimalValue
  fxRateToBase: DecimalValue
  occurredAt: Date
}

export type CryptoPosition = {
  units: Decimal
  costBasisBase: Decimal
  realizedPnlBase: Decimal
  averageCostBase: Decimal
}

/** A network fee paid in the coin itself is a zero-proceeds disposal. */
export type CryptoTransferFeeEvent = { id: string; networkFeeUnits: DecimalValue; occurredAt: Date }

export class CryptoInsufficientUnitsError extends Error {
  readonly code = 'CRYPTO_INSUFFICIENT_UNITS' as const
  constructor(readonly available: Decimal, readonly required: Decimal) {
    super(`Only ${available.toString()} units are available; ${required.toString()} requested.`)
  }
}

export type CryptoTransferEvent = {
  id: string
  fromLocationId: string
  toLocationId: string
  units: DecimalValue
  networkFeeUnits: DecimalValue
  occurredAt: Date
}

export class CryptoLocationInsufficientUnitsError extends Error {
  readonly code = 'CRYPTO_LOCATION_INSUFFICIENT_UNITS' as const
  constructor(readonly locationId: string, readonly available: Decimal, readonly required: Decimal) {
    super(`Location ${locationId} has ${available.toString()} units; ${required.toString()} required.`)
  }
}

export class CryptoTransferSameLocationError extends Error {
  readonly code = 'CRYPTO_TRANSFER_SAME_LOCATION' as const
  constructor(readonly locationId: string) {
    super('A crypto transfer must use different source and destination locations.')
  }
}

function decimal(value: DecimalValue): Decimal {
  return value instanceof Decimal ? value : new Decimal(value.toString())
}

function amountAt(balances: Map<string, Decimal>, locationId: string): Decimal {
  return balances.get(locationId) ?? new Decimal(0)
}

/**
 * Weighted-average cost accounting in the portfolio base currency. Historical
 * FX is an input stored on the trade, never looked up at read time.
 */
export function calculateCryptoPosition(events: CryptoTradeAccountingEvent[], transferFees: CryptoTransferFeeEvent[] = []): CryptoPosition {
  const ordered = [
    ...events.map((event) => ({ kind: 'trade' as const, event, occurredAt: event.occurredAt })),
    ...transferFees.map((event) => ({ kind: 'fee' as const, event, occurredAt: event.occurredAt })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.event.id.localeCompare(b.event.id))
  let units = new Decimal(0)
  let costBasisBase = new Decimal(0)
  let realizedPnlBase = new Decimal(0)
  for (const item of ordered) {
    if (item.kind === 'fee') {
      const feeUnits = decimal(item.event.networkFeeUnits)
      if (feeUnits.greaterThan(units)) throw new CryptoInsufficientUnitsError(units, feeUnits)
      const disposedBasis = units.isZero() ? new Decimal(0) : costBasisBase.dividedBy(units).times(feeUnits)
      units = units.minus(feeUnits)
      costBasisBase = units.isZero() ? new Decimal(0) : Decimal.max(0, costBasisBase.minus(disposedBasis))
      realizedPnlBase = realizedPnlBase.minus(disposedBasis)
      continue
    }
    const event = item.event
    const eventUnits = decimal(event.units)
    const unitPriceBase = decimal(event.priceAmount).times(decimal(event.fxRateToBase))
    const feeBase = decimal(event.feeAmount).times(decimal(event.fxRateToBase))
    if (event.type === 'buy') {
      units = units.plus(eventUnits)
      costBasisBase = costBasisBase.plus(eventUnits.times(unitPriceBase)).plus(feeBase)
      continue
    }
    if (eventUnits.greaterThan(units)) throw new CryptoInsufficientUnitsError(units, eventUnits)
    const averageCostBase = units.isZero() ? new Decimal(0) : costBasisBase.dividedBy(units)
    const disposedBasis = averageCostBase.times(eventUnits)
    const proceeds = eventUnits.times(unitPriceBase).minus(feeBase)
    realizedPnlBase = realizedPnlBase.plus(proceeds.minus(disposedBasis))
    units = units.minus(eventUnits)
    costBasisBase = units.isZero() ? new Decimal(0) : Decimal.max(0, costBasisBase.minus(disposedBasis))
  }
  return { units, costBasisBase, realizedPnlBase, averageCostBase: units.isZero() ? new Decimal(0) : costBasisBase.dividedBy(units) }
}

/**
 * Produces per-location holdings in chronological order. A buy/sell without a
 * location changes overall holdings but deliberately does not invent a
 * location balance. Transfers validate their source independently of overall
 * portfolio holdings, including the network fee paid from the source.
 */
export function calculateCryptoLocationBalances(
  trades: CryptoLocationTrade[],
  transfers: CryptoTransferEvent[],
): Map<string, Decimal> {
  const events = [
    ...trades.filter((trade) => trade.locationId !== null).map((trade) => ({ kind: 'trade' as const, event: trade, occurredAt: trade.occurredAt })),
    ...transfers.map((transfer) => ({ kind: 'transfer' as const, event: transfer, occurredAt: transfer.occurredAt })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.event.id.localeCompare(b.event.id))

  const balances = new Map<string, Decimal>()
  for (const item of events) {
    if (item.kind === 'trade') {
      const trade = item.event
      const current = amountAt(balances, trade.locationId!)
      const units = decimal(trade.units)
      if (trade.type === 'sell' && units.greaterThan(current)) {
        throw new CryptoLocationInsufficientUnitsError(trade.locationId!, current, units)
      }
      balances.set(trade.locationId!, trade.type === 'buy' ? current.plus(units) : current.minus(units))
      continue
    }

    const transfer = item.event
    if (transfer.fromLocationId === transfer.toLocationId) throw new CryptoTransferSameLocationError(transfer.fromLocationId)
    const moved = decimal(transfer.units)
    const fee = decimal(transfer.networkFeeUnits)
    const sourceRequired = moved.plus(fee)
    const sourceBalance = amountAt(balances, transfer.fromLocationId)
    if (sourceRequired.greaterThan(sourceBalance)) {
      throw new CryptoLocationInsufficientUnitsError(transfer.fromLocationId, sourceBalance, sourceRequired)
    }
    balances.set(transfer.fromLocationId, sourceBalance.minus(sourceRequired))
    balances.set(transfer.toLocationId, amountAt(balances, transfer.toLocationId).plus(moved))
  }
  return balances
}

/** The network fee leaves the portfolio; transfer principal does not. */
export function totalTransferFeeUnits(transfers: CryptoTransferEvent[]): Decimal {
  return transfers.reduce((sum, transfer) => sum.plus(decimal(transfer.networkFeeUnits)), new Decimal(0))
}
