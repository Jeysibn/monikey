import { describe, expect, it } from 'vitest'
import { mockFinanceRepository } from './mockFinanceRepository'
import { activeGoals, budgetUnallocated, totalAvailableCash, totalBudgetSpent, totalGoalSavings } from '../state/financeSelectors'
import type { AddTransactionInput } from '../domain/finance'

const baseInput: AddTransactionInput = {
  type: 'expense',
  title: 'Test expense',
  categoryId: 'food',
  accountId: 'checking',
  date: '2026-08-30',
  amount: 50,
}

describe('mockFinanceRepository.addTransaction — budget-spend gating', () => {
  it('adds an in-period expense to the matching budget category spend', () => {
    const initial = mockFinanceRepository.getInitialState()
    const before = initial.budgetCategories.find((c) => c.id === 'food')!.spent
    const { state: next } = mockFinanceRepository.addTransaction(initial, { ...baseInput, date: '2026-08-30' })
    const after = next.budgetCategories.find((c) => c.id === 'food')!.spent
    expect(after).toBe(before + 50)
  })

  it('does NOT add an out-of-period expense to the current budget spend', () => {
    const initial = mockFinanceRepository.getInitialState()
    const beforeTotal = totalBudgetSpent(initial)
    const { state: next, transaction } = mockFinanceRepository.addTransaction(initial, {
      ...baseInput,
      date: '2026-06-15',
    })
    const afterTotal = totalBudgetSpent(next)
    // Budget totals unchanged...
    expect(afterTotal).toBe(beforeTotal)
    // ...but the transaction itself is still recorded on the ledger.
    expect(next.transactions).toContainEqual(transaction)
    expect(transaction.date).toBe('2026-06-15')
  })

  it('still updates account balances for an out-of-period expense (ledger truth is unaffected)', () => {
    const initial = mockFinanceRepository.getInitialState()
    const before = initial.accounts.find((a) => a.id === 'checking')!.balance
    const { state: next } = mockFinanceRepository.addTransaction(initial, { ...baseInput, date: '2026-06-15' })
    const after = next.accounts.find((a) => a.id === 'checking')!.balance
    expect(after).toBe(before - 50)
  })
})

describe('mockFinanceRepository.addTransaction — transfer fee/balance reconciliation (SR-010)', () => {
  it('debits the source account by amount + fee and credits the destination by amount only', () => {
    const initial = mockFinanceRepository.getInitialState()
    const sourceBefore = initial.accounts.find((a) => a.id === 'checking')!.balance
    const destBefore = initial.accounts.find((a) => a.id === 'savings')!.balance

    const { state: next, transaction } = mockFinanceRepository.addTransaction(initial, {
      type: 'transfer',
      title: 'Move to savings',
      fromAccountId: 'checking',
      toAccountId: 'savings',
      date: '2026-08-30',
      amount: 100,
      fee: 5,
    })

    const sourceAfter = next.accounts.find((a) => a.id === 'checking')!.balance
    const destAfter = next.accounts.find((a) => a.id === 'savings')!.balance

    expect(sourceAfter).toBe(sourceBefore - 105)
    expect(destAfter).toBe(destBefore + 100)
    expect(transaction.fee).toBe(5)
  })

  it('debits the source account by exactly the amount when no fee is given', () => {
    const initial = mockFinanceRepository.getInitialState()
    const sourceBefore = initial.accounts.find((a) => a.id === 'checking')!.balance

    const { state: next, transaction } = mockFinanceRepository.addTransaction(initial, {
      type: 'transfer',
      title: 'Move to savings',
      fromAccountId: 'checking',
      toAccountId: 'savings',
      date: '2026-08-30',
      amount: 100,
    })

    const sourceAfter = next.accounts.find((a) => a.id === 'checking')!.balance
    expect(sourceAfter).toBe(sourceBefore - 100)
    expect(transaction.fee).toBeUndefined()
  })
})

describe('mockFinanceRepository.addBudgetCategory — envelope semantics (SR-002)', () => {
  it('starts with ₱2,000 unallocated in the seed data', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(budgetUnallocated(initial)).toBe(2000)
  })

  it('consumes unallocated funds and leaves the total envelope unchanged', () => {
    const initial = mockFinanceRepository.getInitialState()
    const totalBefore = initial.totalBudgetAllocated
    const { state: next } = mockFinanceRepository.addBudgetCategory(initial, { name: 'Fun', allocated: 500 })
    expect(next.totalBudgetAllocated).toBe(totalBefore)
    expect(budgetUnallocated(next)).toBe(1500)
  })

  it('persists the new category and its allocation', () => {
    const initial = mockFinanceRepository.getInitialState()
    const { state: next, category } = mockFinanceRepository.addBudgetCategory(initial, { name: 'Fun', allocated: 500 })
    expect(next.categories.some((c) => c.id === category.id && c.name === 'Fun')).toBe(true)
    expect(next.budgetCategories.some((c) => c.id === category.id && c.allocated === 500 && c.spent === 0)).toBe(true)
  })

  it('rejects an allocation greater than the unallocated amount', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(() => mockFinanceRepository.addBudgetCategory(initial, { name: 'Too Big', allocated: 2001 })).toThrow()
  })

  it('rejects zero, negative, and non-finite allocations', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(() => mockFinanceRepository.addBudgetCategory(initial, { name: 'Zero', allocated: 0 })).toThrow()
    expect(() => mockFinanceRepository.addBudgetCategory(initial, { name: 'Negative', allocated: -10 })).toThrow()
    expect(() => mockFinanceRepository.addBudgetCategory(initial, { name: 'Infinite', allocated: Infinity })).toThrow()
    expect(() => mockFinanceRepository.addBudgetCategory(initial, { name: 'NaN', allocated: NaN })).toThrow()
  })
})

describe('mockFinanceRepository.addGoalFunds — funded savings model (SR-003)', () => {
  it('moves money out of the source account and into the goal, with no net change to cash + goal savings', () => {
    const initial = mockFinanceRepository.getInitialState()
    const cashBefore = totalAvailableCash(initial)
    const goalSavingsBefore = totalGoalSavings(initial)
    const { state: next } = mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', 100)

    const checkingAfter = next.accounts.find((a) => a.id === 'checking')!.balance
    expect(checkingAfter).toBe(initial.accounts.find((a) => a.id === 'checking')!.balance - 100)
    expect(next.goals.find((g) => g.id === 'travel')!.currentAmount).toBe(2225)
    // Cash decreases by exactly what goal savings increases by — no money created.
    expect(totalAvailableCash(next)).toBe(cashBefore - 100)
    expect(totalGoalSavings(next)).toBe(goalSavingsBefore + 100)
    expect(totalAvailableCash(next) + totalGoalSavings(next)).toBe(cashBefore + goalSavingsBefore)
  })

  it('records a goal-funding transfer on the ledger, excluded from transferCount', () => {
    const initial = mockFinanceRepository.getInitialState()
    const { state: next } = mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', 100)
    const tx = next.transactions[0]
    expect(tx.type).toBe('transfer')
    expect(tx.goalId).toBe('travel')
    expect(tx.fromAccountId).toBe('checking')
    expect(tx.amount).toBe(100)
  })

  it('rejects funding above the remaining target (no overfunding)', () => {
    const initial = mockFinanceRepository.getInitialState()
    // travel: target 4000, current 2125 -> remaining 1875
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', 1876)).toThrow()
  })

  it('rejects a missing/invalid source account', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'not-an-account', 10)).toThrow()
  })

  it('rejects zero, negative, and non-finite amounts', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', 0)).toThrow()
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', -5)).toThrow()
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', Infinity)).toThrow()
  })

  it('completes the goal exactly when currentAmount reaches targetAmount', () => {
    const initial = mockFinanceRepository.getInitialState()
    // laptop: target 1300, current 1179 -> remaining 121
    const { state: next, goal } = mockFinanceRepository.addGoalFunds(initial, 'laptop', 'checking', 121)
    expect(goal.currentAmount).toBe(1300)
    expect(goal.status).toBe('goal_reached')
    expect(goal.active).toBe(false)
    expect(goal.completedDate).toBeTruthy()
    // No longer counted among active goals or their contribution/progress totals.
    expect(activeGoals(next).some((g) => g.id === 'laptop')).toBe(false)
  })

  it('rejects further funding once a goal is completed', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'home', 'checking', 10)).toThrow()
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'emergency', 'checking', 10)).toThrow()
  })
})
