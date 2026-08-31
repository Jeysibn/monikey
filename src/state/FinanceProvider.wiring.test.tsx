import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { FinanceProvider } from './FinanceProvider'
import { useFinance } from '../hooks/useFinance'

// SR-005 regression, corrected: this exercises the REAL `FinanceProvider` +
// `useReducer` wiring end-to-end (not the reducer function in isolation),
// covering exactly the two properties the SR-005 fix must hold at once:
//
//   (a) A repository validation throw (e.g. over-allocating a budget
//       category) must surface as a normal catchable exception from the
//       `useCallback` the page calls — never as an uncaught error that
//       crashes the app via React's dispatch machinery.
//   (b) Two back-to-back valid mutations must both apply — the original
//       stale-closure bug this feature set out to fix must not regress.
describe('FinanceProvider — real provider wiring (SR-005 regression)', () => {
  it('surfaces a repository validation throw as a catchable error without corrupting state', () => {
    const { result } = renderHook(() => useFinance(), {
      wrapper: ({ children }) => <FinanceProvider>{children}</FinanceProvider>,
    })

    const before = result.current.state.budgetCategories.length

    let thrown: unknown
    act(() => {
      try {
        result.current.addBudgetCategory({
          name: 'Way Too Much',
          allocated: 999_999,
        })
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
    const { result } = renderHook(() => useFinance(), {
      wrapper: ({ children }) => <FinanceProvider>{children}</FinanceProvider>,
    })

    const goal = result.current.state.goals[0]
    const account = result.current.state.accounts[0]

    let thrown: unknown
    act(() => {
      try {
        result.current.addGoalFunds(goal.id, account.id, 999_999_999)
      } catch (err) {
        thrown = err
      }
    })

    expect(thrown).toBeInstanceOf(Error)
  })

  it('applies two dispatched mutations issued in immediate succession without losing the first', () => {
    const { result } = renderHook(() => useFinance(), {
      wrapper: ({ children }) => <FinanceProvider>{children}</FinanceProvider>,
    })

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
})
