import { describe, expect, it } from 'vitest'
import type { Account, CreditCard, FinanceState, Holding, Transaction } from '../domain/finance'
import { DEMO_TODAY_ISO } from '../utils/clock'
import {
  accountBalanceTrendSample,
  debtTrendSample,
  netWorthNow,
  netWorthTrendSample,
  portfolioSummary,
  reportPeriodLabel,
  reportingPeriodForView,
  savingsRate,
} from './reportsSelectors'

const TODAY = DEMO_TODAY_ISO // 2026-08-29, per the demo clock

function makeState(overrides: Partial<FinanceState> = {}): FinanceState {
  return {
    accounts: [],
    creditCards: [],
    categories: [],
    transactions: [],
    budgetCategories: [],
    totalBudgetAllocated: 0,
    goals: [],
    attentionItems: [],
    portfolio: [],
    budgetVsActual: [],
    ...overrides,
  }
}

const asset: Account = {
  id: 'checking',
  name: 'Checking',
  type: 'checking',
  classification: 'asset',
  balance: 10000,
  syncStatus: 'synced',
}

const card: CreditCard = {
  id: 'visa',
  name: 'Visa',
  lastFour: '1234',
  network: 'visa',
  balance: 3000,
  limit: 20000,
  dueDate: '2026-09-15',
  minPayment: 500,
}

describe('reportingPeriodForView', () => {
  it('returns the calendar month for "monthly"', () => {
    expect(reportingPeriodForView(TODAY, 'monthly')).toEqual({ start: '2026-08-01', end: '2026-09-01' })
  })

  it('returns the calendar quarter for "quarterly"', () => {
    // Aug 2026 falls in Q3 (Jul-Sep)
    expect(reportingPeriodForView(TODAY, 'quarterly')).toEqual({ start: '2026-07-01', end: '2026-10-01' })
  })

  it('returns the calendar year for "yearly"', () => {
    expect(reportingPeriodForView(TODAY, 'yearly')).toEqual({ start: '2026-01-01', end: '2027-01-01' })
  })

  it('throws on an invalid anchor rather than silently falling back to a real clock', () => {
    expect(() => reportingPeriodForView('not-a-date', 'monthly')).toThrow()
  })

  it.each<[string, string]>([
    ['2026-01-15', 'Q1 2026 (Jan–Mar)'],
    ['2026-04-15', 'Q2 2026 (Apr–Jun)'],
    ['2026-07-15', 'Q3 2026 (Jul–Sep)'],
    ['2026-10-15', 'Q4 2026 (Oct–Dec)'],
  ])('quarter for %s is %s', (iso, expected) => {
    expect(reportingPeriodForView(iso, 'quarterly')).toEqual(
      (() => {
        const y = Number(iso.slice(0, 4))
        const startMonth = Math.floor((Number(iso.slice(5, 7)) - 1) / 3) * 3
        const start = new Date(y, startMonth, 1)
        const end = new Date(y, startMonth + 3, 1)
        const pad = (n: number) => String(n).padStart(2, '0')
        return {
          start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
          end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
        }
      })(),
    )
    expect(reportPeriodLabel(iso, 'quarterly')).toBe(expected)
  })
})

describe('reportPeriodLabel', () => {
  it('formats monthly, quarterly, and yearly labels', () => {
    expect(reportPeriodLabel(TODAY, 'monthly')).toBe('August 2026')
    expect(reportPeriodLabel(TODAY, 'quarterly')).toBe('Q3 2026 (Jul–Sep)')
    expect(reportPeriodLabel(TODAY, 'yearly')).toBe('2026')
  })
})

describe('savingsRate', () => {
  it('computes netCashFlow / totalIncome as a percentage', () => {
    const income: Transaction = {
      id: 'income-1',
      type: 'income',
      title: 'Salary',
      date: '2026-08-05',
      amount: 1000,
      source: 'manual',
      status: 'cleared',
    }
    const expense: Transaction = {
      id: 'expense-1',
      type: 'expense',
      title: 'Rent',
      date: '2026-08-06',
      amount: -400,
      source: 'manual',
      status: 'cleared',
    }
    const state = makeState({ transactions: [income, expense] })
    const period = reportingPeriodForView(TODAY, 'monthly')
    // net = 600, income = 1000 -> 60%
    expect(savingsRate(state, period)).toBe(60)
  })

  it('guards divide-by-zero when there is no income in the period', () => {
    const state = makeState({ transactions: [] })
    const period = reportingPeriodForView(TODAY, 'monthly')
    expect(savingsRate(state, period)).toBe(0)
  })
})

describe('netWorthNow', () => {
  it('is assets (asset accounts) minus liabilities (credit card balances)', () => {
    const state = makeState({ accounts: [asset], creditCards: [card] })
    expect(netWorthNow(state)).toEqual({ assets: 10000, liabilities: 3000, netWorth: 7000 })
  })

  it('handles no accounts or cards without dividing by zero', () => {
    expect(netWorthNow(makeState())).toEqual({ assets: 0, liabilities: 0, netWorth: 0 })
  })
})

describe('illustrative trend samples', () => {
  it('accountBalanceTrendSample has 6 points anchored to the real current total', () => {
    const state = makeState({ accounts: [asset] })
    const trend = accountBalanceTrendSample(state, TODAY)
    expect(trend).toHaveLength(6)
    expect(trend[trend.length - 1].value).toBe(10000)
    // Monotonically approaches the final value along the illustrative curve.
    for (let i = 1; i < trend.length; i++) {
      expect(trend[i].value).toBeGreaterThanOrEqual(trend[i - 1].value)
    }
  })

  it('netWorthTrendSample anchors its last point to netWorthNow(state).netWorth', () => {
    const state = makeState({ accounts: [asset], creditCards: [card] })
    const trend = netWorthTrendSample(state, TODAY)
    expect(trend).toHaveLength(6)
    expect(trend[trend.length - 1].value).toBe(7000)
  })

  it('debtTrendSample anchors its last point to the real current debt and settles downward', () => {
    const state = makeState({ creditCards: [card] })
    const trend = debtTrendSample(state, TODAY)
    expect(trend).toHaveLength(6)
    expect(trend[trend.length - 1].value).toBe(3000)
    for (let i = 1; i < trend.length; i++) {
      expect(trend[i].value).toBeLessThanOrEqual(trend[i - 1].value)
    }
  })

  it('is deterministic for the same state/todayIso (never Math.random)', () => {
    const state = makeState({ accounts: [asset] })
    expect(accountBalanceTrendSample(state, TODAY)).toEqual(accountBalanceTrendSample(state, TODAY))
  })

  it('throws on an invalid anchor rather than silently falling back to a real clock', () => {
    const state = makeState({ accounts: [asset] })
    expect(() => accountBalanceTrendSample(state, 'nope')).toThrow()
  })
})

describe('portfolioSummary', () => {
  it('sums real holding values and computes a value-weighted change percentage', () => {
    const holdings: Holding[] = [
      { ticker: 'AAA', name: 'Alpha', price: 100, changePct: 10, units: 10, history: [90, 100] }, // value 1000
      { ticker: 'BBB', name: 'Beta', price: 50, changePct: -2, units: 20, history: [55, 50] }, // value 1000
    ]
    const state = makeState({ portfolio: holdings })
    const summary = portfolioSummary(state)
    expect(summary.totalValue).toBe(2000)
    expect(summary.holdingsCount).toBe(2)
    // (1000*10 + 1000*-2) / 2000 = 4
    expect(summary.weightedChangePct).toBe(4)
  })

  it('returns zero change for an empty portfolio without dividing by zero', () => {
    expect(portfolioSummary(makeState())).toEqual({ totalValue: 0, weightedChangePct: 0, holdingsCount: 0 })
  })
})
