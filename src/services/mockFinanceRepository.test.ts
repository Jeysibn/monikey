import { describe, expect, it } from 'vitest'
import { createMockFinanceRepository, mockFinanceRepository } from './mockFinanceRepository'
import {
  activeGoals,
  activeReportingPeriod,
  budgetUnallocated,
  safeToSpendBreakdown,
  totalAvailableCash,
  totalBudgetSpent,
  totalCreditOwed,
  totalExpenses,
  totalGoalSavings,
  totalIncome,
} from '../state/financeSelectors'
import { FinanceValidationError, maxFundableAmount, validateAddGoalFunds } from '../domain/financeRules'
import { formatMoney } from '../utils/currency'
import { parseMoneyInput } from '../utils/money'
import { DEMO_TODAY_ISO, fixedClock } from '../utils/clock'
import { isValidIsoDate, isValidTime24 } from '../utils/date'
import type { AddTransactionInput, FinanceState } from '../domain/finance'

/**
 * Asserts a mutation is rejected for the SPECIFIC documented reason, not just
 * that something threw. A bare `.toThrow()` passes on any error — including a
 * TypeError from a renamed field — so it cannot guard the invariant it names.
 */
function expectRejection(run: () => unknown, code: string, field?: string): FinanceValidationError {
  let thrown: unknown
  try {
    run()
  } catch (err) {
    thrown = err
  }
  expect(thrown, `expected a ${code} rejection, but nothing was thrown`).toBeInstanceOf(FinanceValidationError)
  const error = thrown as FinanceValidationError
  expect(error.code).toBe(code)
  if (field) expect(error.field).toBe(field)
  expect(error.message.length).toBeGreaterThan(0)
  return error
}

/**
 * Captures the identity of every mutable collection in a state, so a rejected
 * mutation can be proven to have returned the caller's own objects untouched —
 * not merely a deep-equal rebuild. Taken from the LIVE state, never a clone:
 * comparing a clone's references to itself is a tautology that cannot fail.
 */
function collectionIdentities(state: FinanceState) {
  return {
    accounts: state.accounts,
    creditCards: state.creditCards,
    transactions: state.transactions,
    budgetCategories: state.budgetCategories,
    goals: state.goals,
    categories: state.categories,
  }
}

/** Runs a mutation expected to fail and proves the state is byte-for-byte and reference-for-reference unchanged. */
function expectStateUntouched(state: FinanceState, run: () => unknown, code: string): void {
  const before = structuredClone(state)
  const identities = collectionIdentities(state)
  expectRejection(run, code)
  expect(state).toEqual(before)
  for (const [name, ref] of Object.entries(identities)) {
    expect(state[name as keyof typeof identities], `${name} must be the very same array`).toBe(ref)
  }
}

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
    expectRejection(
      () => mockFinanceRepository.addBudgetCategory(initial, { name: 'Too Big', allocated: 2001 }),
      'BUDGET_ALLOCATION_EXCEEDS_UNALLOCATED',
      'allocated',
    )
  })

  it('rejects zero, negative, and non-finite allocations', () => {
    const initial = mockFinanceRepository.getInitialState()
    for (const allocated of [0, -10, Infinity, NaN]) {
      expectRejection(
        () => mockFinanceRepository.addBudgetCategory(initial, { name: 'Bad', allocated }),
        'BUDGET_ALLOCATION_INVALID',
        'allocated',
      )
    }
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
    expectRejection(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', 1876), 'GOAL_OVERFUNDING', 'amount')
    // …and exactly the remaining amount is accepted, so the boundary is the
    // stated one rather than merely "somewhere below 1876".
    expect(mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', 1875).goal.currentAmount).toBe(4000)
  })

  it('rejects a missing/invalid source account', () => {
    const initial = mockFinanceRepository.getInitialState()
    expectRejection(
      () => mockFinanceRepository.addGoalFunds(initial, 'travel', 'not-an-account', 10),
      'GOAL_SOURCE_UNKNOWN',
      'sourceAccountId',
    )
    // A credit card is not a fundable source either.
    expectRejection(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'visa', 10), 'GOAL_SOURCE_UNKNOWN', 'sourceAccountId')
  })

  it('rejects zero, negative, and non-finite amounts', () => {
    const initial = mockFinanceRepository.getInitialState()
    for (const amount of [0, -5, Infinity, NaN]) {
      expectRejection(() => mockFinanceRepository.addGoalFunds(initial, 'travel', 'checking', amount), 'GOAL_FUNDS_AMOUNT_INVALID', 'amount')
    }
  })

  it('completes the goal exactly when currentAmount reaches targetAmount', () => {
    const initial = mockFinanceRepository.getInitialState()
    // laptop: target 1300, current 1179 -> remaining 121
    const { state: next, goal } = mockFinanceRepository.addGoalFunds(initial, 'laptop', 'checking', 121)
    expect(goal.currentAmount).toBe(1300)
    expect(goal.status).toBe('goal_reached')
    expect(goal.active).toBe(false)
    // The exact date, from the injected clock — not merely "some truthy value".
    expect(goal.completedDate).toBe(DEMO_TODAY_ISO)
    // No longer counted among active goals or their contribution/progress totals.
    expect(activeGoals(next).some((g) => g.id === 'laptop')).toBe(false)
  })

  it('rejects further funding once a goal is completed', () => {
    const initial = mockFinanceRepository.getInitialState()
    // Asserting the code matters here: a bare toThrow() would stay green on a
    // GOAL_UNKNOWN rejection if these seed ids were ever renamed, testing
    // nothing at all about completion.
    for (const goalId of ['home', 'emergency']) {
      expect(initial.goals.some((g) => g.id === goalId && !g.active)).toBe(true)
      expectRejection(() => mockFinanceRepository.addGoalFunds(initial, goalId, 'checking', 10), 'GOAL_INACTIVE', 'goalId')
    }
  })
})

// TR-002: the repository is the authority on the finance invariants. Every
// case below calls it DIRECTLY, with no form involved, so these prove the
// rule holds independently of UI validation.
describe('mockFinanceRepository.addTransaction — repository-enforced invariants (TR-002)', () => {
  const initial = () => mockFinanceRepository.getInitialState()

  it('rejects a non-finite or non-positive amount', () => {
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, amount: NaN })).toThrow(FinanceValidationError)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, amount: Infinity })).toThrow(FinanceValidationError)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, amount: 0 })).toThrow(FinanceValidationError)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, amount: -5 })).toThrow(FinanceValidationError)
  })

  it('rejects an unknown account id', () => {
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, accountId: 'nope' })).toThrow(/account/i)
  })

  it('rejects a missing account id — no ledger row without a balance movement', () => {
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, accountId: undefined })).toThrow(/account/i)
  })

  it('rejects an unknown category and a category that does not apply to the type', () => {
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, categoryId: 'nope' })).toThrow(/category/i)
    // Salary is income-only: it may not be attached to an expense.
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, categoryId: 'salary' })).toThrow(/salary/i)
    // Housing is expense-only: it may not be attached to income.
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), { ...baseInput, type: 'income', categoryId: 'housing' }),
    ).toThrow(/housing/i)
  })

  it('rejects a missing category', () => {
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, categoryId: undefined })).toThrow(/category/i)
  })

  it('rejects an impossible calendar date and an impossible time', () => {
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, date: '2026-02-31' })).toThrow(/date/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, date: '2026-13-01' })).toThrow(/date/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, time: '24:00' })).toThrow(/time/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...baseInput, time: '12:60' })).toThrow(/time/i)
  })

  it('rejects a same-account transfer', () => {
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), {
        type: 'transfer',
        title: 'Round trip',
        fromAccountId: 'checking',
        toAccountId: 'checking',
        date: '2026-08-30',
        amount: 10,
      }),
    ).toThrow(/same/i)
  })

  it('rejects a transfer with a missing destination, an unknown destination, or a category', () => {
    const base = { type: 'transfer' as const, title: 'T', fromAccountId: 'checking', date: '2026-08-30', amount: 10 }
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base })).toThrow(/to account/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base, toAccountId: 'nope' })).toThrow(/account/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base, toAccountId: 'savings', categoryId: 'food' })).toThrow(/category/i)
  })

  it('rejects a negative or non-finite fee', () => {
    const base = { type: 'transfer' as const, title: 'T', fromAccountId: 'checking', toAccountId: 'savings', date: '2026-08-30', amount: 10 }
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base, fee: -1 })).toThrow(/fee/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base, fee: NaN })).toThrow(/fee/i)
  })

  it('rejects a mutation with a structured code and field, not just a message', () => {
    try {
      mockFinanceRepository.addTransaction(initial(), { ...baseInput, categoryId: 'salary' })
      throw new Error('expected a rejection')
    } catch (err) {
      expect(err).toBeInstanceOf(FinanceValidationError)
      expect((err as FinanceValidationError).code).toBe('TX_CATEGORY_TYPE_MISMATCH')
      expect((err as FinanceValidationError).field).toBe('categoryId')
    }
  })

  it('leaves state completely unchanged when a mutation is rejected — every rejection path', () => {
    // Each case: the caller's state must come back deep-equal AND with the
    // very same array references, proving nothing was rebuilt or partially
    // applied before the rule fired.
    const state = initial()

    expectStateUntouched(state, () => mockFinanceRepository.addTransaction(state, { ...baseInput, accountId: 'nope' }), 'TX_ACCOUNT_UNKNOWN')
    expectStateUntouched(state, () => mockFinanceRepository.addTransaction(state, { ...baseInput, amount: NaN }), 'TX_AMOUNT_INVALID')
    expectStateUntouched(state, () => mockFinanceRepository.addTransaction(state, { ...baseInput, categoryId: 'salary' }), 'TX_CATEGORY_TYPE_MISMATCH')
    expectStateUntouched(state, () => mockFinanceRepository.addTransaction(state, { ...baseInput, date: '2026-02-31' }), 'TX_DATE_INVALID')
    // Asset overdraft (Cash Wallet holds ₱120).
    expectStateUntouched(
      state,
      () => mockFinanceRepository.addTransaction(state, { ...baseInput, accountId: 'cash', amount: 500 }),
      'ASSET_INSUFFICIENT_BALANCE',
    )
    // Credit limit.
    expectStateUntouched(
      state,
      () => mockFinanceRepository.addTransaction(state, { ...baseInput, accountId: 'visa', amount: 99_999 }),
      'TX_CARD_LIMIT_EXCEEDED',
    )
    // Same-account transfer.
    expectStateUntouched(
      state,
      () =>
        mockFinanceRepository.addTransaction(state, {
          type: 'transfer',
          title: 'Round trip',
          fromAccountId: 'checking',
          toAccountId: 'checking',
          date: '2026-08-30',
          amount: 10,
        }),
      'TX_TRANSFER_SAME_ACCOUNT',
    )
    // Card payment over the amount owed. ₱1,000 is inside Checking's ₱4,120
    // balance but above Mastercard's ₱610 owed, so this isolates the
    // card-payment rule rather than tripping the overdraft rule first.
    expectStateUntouched(
      state,
      () =>
        mockFinanceRepository.addTransaction(state, {
          type: 'transfer',
          title: 'Overpay',
          fromAccountId: 'checking',
          toAccountId: 'mastercard',
          date: '2026-08-30',
          amount: 1000,
        }),
      'TX_CARD_PAYMENT_EXCEEDS_OWED',
    )
    // Budget over-allocation.
    expectStateUntouched(state, () => mockFinanceRepository.addBudgetCategory(state, { name: 'Too Big', allocated: 2001 }), 'BUDGET_ALLOCATION_EXCEEDS_UNALLOCATED')
    // Card creation over its own limit.
    expectStateUntouched(
      state,
      () =>
        mockFinanceRepository.addManualCreditCard(state, {
          name: 'Overdrawn',
          lastFour: '1234',
          network: 'visa',
          balance: 5000,
          limit: 1000,
          dueDate: '2026-09-20',
          minPayment: 10,
        }),
      'CARD_BALANCE_OVER_LIMIT',
    )
    // Account creation with a negative starting balance.
    expectStateUntouched(state, () => mockFinanceRepository.addManualAccount(state, { name: 'Jar', type: 'cash', balance: -1 }), 'ACCOUNT_BALANCE_INVALID')
    // Goal creation in the past, and goal funding beyond the source balance.
    expectStateUntouched(state, () => mockFinanceRepository.createGoal(state, { name: 'Old', targetAmount: 100, targetDate: '2020-01-01' }), 'GOAL_TARGET_DATE_PAST')
    expectStateUntouched(state, () => mockFinanceRepository.addGoalFunds(state, 'car', 'cash', 500), 'ASSET_INSUFFICIENT_BALANCE')

    // Balances specifically are still the seeded ones after all of that.
    expect(state.accounts.find((a) => a.id === 'checking')!.balance).toBe(4120)
    expect(state.accounts.find((a) => a.id === 'cash')!.balance).toBe(120)
    expect(state.creditCards.find((c) => c.id === 'visa')!.balance).toBe(1460)
  })
})

describe('balance rules (TR-002): asset overdraft, credit limit, card payment', () => {
  const initial = () => mockFinanceRepository.getInitialState()

  it('refuses to drive an asset account negative with an expense', () => {
    // Cash Wallet holds ₱120.
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), { ...baseInput, accountId: 'cash', amount: 121 }),
    ).toThrow(/only has/i)
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), { ...baseInput, accountId: 'cash', amount: 120 }),
    ).not.toThrow()
  })

  it('refuses to drive an asset account negative through a transfer, counting the fee', () => {
    const base = { type: 'transfer' as const, title: 'T', fromAccountId: 'cash', toAccountId: 'savings', date: '2026-08-30' }
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base, amount: 120, fee: 1 })).toThrow(/only has/i)
    expect(() => mockFinanceRepository.addTransaction(initial(), { ...base, amount: 119, fee: 1 })).not.toThrow()
  })

  it('refuses a charge that would exceed a credit card’s limit', () => {
    // Visa: ₱1,460 owed of a ₱5,000 limit -> ₱3,540 of credit left.
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), { ...baseInput, accountId: 'visa', amount: 3541 }),
    ).toThrow(/credit left/i)
    const { state: next } = mockFinanceRepository.addTransaction(initial(), { ...baseInput, accountId: 'visa', amount: 3540 })
    expect(next.creditCards.find((c) => c.id === 'visa')!.balance).toBe(5000)
  })

  it('refuses income deposited into a credit card', () => {
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), { ...baseInput, type: 'income', categoryId: 'salary', accountId: 'visa' }),
    ).toThrow(/cash account/i)
  })

  it('refuses a card-to-asset cash advance', () => {
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), {
        type: 'transfer',
        title: 'Advance',
        fromAccountId: 'visa',
        toAccountId: 'checking',
        date: '2026-08-30',
        amount: 100,
      }),
    ).toThrow(/cash advance/i)
  })

  it('refuses a card payment larger than the amount owed', () => {
    // Mastercard owes ₱610.
    expect(() =>
      mockFinanceRepository.addTransaction(initial(), {
        type: 'transfer',
        title: 'Overpay',
        fromAccountId: 'checking',
        toAccountId: 'mastercard',
        date: '2026-08-30',
        amount: 611,
      }),
    ).toThrow(/only owes/i)
  })
})

// TR-003: a bank → credit-card payment keeps transfer semantics.
describe('credit-card payment reconciliation (TR-003)', () => {
  it('reduces cash and credit owed by the same amount, changing neither income nor expenses', () => {
    const initial = mockFinanceRepository.getInitialState()
    const period = activeReportingPeriod(DEMO_TODAY_ISO)
    const incomeBefore = totalIncome(initial, period)
    const expensesBefore = totalExpenses(initial, period)
    const checkingBefore = initial.accounts.find((a) => a.id === 'checking')!.balance
    const visaBefore = initial.creditCards.find((c) => c.id === 'visa')!.balance

    const { state: next, transaction } = mockFinanceRepository.addTransaction(initial, {
      type: 'transfer',
      title: 'Card payment · Checking ••4471 → Visa Platinum ••2290',
      fromAccountId: 'checking',
      toAccountId: 'visa',
      date: '2026-08-30',
      amount: 500,
    })

    expect(next.accounts.find((a) => a.id === 'checking')!.balance).toBe(checkingBefore - 500)
    expect(next.creditCards.find((c) => c.id === 'visa')!.balance).toBe(visaBefore - 500)
    expect(totalIncome(next, period)).toBe(incomeBefore)
    expect(totalExpenses(next, period)).toBe(expensesBefore)
    expect(transaction.type).toBe('transfer')
    // Cash + credit owed both fall by 500: net worth is unchanged, no money
    // was created or destroyed.
    expect(totalAvailableCash(next)).toBe(totalAvailableCash(initial) - 500)
    expect(totalCreditOwed(next)).toBe(totalCreditOwed(initial) - 500)
  })

  it('is not counted as a budget expense even when dated inside the reporting period', () => {
    const initial = mockFinanceRepository.getInitialState()
    const spentBefore = totalBudgetSpent(initial)
    const { state: next } = mockFinanceRepository.addTransaction(initial, {
      type: 'transfer',
      title: 'Card payment',
      fromAccountId: 'checking',
      toAccountId: 'visa',
      date: '2026-08-30',
      amount: 200,
    })
    expect(totalBudgetSpent(next)).toBe(spentBefore)
  })
})

describe('mockFinanceRepository.addManualCreditCard — card metadata (TR-003)', () => {
  const validCard = {
    name: 'BPI Rewards',
    lastFour: '9911',
    network: 'visa' as const,
    balance: 200,
    limit: 3000,
    dueDate: '2026-09-20',
    minPayment: 40,
  }

  it('stores a real due date and minimum payment', () => {
    const { state: next, creditCard } = mockFinanceRepository.addManualCreditCard(mockFinanceRepository.getInitialState(), validCard)
    expect(creditCard.dueDate).toBe('2026-09-20')
    expect(creditCard.minPayment).toBe(40)
    expect(next.creditCards.some((c) => c.id === creditCard.id)).toBe(true)
  })

  it('makes the new card’s minimum count toward the money position once it is inside the horizon', () => {
    const initial = mockFinanceRepository.getInitialState()
    const before = safeToSpendBreakdown(initial, DEMO_TODAY_ISO)
    const { state: next } = mockFinanceRepository.addManualCreditCard(initial, validCard)
    const after = safeToSpendBreakdown(next, DEMO_TODAY_ISO)
    expect(after.upcomingCreditMinimums).toBe(before.upcomingCreditMinimums + 40)
    expect(after.cardsDueCount).toBe(before.cardsDueCount + 1)

    // A card due far outside the 30-day horizon adds nothing.
    const { state: far } = mockFinanceRepository.addManualCreditCard(initial, { ...validCard, lastFour: '9912', dueDate: '2027-05-01', minPayment: 500 })
    expect(safeToSpendBreakdown(far, DEMO_TODAY_ISO).upcomingCreditMinimums).toBe(before.upcomingCreditMinimums)
  })

  it('rejects a missing or impossible due date, a bad minimum, and a balance over the limit', () => {
    const initial = mockFinanceRepository.getInitialState()
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, dueDate: 'Not set' }), 'CARD_DUE_DATE_INVALID', 'dueDate')
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, dueDate: '2026-02-31' }), 'CARD_DUE_DATE_INVALID', 'dueDate')
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, minPayment: -1 }), 'CARD_MIN_PAYMENT_INVALID', 'minPayment')
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, balance: 4000 }), 'CARD_BALANCE_OVER_LIMIT', 'balance')
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, lastFour: '99' }), 'CARD_LAST_FOUR_INVALID', 'lastFour')
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, limit: 0 }), 'CARD_LIMIT_INVALID', 'limit')
  })

  // FINDING-009: a card whose due date is already past can never fall inside
  // the 30-day commitment horizon, so it would be stored as a card that
  // silently never counts — the exact failure TR-003 exists to remove.
  it('rejects a due date already in the past, measured against the injected clock', () => {
    const initial = mockFinanceRepository.getInitialState()
    expectRejection(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, dueDate: '2024-01-05' }), 'CARD_DUE_DATE_PAST', 'dueDate')
    // Today itself is still acceptable — the horizon is inclusive of today.
    expect(() => mockFinanceRepository.addManualCreditCard(initial, { ...validCard, dueDate: DEMO_TODAY_ISO })).not.toThrow()
    // And the rule follows the clock rather than a hardcoded date.
    const future = createMockFinanceRepository(fixedClock('2027-01-15'))
    expectRejection(() => future.addManualCreditCard(initial, { ...validCard, dueDate: '2026-09-20' }), 'CARD_DUE_DATE_PAST', 'dueDate')
  })
})

describe('mockFinanceRepository.addManualAccount — invariants', () => {
  it('rejects a nameless account and a negative starting balance (no account starts overdrawn)', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(() => mockFinanceRepository.addManualAccount(initial, { name: '  ', type: 'cash', balance: 10 })).toThrow(/name/i)
    expect(() => mockFinanceRepository.addManualAccount(initial, { name: 'Jar', type: 'cash', balance: -1 })).toThrow(/zero or more/i)
    expectRejection(() => mockFinanceRepository.addManualAccount(initial, { name: 'Jar', type: 'cash', balance: NaN }), 'ACCOUNT_BALANCE_INVALID', 'balance')
  })
})

describe('goal funding integrity (TR-004)', () => {
  it('rejects funding above the source account’s available balance', () => {
    const initial = mockFinanceRepository.getInitialState()
    // Cash Wallet holds ₱120; the Car goal still needs ₱4,987.
    expect(() => mockFinanceRepository.addGoalFunds(initial, 'car', 'cash', 500)).toThrow(/only has/i)
    expect(initial.accounts.find((a) => a.id === 'cash')!.balance).toBe(120)
  })

  it('allows funding up to exactly the source balance', () => {
    const initial = mockFinanceRepository.getInitialState()
    const { state: next } = mockFinanceRepository.addGoalFunds(initial, 'car', 'cash', 120)
    expect(next.accounts.find((a) => a.id === 'cash')!.balance).toBe(0)
    expect(next.goals.find((g) => g.id === 'car')!.currentAmount).toBe(133)
  })

  it('exposes the max fundable amount as the smaller of balance and remaining', () => {
    const initial = mockFinanceRepository.getInitialState()
    // Car needs 4,987 but Cash Wallet only holds 120 -> 120 is the ceiling.
    expect(maxFundableAmount(initial, 'car', 'cash')).toBe(120)
    // Laptop needs 121 while Checking holds 4,120 -> 121 is the ceiling.
    expect(maxFundableAmount(initial, 'laptop', 'checking')).toBe(121)
  })

  it('every seed goal satisfies the same no-overfunding invariant as user-created goals', () => {
    const initial = mockFinanceRepository.getInitialState()
    expect(initial.goals.length).toBeGreaterThan(0)
    for (const goal of initial.goals) {
      expect(goal.currentAmount).toBeLessThanOrEqual(goal.targetAmount)
    }
    // The specific goal that used to violate it (₱3,743 against a ₱3,500
    // target) is pinned, so a seed edit can't quietly reintroduce it.
    expect(initial.goals.find((g) => g.id === 'home')!.currentAmount).toBe(3500)
  })

  it('leaves state untouched when funding is rejected', () => {
    const state = mockFinanceRepository.getInitialState()
    expectStateUntouched(state, () => mockFinanceRepository.addGoalFunds(state, 'car', 'cash', 500), 'ASSET_INSUFFICIENT_BALANCE')
  })
})

describe('seed data storage formats (TR-008)', () => {
  const initial = mockFinanceRepository.getInitialState()

  it('stores every transaction date as a strict ISO date and every time as strict HH:mm', () => {
    expect(initial.transactions.length).toBeGreaterThan(0)
    const timed = initial.transactions.filter((t) => t.time !== undefined)
    expect(timed.length, 'the seed must actually exercise the time format').toBeGreaterThan(0)
    for (const t of initial.transactions) {
      expect(isValidIsoDate(t.date), `${t.id} date ${t.date}`).toBe(true)
      if (t.time !== undefined) expect(isValidTime24(t.time), `${t.id} time ${t.time}`).toBe(true)
    }
    // A concrete pin: the seed once stored 12-hour display text ('9:14 AM').
    expect(initial.transactions.find((t) => t.id === 'tx1')!.time).toBe('09:14')
  })

  it('stores goal target/completed dates and card due dates as ISO dates, not presentation strings', () => {
    expect(initial.goals.length).toBeGreaterThan(0)
    expect(initial.creditCards.length).toBeGreaterThan(0)
    const completed = initial.goals.filter((g) => g.completedDate)
    expect(completed.length, 'the seed must actually exercise the completed-date format').toBeGreaterThan(0)
    for (const g of initial.goals) {
      expect(isValidIsoDate(g.targetDate), `${g.id} targetDate ${g.targetDate}`).toBe(true)
      if (g.completedDate) expect(isValidIsoDate(g.completedDate), `${g.id} completedDate`).toBe(true)
    }
    for (const c of initial.creditCards) {
      expect(isValidIsoDate(c.dueDate), `${c.id} dueDate ${c.dueDate}`).toBe(true)
    }
    // Concrete pins: these were 'Mar 2027' and 'Sep 15' before TR-008.
    expect(initial.goals.find((g) => g.id === 'travel')!.targetDate).toBe('2027-03-01')
    expect(initial.creditCards.find((c) => c.id === 'visa')!.dueDate).toBe('2026-09-15')
  })
})

// FINDING-001: a ceiling the UI shows must be a ceiling the domain accepts.
// Rendering it rounded produced "Up to ₱120" over a ₱119.60 balance, and
// entering 120 was then rejected by an error naming the very amount it had
// just offered — leaving the real maximum undiscoverable.
describe('displayed ceilings round-trip through validation (TR-004 / FINDING-001)', () => {
  /** The exact string the Add Funds form renders, parsed back as the user would retype it. */
  function retypeDisplayedCeiling(display: string): number {
    const parsed = parseMoneyInput(display.replace(/[^0-9.,]/g, ''))
    expect(parsed.ok, `the displayed ceiling "${display}" must be re-enterable`).toBe(true)
    return parsed.ok ? parsed.value : NaN
  }

  function stateWithFractionalCash(): FinanceState {
    // Spend ₱0.40 from the ₱120 Cash Wallet, exactly as the seed ledger's own
    // fractional amounts (₱6.40, ₱41.85) would.
    const { state } = mockFinanceRepository.addTransaction(mockFinanceRepository.getInitialState(), {
      ...baseInput,
      accountId: 'cash',
      amount: 0.4,
    })
    expect(state.accounts.find((a) => a.id === 'cash')!.balance).toBeCloseTo(119.6, 10)
    return state
  }

  it('the fundable ceiling is shown to the centavo and is accepted verbatim', () => {
    const state = stateWithFractionalCash()
    const ceiling = maxFundableAmount(state, 'car', 'cash')
    expect(ceiling).toBeCloseTo(119.6, 10)

    const displayed = formatMoney(ceiling)
    expect(displayed).toBe('₱119.60')

    // The headline defect: entering exactly what the form offers must work.
    const retyped = retypeDisplayedCeiling(displayed)
    expect(() => validateAddGoalFunds(state, 'car', 'cash', retyped)).not.toThrow()
    const { state: funded } = mockFinanceRepository.addGoalFunds(state, 'car', 'cash', retyped)
    expect(funded.accounts.find((a) => a.id === 'cash')!.balance).toBeCloseTo(0, 10)

    // The rounded rendering it replaced would have been rejected.
    expect(formatMoney(ceiling, { withCents: false })).toBe('₱120')
    expectRejection(() => mockFinanceRepository.addGoalFunds(state, 'car', 'cash', 120), 'ASSET_INSUFFICIENT_BALANCE', 'amount')
  })

  it('the insufficient-balance message names the exact balance, not a rounded one', () => {
    const state = stateWithFractionalCash()
    const error = expectRejection(() => mockFinanceRepository.addGoalFunds(state, 'car', 'cash', 120), 'ASSET_INSUFFICIENT_BALANCE')
    // Previously: "Cash Wallet only has ₱120 available." — refusing ₱120 while
    // naming ₱120 as what is available.
    expect(error.message).toContain('₱119.60')
    expect(error.message).not.toMatch(/₱120(?!\.)/)
  })

  it('the card-payment ceiling is likewise exact', () => {
    // Charge ₱0.35 to the Mastercard so its ₱610 owed becomes ₱610.35.
    const { state } = mockFinanceRepository.addTransaction(mockFinanceRepository.getInitialState(), {
      ...baseInput,
      accountId: 'mastercard',
      amount: 0.35,
    })
    const owed = state.creditCards.find((c) => c.id === 'mastercard')!.balance
    expect(owed).toBeCloseTo(610.35, 10)

    const error = expectRejection(
      () =>
        mockFinanceRepository.addTransaction(state, {
          type: 'transfer',
          title: 'Overpay',
          fromAccountId: 'checking',
          toAccountId: 'mastercard',
          date: '2026-08-30',
          amount: 611,
        }),
      'TX_CARD_PAYMENT_EXCEEDS_OWED',
    )
    expect(error.message).toContain('₱610.35')

    // And paying exactly what the message names clears the card.
    const paid = mockFinanceRepository.addTransaction(state, {
      type: 'transfer',
      title: 'Pay in full',
      fromAccountId: 'checking',
      toAccountId: 'mastercard',
      date: '2026-08-30',
      amount: retypeDisplayedCeiling(formatMoney(owed)),
    })
    expect(paid.state.creditCards.find((c) => c.id === 'mastercard')!.balance).toBeCloseTo(0, 10)
  })

  it('the remaining-target ceiling is exact too', () => {
    // Fund the Car goal by a fractional amount, then the remaining target is
    // fractional and the overfunding message must name it precisely.
    const { state } = mockFinanceRepository.addGoalFunds(mockFinanceRepository.getInitialState(), 'car', 'checking', 0.25)
    const goal = state.goals.find((g) => g.id === 'car')!
    const remaining = goal.targetAmount - goal.currentAmount
    expect(remaining).toBeCloseTo(4986.75, 10)

    const error = expectRejection(() => mockFinanceRepository.addGoalFunds(state, 'car', 'checking', 4987), 'GOAL_OVERFUNDING', 'amount')
    expect(error.message).toContain('₱4,986.75')
  })
})
