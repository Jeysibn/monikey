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
  addTransaction: (input: AddTransactionInput) => Transaction
  addManualAccount: (input: AddManualAccountInput) => Account
  addManualCreditCard: (input: AddManualCreditCardInput) => CreditCard
  addBudgetCategory: (input: AddBudgetCategoryInput) => BudgetCategory
  createGoal: (input: CreateGoalInput) => Goal
  addGoalFunds: (goalId: string, sourceAccountId: string, amount: number) => Goal
}

export const FinanceContext = createContext<FinanceContextValue | null>(null)
