// The contract the UI depends on for reading and mutating finance data.
// `mockFinanceRepository.ts` is the only implementation today (in-memory,
// synchronous). A future real backend would implement this same shape —
// components and the provider would not need to change.

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

export interface FinanceRepository {
  getInitialState(): FinanceState
  addTransaction(state: FinanceState, input: AddTransactionInput): { state: FinanceState; transaction: Transaction }
  addManualAccount(state: FinanceState, input: AddManualAccountInput): { state: FinanceState; account: Account }
  addManualCreditCard(state: FinanceState, input: AddManualCreditCardInput): { state: FinanceState; creditCard: CreditCard }
  addBudgetCategory(state: FinanceState, input: AddBudgetCategoryInput): { state: FinanceState; category: BudgetCategory }
  createGoal(state: FinanceState, input: CreateGoalInput): { state: FinanceState; goal: Goal }
  addGoalFunds(state: FinanceState, goalId: string, amount: number): FinanceState
}
