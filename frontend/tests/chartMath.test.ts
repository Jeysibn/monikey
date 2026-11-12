/*
 * Tests for the Dashboard's chart maths (lib/chartMath.ts) and the two date scopes (lib/dashboardRanges.ts).
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { arcPath, axisFormatter, barHeight, donutSlices, formatShare, niceAxis, thinLabels } from '../src/lib/chartMath.ts'
import {
  analysisRange, canStepToNextMonth, daysBetween, isCalendarDate, lastDayOf, presetRange, rangeProblem, reportingRange, shiftMonth, sortRows,
} from '../src/lib/dashboardRanges.ts'

describe('niceAxis', () => {
  it('rounds the top up to a 1, 2, 2.5, 5 or 10 step and lists every tick from zero', () => {
    assert.deepEqual(niceAxis(3_650_000), { max: 4_000_000, step: 1_000_000, ticks: [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000] }) // ₱36,500 -> ₱40K
    assert.deepEqual(niceAxis(2_712_740).ticks.at(-1), 3_000_000)
    assert.equal(niceAxis(100).max, 100) // ₱1.00 is its own axis
    assert.equal(niceAxis(40_000).step, 10_000) // ₱400 -> steps of ₱100
  })
  it('always covers the data and has a sensible axis when there is nothing to show', () => {
    for (const value of [1, 99, 100, 1_234, 98_765, 12_345_678, 999_999_999]) assert.ok(niceAxis(value).max >= value, `axis for ${value}`)
    assert.deepEqual(niceAxis(0).ticks, [0, 2_500, 5_000, 7_500, 10_000])
    assert.deepEqual(niceAxis(-5).ticks, [0, 2_500, 5_000, 7_500, 10_000])
  })
})

describe('axisFormatter', () => {
  it('uses one unit for the whole axis and decimals only when the step needs them', () => {
    const f = axisFormatter(niceAxis(3_650_000))
    assert.deepEqual([0, 1_000_000, 4_000_000].map(f), ['₱0', '₱10K', '₱40K'])
    const half = axisFormatter({ max: 500_000, step: 250_000, ticks: [] })
    assert.deepEqual([0, 250_000, 500_000].map(half), ['₱0', '₱2.5K', '₱5K'])
    const millions = axisFormatter(niceAxis(250_000_000))
    assert.equal(millions(250_000_000), '₱2.5M')
    const small = axisFormatter(niceAxis(40_000))
    assert.deepEqual([0, 10_000, 40_000].map(small), ['₱0', '₱100', '₱400'])
  })
})

describe('thinLabels', () => {
  it('shows every label when they fit, otherwise evenly spaced ones including the first and last', () => {
    assert.deepEqual(thinLabels(5, 8), [0, 1, 2, 3, 4])
    const picked = thinLabels(31, 6)
    assert.equal(picked[0], 0)
    assert.equal(picked.at(-1), 30)
    assert.ok(picked.length <= 6)
    assert.deepEqual(picked, [...picked].sort((a, b) => a - b))
    assert.equal(new Set(picked).size, picked.length)
    assert.deepEqual(thinLabels(366, 5).length, 5)
    assert.deepEqual(thinLabels(0, 5), [])
  })
})

describe('barHeight', () => {
  it('scales to the plot, gives a non-zero value at least one pixel and a zero value none', () => {
    assert.equal(barHeight(50, 100, 200), 100)
    assert.equal(barHeight(1, 1_000_000, 200), 1)
    assert.equal(barHeight(0, 100, 200), 0)
    assert.equal(barHeight(100, 0, 200), 0)
  })
})

describe('donut', () => {
  it('splits a ring by value starting at 12 o clock, skipping nothing that has value', () => {
    const slices = donutSlices([300, 100])
    assert.equal(slices.length, 2)
    assert.ok(Math.abs(slices[0]!.fraction - 0.75) < 1e-9)
    assert.ok(Math.abs(slices[0]!.start + Math.PI / 2) < 1e-9)
    assert.ok(Math.abs(slices[1]!.end - (-Math.PI / 2 + Math.PI * 2)) < 1e-9)
    assert.deepEqual(donutSlices([]), [])
    assert.deepEqual(donutSlices([0, 0]), [])
  })
  it('draws a whole ring as two arcs so the path is not empty', () => {
    const [only] = donutSlices([500])
    assert.equal((arcPath(50, 50, 40, only!.start, only!.end).match(/A /g) ?? []).length, 2)
    assert.equal((arcPath(50, 50, 40, 0, 1).match(/A /g) ?? []).length, 1)
    assert.match(arcPath(50, 50, 40, 0, 4), / 0 1 1 /) // an arc past half a turn takes the large-arc flag
  })
  it('formats shares without ever showing 0% for a slice that exists', () => {
    assert.deepEqual([0.5, 0.125, 0.0004, 0.9999, 0].map(formatShare), ['50%', '12.5%', '<0.1%', '100%', '0%'])
  })
})

describe('Reporting Month and Analysis range stay independent', () => {
  const TODAY = '2026-10-25' // a Sunday in the middle of the month
  it('builds the monthly request as whole months ending at the reporting month, stopping at today for the current one', () => {
    assert.deepEqual(reportingRange('2026-10', TODAY), { startDate: '2026-05-01', endDate: '2026-10-25' }) // month to date
    assert.deepEqual(reportingRange('2026-08', TODAY), { startDate: '2026-03-01', endDate: '2026-08-31' }) // a past month is whole
    assert.deepEqual(reportingRange('2026-02', TODAY), { startDate: '2025-09-01', endDate: '2026-02-28' }) // across a year end, February
    assert.equal(reportingRange('2028-02', '2028-06-10').endDate, '2028-02-29') // leap year
  })
  it('does not let the analysis range change what the monthly request is, and the reverse', () => {
    const before = reportingRange('2026-10', TODAY)
    analysisRange('custom', { startDate: '2026-10-18', endDate: '2026-10-22' }, TODAY)
    analysisRange('7-days', { startDate: '', endDate: '' }, TODAY)
    assert.deepEqual(reportingRange('2026-10', TODAY), before)
    assert.deepEqual(analysisRange('this-month', { startDate: '', endDate: '' }, TODAY), analysisRange('this-month', { startDate: '2020-01-01', endDate: '2020-01-02' }, TODAY))
  })
  it('stops the month stepper at the current month', () => {
    assert.equal(canStepToNextMonth('2026-09', TODAY), true)
    assert.equal(canStepToNextMonth('2026-10', TODAY), false)
  })
})

describe('analysis presets', () => {
  const TODAY = '2026-10-25'
  it('computes every preset from today, inclusive, with the current month only through today', () => {
    assert.deepEqual(presetRange('this-month', TODAY), { startDate: '2026-10-01', endDate: '2026-10-25' })
    assert.deepEqual(presetRange('last-month', TODAY), { startDate: '2026-09-01', endDate: '2026-09-30' })
    assert.deepEqual(presetRange('7-days', TODAY), { startDate: '2026-10-19', endDate: '2026-10-25' })
    assert.deepEqual(presetRange('30-days', TODAY), { startDate: '2026-09-26', endDate: '2026-10-25' })
    assert.deepEqual(presetRange('3-months', TODAY), { startDate: '2026-08-01', endDate: '2026-10-25' })
    assert.deepEqual(presetRange('this-year', TODAY), { startDate: '2026-01-01', endDate: '2026-10-25' })
    assert.equal(daysBetween('2026-10-19', '2026-10-25'), 7)
  })
  it('handles month and year edges', () => {
    assert.deepEqual(presetRange('last-month', '2026-01-10'), { startDate: '2025-12-01', endDate: '2025-12-31' })
    assert.deepEqual(presetRange('3-months', '2026-02-03'), { startDate: '2025-12-01', endDate: '2026-02-03' })
    assert.deepEqual(presetRange('7-days', '2026-03-03'), { startDate: '2026-02-25', endDate: '2026-03-03' })
    assert.equal(lastDayOf('2024-02'), '2024-02-29')
    assert.equal(shiftMonth('2026-01', -1), '2025-12')
  })
  it('rejects bad ranges before any request, in words', () => {
    const ok = { startDate: '2026-10-01', endDate: '2026-10-25' }
    assert.equal(rangeProblem(ok, TODAY), null)
    assert.match(rangeProblem({ startDate: '2026-02-30', endDate: '2026-03-01' }, TODAY)!, /valid/)
    assert.match(rangeProblem({ startDate: '', endDate: '2026-03-01' }, TODAY)!, /valid/)
    assert.match(rangeProblem({ startDate: '2026-10-05', endDate: '2026-10-04' }, TODAY)!, /on or before/)
    assert.match(rangeProblem({ startDate: '2026-10-01', endDate: '2026-10-26' }, TODAY)!, /future/)
    assert.match(rangeProblem({ startDate: '2025-01-01', endDate: '2026-01-02' }, TODAY)!, /366/)
    assert.equal(rangeProblem({ startDate: '2025-10-25', endDate: '2026-10-25' }, TODAY), null) // 366 days exactly is allowed
    assert.equal(isCalendarDate('2024-02-29'), true)
    assert.equal(isCalendarDate('2025-02-29'), false)
  })
})

describe('sortRows', () => {
  const rows = [{ name: 'beta', amount: 5 }, { name: 'Alpha', amount: 9 }, { name: 'gamma', amount: 5 }]
  it('sorts highest first, lowest first or A to Z (ties by name, case-insensitive) without mutating', () => {
    assert.deepEqual(sortRows(rows, 'high').map((r) => r.name), ['Alpha', 'beta', 'gamma'])
    assert.deepEqual(sortRows(rows, 'low').map((r) => r.name), ['beta', 'gamma', 'Alpha'])
    assert.deepEqual(sortRows(rows, 'az').map((r) => r.name), ['Alpha', 'beta', 'gamma'])
    assert.deepEqual(rows.map((r) => r.name), ['beta', 'Alpha', 'gamma'])
  })
})

import { isChunkLoadError } from '../src/lib/chunkErrors.ts'
describe('isChunkLoadError', () => {
  it('recognises a failed lazy import and nothing else', () => {
    assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/DashboardView-1.js')), true)
    assert.equal(isChunkLoadError(new Error('Importing a module script failed.')), true)
    assert.equal(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' })), true)
    assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false)
    assert.equal(isChunkLoadError('Failed to fetch dynamically imported module'), false)
  })
})
