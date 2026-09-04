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
  addTransaction: (input: AddTransactionInput) => Transaction | Promise<Transaction>
  updateTransaction: (transactionId: string, input: Partial<AddTransactionInput>) => Transaction | Promise<Transaction>
  reverseTransaction: (transactionId: string) => Transaction | Promise<Transaction>
  addManualAccount: (input: AddManualAccountInput) => Account | Promise<Account>
  addManualCreditCard: (input: AddManualCreditCardInput) => CreditCard | Promise<CreditCard>
  addBudgetCategory: (input: AddBudgetCategoryInput) => BudgetCategory | Promise<BudgetCategory>
  updateCategory: (categoryId: string, updates: { name?: string; allocated?: number }) => BudgetCategory | Promise<BudgetCategory>
  deleteCategory: (categoryId: string) => void | Promise<void>
  createGoal: (input: CreateGoalInput) => Goal | Promise<Goal>
  addGoalFunds: (goalId: string, sourceAccountId: string, amount: number) => Goal | Promise<Goal>
}

export const FinanceContext = createContext<FinanceContextValue | null>(null)
