import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type {
  AddBudgetCategoryInput,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  CreateGoalInput,
} from '../domain/finance'
import type { FinanceRepository } from '../services/financeRepository'
import { createMockFinanceRepository } from '../services/mockFinanceRepository'
import type { AppClock } from '../utils/clock'
import { demoClock } from '../utils/clock'
import { createFinanceStore } from './financeStore'
import { FinanceContext, type FinanceContextValue } from './financeContext'

export interface FinanceProviderProps {
  children: ReactNode
  /**
   * The data layer to run mutations against. Defaults to an in-memory mock
   * repository bound to `clock`. Tests (or a future real backend adapter —
   * see `financeRepository.ts` for the honest scope of that seam today) can
   * pass their own `FinanceRepository` to get deterministic, isolated state.
   */
  repository?: FinanceRepository
  /**
   * The one application clock (TR-001). Everything time-dependent in the app
   * — the active reporting period, the Add Transaction form's default date,
   * trend buckets, budget days remaining, goal target validation, and the
   * dates stamped on goal-funding/completion — resolves through this.
   * Defaults to the fixed demo clock; tests inject `fixedClock('…')` to
   * freeze or advance time.
   */
  clock?: AppClock
}

/**
 * TR-006: React-safe state wiring. The authoritative finance state lives in
 * an external store (`financeStore.ts`) read through `useSyncExternalStore`
 * — no ref is written or read during render to keep mutations fresh, and no
 * non-component value is exported from this module.
 */
export function FinanceProvider({ children, clock = demoClock, repository }: FinanceProviderProps) {
  // Falling back to a mock built from THIS provider's clock keeps the one
  // clock rule intact even when no repository is injected.
  const [defaultRepository] = useState(() => createMockFinanceRepository(clock))
  const activeRepository = repository ?? defaultRepository

  // `useState`'s initializer creates one store per provider instance without
  // touching a ref during render. Seeding it is pure (it only reads
  // `getInitialState()`), so React Strict Mode's double-invoke simply
  // discards one unused store.
  const [store] = useState(() => createFinanceStore(activeRepository.getInitialState()))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  const addTransaction = useCallback(
    (input: AddTransactionInput) =>
      store.run((s) => {
        const { state: next, transaction } = activeRepository.addTransaction(s, input)
        return { state: next, result: transaction }
      }),
    [store, activeRepository],
  )

  const addManualAccount = useCallback(
    (input: AddManualAccountInput) =>
      store.run((s) => {
        const { state: next, account } = activeRepository.addManualAccount(s, input)
        return { state: next, result: account }
      }),
    [store, activeRepository],
  )

  const addManualCreditCard = useCallback(
    (input: AddManualCreditCardInput) =>
      store.run((s) => {
        const { state: next, creditCard } = activeRepository.addManualCreditCard(s, input)
        return { state: next, result: creditCard }
      }),
    [store, activeRepository],
  )

  const addBudgetCategory = useCallback(
    (input: AddBudgetCategoryInput) =>
      store.run((s) => {
        const { state: next, category } = activeRepository.addBudgetCategory(s, input)
        return { state: next, result: category }
      }),
    [store, activeRepository],
  )

  const createGoal = useCallback(
    (input: CreateGoalInput) =>
      store.run((s) => {
        const { state: next, goal } = activeRepository.createGoal(s, input)
        return { state: next, result: goal }
      }),
    [store, activeRepository],
  )

  const addGoalFunds = useCallback(
    (goalId: string, sourceAccountId: string, amount: number) =>
      store.run((s) => {
        const { state: next, goal } = activeRepository.addGoalFunds(s, goalId, sourceAccountId, amount)
        return { state: next, result: goal }
      }),
    [store, activeRepository],
  )

  // Memoized so consumers don't re-render on unrelated parent renders — the
  // value changes only when the finance state or a mutation identity does.
  const value = useMemo<FinanceContextValue>(
    () => ({
      state,
      todayIso: clock.todayIso(),
      addTransaction,
      addManualAccount,
      addManualCreditCard,
      addBudgetCategory,
      createGoal,
      addGoalFunds,
    }),
    [state, clock, addTransaction, addManualAccount, addManualCreditCard, addBudgetCategory, createGoal, addGoalFunds],
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}
