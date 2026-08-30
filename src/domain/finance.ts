// Domain types for the Monikey frontend finance model.
// These types describe the shape of the data the UI needs — they carry no
// mock values and no calculation logic. Mock values live in
// `services/mockFinanceRepository.ts`; derived calculations live in
// `state/financeSelectors.ts`. Swapping the mock repository for a real API
// client later should not require changing these types.

export type AccountType = 'checking' | 'savings' | 'ewallet' | 'cash' | 'credit_card'
export type AccountClassification = 'asset' | 'liability'

export interface Account {
  id: string
  name: string
  institution?: string
  type: AccountType
  classification: AccountClassification
  balance: number
  lastFour?: string
  syncStatus: string
  monthlyChangePct?: number
  manual?: boolean
}

export interface CreditCard {
  id: string
  name: string
  lastFour: string
  network: 'visa' | 'mastercard'
  balance: number
  limit: number
  dueDate: string
  minPayment: number
  manual?: boolean
}

export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionSource = 'manual' | 'ocr' | 'recurring'
export type TransactionStatus = 'cleared' | 'pending'

export interface Transaction {
  id: string
  type: TransactionType
  title: string
  /** References a Category from the shared category directory — never a free-text label. */
  categoryId?: string
  /** References an Account or CreditCard id — resolved to a display label by selectors, never duplicated as text. */
  accountId?: string
  fromAccountId?: string
  toAccountId?: string
  date: string
  time?: string
  amount: number
  fee?: number
  source: TransactionSource
  status: TransactionStatus
  note?: string
}

export interface Category {
  id: string
  name: string
  color: string
  /** Whether this category can be picked as a Budget category (income-only categories like Salary can't). */
  budgetable: boolean
}

export type BudgetStatus = 'safe' | 'on_track' | 'near_limit' | 'over_budget'

/** A category's budget allocation for the period. `id` references a `Category` — name/color are never duplicated here. */
export interface BudgetCategory {
  id: string
  allocated: number
  spent: number
  forecast?: number
}

export type GoalStatus = 'just_started' | 'on_track' | 'behind_pace' | 'goal_reached' | 'completed'

export interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  completedDate?: string
  monthlyContribution?: number
  requiredContribution?: number
  status: GoalStatus
  active: boolean
}

export interface AttentionItem {
  id: string
  type: 'payment_due' | 'budget_warning' | 'uncategorized_transaction'
  title: string
  severity: 'info' | 'warning'
}

export interface Holding {
  ticker: string
  name: string
  price: number
  changePct: number
  units: number
  history: number[]
}

export interface ExpenseDayPoint {
  day: string
  amount: number
}

export interface BudgetVsActualPoint {
  month: string
  budget: number
  actual: number
}

/** The complete, in-memory finance state the UI reads from. */
export interface FinanceState {
  accounts: Account[]
  creditCards: CreditCard[]
  categories: Category[]
  transactions: Transaction[]
  budgetCategories: BudgetCategory[]
  totalBudgetAllocated: number
  goals: Goal[]
  attentionItems: AttentionItem[]
  portfolio: Holding[]
  expensesByDay: ExpenseDayPoint[]
  budgetVsActual: BudgetVsActualPoint[]
}

// ---- Mutation inputs -------------------------------------------------

export interface AddTransactionInput {
  type: TransactionType
  title: string
  categoryId?: string
  accountId?: string
  fromAccountId?: string
  toAccountId?: string
  date: string
  time?: string
  /** Always a positive amount; sign is derived from `type`. */
  amount: number
  fee?: number
  note?: string
}

export interface AddManualAccountInput {
  name: string
  type: Exclude<AccountType, 'credit_card'>
  institution?: string
  balance: number
  lastFour?: string
}

export interface AddManualCreditCardInput {
  name: string
  lastFour: string
  network: 'visa' | 'mastercard'
  balance: number
  limit: number
  dueDate: string
  minPayment: number
}

export interface AddBudgetCategoryInput {
  name: string
  allocated: number
  color?: string
}

export interface CreateGoalInput {
  name: string
  targetAmount: number
  targetDate: string
  monthlyContribution?: number
}
