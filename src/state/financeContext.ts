import { createContext } from 'react'
import type {
  Account,
  AddBudgetCategoryInput,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  BudgetCategory,
  CreateGoalInput,
  CreditCard,
  FinanceState,
  Goal,
  Transaction,
} from '../domain/finance'

export interface FinanceContextValue {
  state: FinanceState
  /**
   * "Today" as resolved once from the provider's injected `AppClock`
   * (TR-001). Every time-dependent figure in the app — reporting period,
   * form default dates, trend buckets, budget days remaining, goal target
   * validation — derives from this single value, so nothing can drift onto
   * a second clock.
   */
  todayIso: string
  addTransaction: (input: AddTransactionInput) => Transaction
  addManualAccount: (input: AddManualAccountInput) => Account
  addManualCreditCard: (input: AddManualCreditCardInput) => CreditCard
  addBudgetCategory: (input: AddBudgetCategoryInput) => BudgetCategory
  createGoal: (input: CreateGoalInput) => Goal
  addGoalFunds: (goalId: string, sourceAccountId: string, amount: number) => Goal
}

export const FinanceContext = createContext<FinanceContextValue | null>(null)
