import { createContext } from 'react'
import type {
  Account,
  AddCategoryInput,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  BudgetCategory,
  Category,
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
  /** Settings: create a category (name/color only), unbudgeted until Budget sets an amount. */
  addCategory: (input: AddCategoryInput) => Category | Promise<Category>
  /** Settings: rename/recolor a category. Never touches budget allocation. */
  updateCategory: (categoryId: string, updates: { name?: string; color?: string }) => Category | Promise<Category>
  /** Budget: set (or change) the budget amount for a category that already exists. */
  setCategoryBudget: (categoryId: string, allocated: number) => BudgetCategory | Promise<BudgetCategory>
  /** Settings: delete a category outright. */
  deleteCategory: (categoryId: string) => void | Promise<void>
  createGoal: (input: CreateGoalInput) => Goal | Promise<Goal>
  addGoalFunds: (goalId: string, sourceAccountId: string, amount: number) => Goal | Promise<Goal>
}

export const FinanceContext = createContext<FinanceContextValue | null>(null)
