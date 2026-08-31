import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { FinanceProvider } from './FinanceProvider'
import { useFinance } from '../hooks/useFinance'
import { fixedClock } from '../utils/clock'
import { FinanceValidationError } from '../domain/financeRules'
import { isDateInPeriod } from '../utils/date'

// SR-005 / TR-006 regression: this exercises the REAL `FinanceProvider`
// wiring end-to-end (not the store in isolation), covering the properties
// the React-safe rewrite must hold at once:
//
//   (a) A repository validation throw (e.g. over-allocating a budget
//       category) must surface as a normal catchable exception from the
//       callback the page calls — never as an uncaught error that crashes
//       the app through React's dispatch machinery.
//   (b) Two back-to-back valid mutations must both apply — the original
//       stale-closure bug this feature set out to fix must not regress.
//   (c) Both must still hold under React Strict Mode, whose double-invoked
//       render and double-mounted effects are exactly what render-phase ref
//       synchronization was unsafe under.

// Vitest runs without `globals`, so Testing Library's automatic cleanup hook
// is never registered — unmount between tests explicitly.
afterEach(cleanup)

function wrapper({ children }: { children: React.ReactNode }) {
  return <FinanceProvider>{children}</FinanceProvider>
}

function strictWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <FinanceProvider>{children}</FinanceProvider>
    </StrictMode>
  )
}

describe.each([
  ['default rendering', wrapper],
  ['React Strict Mode', strictWrapper],
])('FinanceProvider — real provider wiring (%s)', (_name, renderWrapper) => {
  it('surfaces a repository validation throw as a catchable error without corrupting state', () => {
    const { result } = renderHook(() => useFinance(), { wrapper: renderWrapper })

    const before = result.current.state.budgetCategories.length

    let thrown: unknown
    act(() => {
      try {
        result.current.addBudgetCategory({ name: 'Way Too Much', allocated: 999_999 })
      } catch (err) {
        thrown = err
      }
    })

    // The throw must have been caught right here, synchronously — not lost
    // as an uncaught pageerror.
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toMatch(/unallocated/i)

    // The provider must still be alive and its state unchanged by the
    // rejected mutation.
    expect(result.current.state.budgetCategories.length).toBe(before)
  })

  it('surfaces a repository validation throw from addGoalFunds the same way', () => {
    const { result } = renderHook(() => useFinance(), { wrapper: renderWrapper })

    const goal = result.current.state.goals.find((g) => g.active)!
    const account = result.current.state.accounts[0]
    const balanceBefore = account.balance
    const currentBefore = goal.currentAmount

    let thrown: unknown
    act(() => {
      try {
        result.current.addGoalFunds(goal.id, account.id, 999_999_999)
      } catch (err) {
        thrown = err
      }
    })

    // The SPECIFIC documented rejection, with the field a form would place it
    // on — `toBeInstanceOf(Error)` alone would also pass on a TypeError from
    // a renamed property, testing nothing about the rule.
    expect(thrown).toBeInstanceOf(FinanceValidationError)
    expect((thrown as FinanceValidationError).code).toBe('GOAL_OVERFUNDING')
    expect((thrown as FinanceValidationError).field).toBe('amount')

    // …and nothing moved on the way out.
    expect(result.current.state.accounts.find((a) => a.id === account.id)!.balance).toBe(balanceBefore)
    expect(result.current.state.goals.find((g) => g.id === goal.id)!.currentAmount).toBe(currentBefore)
  })

  it('applies two dispatched mutations issued in immediate succession without losing the first', () => {
    const { result } = renderHook(() => useFinance(), { wrapper: renderWrapper })

    const account = result.current.state.accounts.find((a) => a.id === 'checking')!
    const balanceBefore = account.balance
    const foodBefore = result.current.state.budgetCategories.find((c) => c.id === 'food')!.spent

    act(() => {
      // Both calls happen before React has a chance to re-render and refresh
      // any closed-over `state` — exactly the scenario that regressed.
      result.current.addTransaction({
        type: 'expense',
        title: 'Coffee',
        categoryId: 'food',
        accountId: 'checking',
        date: '2026-08-30',
        amount: 25,
      })
      result.current.addTransaction({
        type: 'expense',
        title: 'Lunch',
        categoryId: 'food',
        accountId: 'checking',
        date: '2026-08-30',
        amount: 40,
      })
    })

    const balanceAfter = result.current.state.accounts.find((a) => a.id === 'checking')!.balance
    const foodAfter = result.current.state.budgetCategories.find((c) => c.id === 'food')!.spent

    expect(balanceAfter).toBe(balanceBefore - 25 - 40)
    expect(foodAfter).toBe(foodBefore + 25 + 40)
    expect(result.current.state.transactions.some((t) => t.title === 'Coffee')).toBe(true)
    expect(result.current.state.transactions.some((t) => t.title === 'Lunch')).toBe(true)
  })

  it('seeds exactly one finance state — Strict Mode’s double render must not double the seed data', () => {
    const { result } = renderHook(() => useFinance(), { wrapper: renderWrapper })
    expect(result.current.state.accounts).toHaveLength(5)
    expect(result.current.state.goals).toHaveLength(5)
    expect(result.current.state.transactions).toHaveLength(9)
  })
})

// TR-001: the provider is where the one clock enters the app.
describe('FinanceProvider — injected clock', () => {
  it('exposes the injected clock’s today and derives the reporting period from it', () => {
    const { result } = renderHook(() => useFinance(), {
      wrapper: ({ children }) => <FinanceProvider clock={fixedClock('2027-01-15')}>{children}</FinanceProvider>,
    })

    expect(result.current.todayIso).toBe('2027-01-15')
    expect(result.current.activePeriod).toEqual({ start: '2027-01-01', end: '2027-02-01' })
    expect(result.current.activePeriodLabel).toBe('January 2027')
    // The form default date and the reporting window are the same clock.
    expect(isDateInPeriod(result.current.todayIso, result.current.activePeriod)).toBe(true)
  })

  it('stamps goal funding with the injected date, not a hardcoded one', () => {
    const { result } = renderHook(() => useFinance(), {
      wrapper: ({ children }) => <FinanceProvider clock={fixedClock('2027-01-15')}>{children}</FinanceProvider>,
    })

    act(() => {
      result.current.addGoalFunds('travel', 'checking', 100)
    })

    expect(result.current.state.transactions[0].date).toBe('2027-01-15')
  })
})
