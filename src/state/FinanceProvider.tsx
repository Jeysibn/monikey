import { useCallback, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type {
  AddBudgetCategoryInput,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  CreateGoalInput,
  FinanceState,
} from '../domain/finance'
import type { FinanceRepository } from '../services/financeRepository'
import { mockFinanceRepository } from '../services/mockFinanceRepository'
import { FinanceContext, type FinanceContextValue } from './financeContext'

// The reducer here is intentionally trivial and cannot throw: it only ever
// installs a next `FinanceState` that a `useCallback` below has *already*
// computed by calling the repository. This is what fixes two problems at
// once:
//
// 1. Stale closures / lost mutations: each `useCallback` reads the latest
//    state from `stateRef` (updated synchronously the instant a mutation
//    succeeds), not from the `state` value closed over at render time. So
//    two mutations fired back-to-back before any re-render each still see
//    the *result* of the previous one, not the same stale snapshot.
// 2. Catchable validation errors: because the repository call happens
//    directly inside the `useCallback` — on the caller's own synchronous
//    call stack — a validation throw (e.g. `addBudgetCategory` rejecting an
//    over-allocation) propagates as a normal exception straight back to
//    whatever `try/catch` in a page component invoked it. Nothing routes it
//    through React's dispatch machinery, where a thrown reducer would
//    surface as an uncaught `pageerror` and unmount the whole tree instead.
type Action = { type: 'SET_STATE'; state: FinanceState }

/** Exported for the regression test below — trivial and pure, no repository calls, cannot throw. */
export function createReducer() {
  return function reducer(state: FinanceState, action: Action): FinanceState {
    switch (action.type) {
      case 'SET_STATE':
        return action.state
      default:
        return state
    }
  }
}

export interface FinanceProviderProps {
  children: ReactNode
  /**
   * The data layer to run mutations against. Defaults to the in-memory
   * `mockFinanceRepository`. Tests (or a future real backend adapter — see
   * `financeRepository.ts` for the honest scope of that seam today) can pass
   * their own `FinanceRepository` to get deterministic, isolated state.
   */
  repository?: FinanceRepository
}

export function FinanceProvider({ children, repository = mockFinanceRepository }: FinanceProviderProps) {
  const reducer = useMemo(() => createReducer(), [])
  const [state, dispatch] = useReducer(reducer, undefined, repository.getInitialState)

  // Always the latest state, updated synchronously the moment a mutation
  // succeeds — never stale across back-to-back calls made before React has
  // re-rendered. Kept in sync with `state` on every render too, so it never
  // drifts if `state` ever changes via some path other than these mutations.
  const stateRef = useRef(state)
  if (stateRef.current !== state) {
    stateRef.current = state
  }

  const addTransaction = useCallback(
    (input: AddTransactionInput) => {
      const { state: next, transaction } = repository.addTransaction(stateRef.current, input)
      stateRef.current = next
      dispatch({ type: 'SET_STATE', state: next })
      return transaction
    },
    [repository],
  )

  const addManualAccount = useCallback(
    (input: AddManualAccountInput) => {
      const { state: next, account } = repository.addManualAccount(stateRef.current, input)
      stateRef.current = next
      dispatch({ type: 'SET_STATE', state: next })
      return account
    },
    [repository],
  )

  const addManualCreditCard = useCallback(
    (input: AddManualCreditCardInput) => {
      const { state: next, creditCard } = repository.addManualCreditCard(stateRef.current, input)
      stateRef.current = next
      dispatch({ type: 'SET_STATE', state: next })
      return creditCard
    },
    [repository],
  )

  const addBudgetCategory = useCallback(
    (input: AddBudgetCategoryInput) => {
      const { state: next, category } = repository.addBudgetCategory(stateRef.current, input)
      stateRef.current = next
      dispatch({ type: 'SET_STATE', state: next })
      return category
    },
    [repository],
  )

  const createGoal = useCallback(
    (input: CreateGoalInput) => {
      const { state: next, goal } = repository.createGoal(stateRef.current, input)
      stateRef.current = next
      dispatch({ type: 'SET_STATE', state: next })
      return goal
    },
    [repository],
  )

  const addGoalFunds = useCallback(
    (goalId: string, sourceAccountId: string, amount: number) => {
      const { state: next, goal } = repository.addGoalFunds(stateRef.current, goalId, sourceAccountId, amount)
      stateRef.current = next
      dispatch({ type: 'SET_STATE', state: next })
      return goal
    },
    [repository],
  )

  const value: FinanceContextValue = {
    state,
    addTransaction,
    addManualAccount,
    addManualCreditCard,
    addBudgetCategory,
    createGoal,
    addGoalFunds,
  }

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}
