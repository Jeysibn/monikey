import { useCallback, useReducer, type ReactNode } from 'react'
import type {
  AddBudgetCategoryInput,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  CreateGoalInput,
  FinanceState,
} from '../domain/finance'
import { mockFinanceRepository } from '../services/mockFinanceRepository'
import { FinanceContext, type FinanceContextValue } from './financeContext'

// Mutations call the repository once (outside the reducer, inside each
// callback below) to get both the next state and the created record, then
// dispatch the already-computed state. This avoids invoking the repository
// twice per mutation, which would mint two different ids for what should be
// one created record.
type Action = { type: 'SET_STATE'; state: FinanceState }

function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case 'SET_STATE':
      return action.state
    default:
      return state
  }
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, mockFinanceRepository.getInitialState)

  // Mutations compute their result via the repository synchronously (no
  // fake async delay), dispatch the resulting next state, and hand the
  // created record back to the caller so a form can show a confirmation
  // referencing the thing it just created.
  const addTransaction = useCallback((input: AddTransactionInput) => {
    const { state: next, transaction } = mockFinanceRepository.addTransaction(state, input)
    dispatch({ type: 'SET_STATE', state: next })
    return transaction
  }, [state])

  const addManualAccount = useCallback((input: AddManualAccountInput) => {
    const { state: next, account } = mockFinanceRepository.addManualAccount(state, input)
    dispatch({ type: 'SET_STATE', state: next })
    return account
  }, [state])

  const addManualCreditCard = useCallback((input: AddManualCreditCardInput) => {
    const { state: next, creditCard } = mockFinanceRepository.addManualCreditCard(state, input)
    dispatch({ type: 'SET_STATE', state: next })
    return creditCard
  }, [state])

  const addBudgetCategory = useCallback((input: AddBudgetCategoryInput) => {
    const { state: next, category } = mockFinanceRepository.addBudgetCategory(state, input)
    dispatch({ type: 'SET_STATE', state: next })
    return category
  }, [state])

  const createGoal = useCallback((input: CreateGoalInput) => {
    const { state: next, goal } = mockFinanceRepository.createGoal(state, input)
    dispatch({ type: 'SET_STATE', state: next })
    return goal
  }, [state])

  const addGoalFunds = useCallback((goalId: string, amount: number) => {
    const next = mockFinanceRepository.addGoalFunds(state, goalId, amount)
    dispatch({ type: 'SET_STATE', state: next })
  }, [state])

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
