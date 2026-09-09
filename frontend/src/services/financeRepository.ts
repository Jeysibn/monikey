// The contract the UI depends on for reading and mutating finance data.
// `mockFinanceRepository.ts` is the only implementation today (in-memory,
// synchronous), and `FinanceProvider` takes an implementation of this
// interface as an injectable `repository` prop (see FinanceProvider.tsx),
// which is what lets a test swap in its own deterministic repository.
//
// Every mutation below is expected to enforce the shared finance invariants
// in `domain/financeRules.ts` before returning a new state, and to throw a
// `FinanceValidationError` (leaving the passed-in state untouched) when an
// invariant would be violated — UI validation is an earlier, friendlier
// surface for the same rules, never a substitute for them (TR-002).
//
// Honest scope: this interface is a synchronous state transformer, not an
// HTTP-shaped contract — every method takes a `FinanceState` and returns the
// next one immediately, with no `Promise`, loading state, or error channel.
// A real backend-backed implementation would need this interface widened to
// return `Promise<...>` (or an async-command shape) and `FinanceProvider`
// updated to handle pending/error states — components and
// `state/financeSelectors.ts`, which only read an already-resolved
// `FinanceState`, are the parts of this boundary expected to need no change.

import type {
  Account,
  AddBudgetCategoryInput,
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
  UpdateAccountInput,
  UpdateCreditCardInput,
  UpdateGoalInput,
} from '../domain/finance'

export interface FinanceRepository {
  getInitialState(): FinanceState
  addTransaction(state: FinanceState, input: AddTransactionInput): { state: FinanceState; transaction: Transaction }
  addManualAccount(state: FinanceState, input: AddManualAccountInput): { state: FinanceState; account: Account }
  addManualCreditCard(state: FinanceState, input: AddManualCreditCardInput): { state: FinanceState; creditCard: CreditCard }
  /** @deprecated Category creation and budgeting are now separate actions —
   * use `addCategory` (Settings) then `setCategoryBudget` (Budget). Kept for
   * the existing SR-002 envelope test coverage; no longer called by any page. */
  addBudgetCategory(state: FinanceState, input: AddBudgetCategoryInput): { state: FinanceState; category: BudgetCategory }
  /** Settings: create a category (name/color only), unbudgeted until Budget
   * sets an amount for it via `setCategoryBudget`. */
  addCategory(state: FinanceState, input: AddCategoryInput): { state: FinanceState; category: Category }
  /** Settings: rename a category and/or change its color. Never touches
   * budget allocation — that's `setCategoryBudget`'s job. */
  updateCategory(state: FinanceState, categoryId: string, updates: { name?: string; color?: string }): { state: FinanceState; category: Category }
  /** Budget: set (or change) the monthly budget amount for a category that
   * already exists. Creates the budget-category entry on first use, upserts
   * it thereafter. Setting `allocated` to 0 is how Budget "removes" a
   * category from the active budget without deleting the category itself. */
  setCategoryBudget(state: FinanceState, categoryId: string, allocated: number): { state: FinanceState; category: BudgetCategory }
  /** Settings: delete a category outright — removes it and its budget entry.
   * Transactions still referencing it become uncategorized. */
  deleteCategory(state: FinanceState, categoryId: string): FinanceState
  createGoal(state: FinanceState, input: CreateGoalInput): { state: FinanceState; goal: Goal }
  /**
   * "Funded savings" model (see `Goal` in `domain/finance.ts`): funding a
   * goal always names a source account, whose balance is reduced by the
   * same amount recorded on the goal — never money created from nowhere.
   * Throws a `FinanceValidationError` if the goal doesn't exist, is no
   * longer active, the source account can't be found, `amount` would fund
   * the goal past its `targetAmount` (overfunding is not supported), or
   * `amount` exceeds the source account's balance (asset overdraft is not
   * supported — see `domain/financeRules.ts`). Callers should offer at most
   * `maxFundableAmount(state, goalId, sourceAccountId)`.
   */
  addGoalFunds(state: FinanceState, goalId: string, sourceAccountId: string, amount: number): { state: FinanceState; goal: Goal }
  updateGoal(state: FinanceState, goalId: string, input: UpdateGoalInput): { state: FinanceState; goal: Goal }
  deleteGoal(state: FinanceState, goalId: string): FinanceState
  updateAccount(state: FinanceState, accountId: string, input: UpdateAccountInput): { state: FinanceState; account: Account }
  updateCreditCard(state: FinanceState, cardId: string, input: UpdateCreditCardInput): { state: FinanceState; card: CreditCard }
  archiveAccount(state: FinanceState, accountId: string): FinanceState
  archiveCreditCard(state: FinanceState, cardId: string): FinanceState
  updateTransaction(state: FinanceState, transactionId: string, input: Partial<AddTransactionInput>): { state: FinanceState; transaction: Transaction }
  reverseTransaction(state: FinanceState, transactionId: string): { state: FinanceState; reversedTransaction: Transaction }
}
