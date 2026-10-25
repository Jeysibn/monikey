/*
 * Tests for timestamp comparison (contract B3): no precision lost below a millisecond, offsets applied,
 * and the cross-source order of the Activity list.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildActivity } from '../src/lib/finance.ts'
import { compareTimestamps } from '../src/lib/timestamp.ts'
import { getMockData } from '../src/mockData.ts'
import type { CreditCardPayment, MockData, Transaction } from '../src/types.ts'

const OCT = '2026-10'
const sign = (n: number) => Math.sign(n)

describe('compareTimestamps', () => {
  it('keeps microseconds: .123100Z is earlier than .123900Z although both are the same millisecond', () => {
    assert.equal(Date.parse('2026-10-24T08:00:00.123100Z'), Date.parse('2026-10-24T08:00:00.123900Z')) // what Date would say
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00.123100Z', '2026-10-24T08:00:00.123900Z')), -1)
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00.123900Z', '2026-10-24T08:00:00.123100Z')), 1)
  })
  it('keeps nanoseconds too, and treats missing digits as zeros', () => {
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00.123456789Z', '2026-10-24T08:00:00.123456788Z')), 1)
    assert.equal(compareTimestamps('2026-10-24T08:00:00Z', '2026-10-24T08:00:00.000Z'), 0)
    assert.equal(compareTimestamps('2026-10-24T08:00:00.5Z', '2026-10-24T08:00:00.500000Z'), 0)
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00.05Z', '2026-10-24T08:00:00.5Z')), -1) // .05 < .5, not .05 > .5 as text
  })
  it('applies the UTC offset: the same instant in different offsets is equal, and order follows the instant', () => {
    assert.equal(compareTimestamps('2026-10-24T16:00:00.123456+08:00', '2026-10-24T08:00:00.123456Z'), 0)
    assert.equal(sign(compareTimestamps('2026-10-24T09:00:00+08:00', '2026-10-24T02:00:00Z')), -1) // 01:00Z < 02:00Z
    assert.equal(sign(compareTimestamps('2026-10-24T23:30:00-05:00', '2026-10-25T00:00:00Z')), 1) // 04:30Z (next day) > 00:00Z
  })
  it('orders across seconds, minutes, days and month ends', () => {
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00.999999Z', '2026-10-24T08:00:01.000000Z')), -1)
    assert.equal(sign(compareTimestamps('2026-10-31T23:59:59.999999Z', '2026-11-01T00:00:00.000000Z')), -1)
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00Z', '2026-10-23T23:59:59.999999Z')), 1)
  })
  it('falls back to plain text order for anything that is not ISO 8601 with an offset', () => {
    assert.equal(sign(compareTimestamps('2026-10-24T08:00:00', '2026-10-24T09:00:00')), -1)
    assert.equal(compareTimestamps('same', 'same'), 0)
  })
})

describe('Activity order across the two sources at sub-millisecond precision', () => {
  const tx = (id: number, createdAt: string, note: string): Transaction => ({ id, accountId: 1, categoryId: 4, amount: 100, date: '2026-10-26', note, createdAt })
  const pay = (id: number, createdAt: string, note: string): CreditCardPayment => ({ id, sourceAccountId: 2, cardAccountId: 4, amount: 100, date: '2026-10-26', note, createdAt })
  const withRows = (transactions: Transaction[], payments: CreditCardPayment[]): MockData => {
    const base = getMockData()
    return { ...base, transactions: [...base.transactions, ...transactions], payments: [...base.payments, ...payments] }
  }
  const titles = (d: MockData, n: number) => buildActivity(d, OCT, n).map((i) => i.title)

  it('a payment created 600 microseconds after a transaction in the same millisecond comes first (newest first)', () => {
    // On an exact tie a transaction sorts before a payment, so rounding to milliseconds would put the transaction first.
    const d = withRows([tx(901, '2026-10-26T10:00:00.123100Z', 'tx earlier')], [pay(901, '2026-10-26T10:00:00.123900Z', 'pay later')])
    assert.deepEqual(titles(d, 2), ['pay later', 'tx earlier'])
  })
  it('and the other way round: a transaction created later wins over an earlier payment', () => {
    const d = withRows([tx(902, '2026-10-26T10:00:00.123900Z', 'tx later')], [pay(902, '2026-10-26T10:00:00.123100Z', 'pay earlier')])
    assert.deepEqual(titles(d, 2), ['tx later', 'pay earlier'])
  })
  it('an exact tie still falls back to transactions before payments, then the higher id', () => {
    const d = withRows(
      [tx(903, '2026-10-26T10:00:00.123456Z', 'tx a'), tx(904, '2026-10-26T10:00:00.123456Z', 'tx b')],
      [pay(903, '2026-10-26T10:00:00.123456Z', 'pay a')],
    )
    assert.deepEqual(titles(d, 3), ['tx b', 'tx a', 'pay a'])
  })
  it('different offsets for the same day are ordered by the instant, not by the text', () => {
    const d = withRows([tx(905, '2026-10-26T18:00:00+08:00', 'tx 10:00Z')], [pay(905, '2026-10-26T09:30:00Z', 'pay 09:30Z')])
    assert.deepEqual(titles(d, 2), ['tx 10:00Z', 'pay 09:30Z'])
  })
})
