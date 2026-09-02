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
  /**
   * Set only on a goal-funding transfer (see `addGoalFunds` in
   * `mockFinanceRepository.ts`): the money left `fromAccountId` and moved
   * into this goal rather than another account. Goal-funding transfers are
   * real transfers on the ledger, but are excluded from `transferCount`
   * (the "N transfers excluded from cash flow" figure), which counts only
   * account-to-account movement.
   */
  goalId?: string
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
  /**
   * Which transaction type(s) this category may be attached to (SR-006).
   * Kept separate from `budgetable` — a category can be expense-only but
   * excluded from budgeting (e.g. Subscriptions), or income-only (e.g.
   * Salary). Transfers never carry a category, so this only ever lists
   * `'income'` and/or `'expense'`.
   */
  transactionKinds: ('income' | 'expense')[]
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

/**
 * Goal-funding model (SR-003): "funded savings". Adding funds to a goal
 * always names a source account and moves real money out of it —
 * `currentAmount` is never inflated for free. That means goal money is
 * already excluded from `totalAvailableCash` (it only ever sums account
 * balances, and a funded goal's source account balance was reduced by the
 * same amount), so `totalGoalSavings` and `totalAvailableCash` never
 * double-count the same peso. `currentAmount` can never exceed
 * `targetAmount` — funding beyond the remaining target is rejected outright
 * (see `addGoalFunds`), overfunding is not a supported rule.
 *
 * Reaching the target flips `status` to `'goal_reached'` and `active` to
 * `false` in the same update, with `completedDate` set to that day's date
 * (`YYYY-MM-DD`, from the reporting `today()`). An inactive goal is excluded
 * from every active-goal calculation (`activeGoals`, `monthlyContributionTotal`,
 * `avgGoalProgressPct`) and can no longer receive funds — its money stays
 * reserved in `currentAmount`, permanently out of `totalAvailableCash`.
 */
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

/**
 * One bucket of the expense trend chart (a day, week, or month depending on
 * the selected view). `day` is a short display label, not a parseable date —
 * see `expensesTrend` in `financeSelectors.ts` for how buckets are built.
 */
export interface ExpenseDayPoint {
  day: string
  amount: number
}

export interface BudgetVsActualPoint {
  month: string
  budget: number
  actual: number
}

/**
 * An explicit, first-class reporting window — every "this month" figure in
 * the UI (income, expenses, net cash flow, budget spend, transfer counts)
 * is computed against one of these rather than every transaction ever
 * recorded. Dates are local (`YYYY-MM-DD`) — `start` is inclusive, `end` is
 * exclusive, so boundary dates never depend on string comparison rules.
 */
export interface ReportingPeriod {
  start: string
  end: string
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
  budgetVsActual: BudgetVsActualPoint[]
  investmentActivity?: {
    trades: Array<{ id: string; ticker: string; type: 'buy' | 'sell'; units: number; price: number; amount: number; date: string; note?: string }>
    dividends: Array<{ id: string; ticker: string; amount: number; date: string }>
  }
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
  /** Stable per-submit key used by the backend to make retries safe. */
  idempotencyKey?: string
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

export interface UpdateGoalInput {
  name?: string
  targetAmount?: number
  targetDate?: string
  monthlyContribution?: number | null
}

export interface UpdateAccountInput {
  name?: string
  institution?: string | null
  lastFour?: string | null
}

export interface UpdateCreditCardInput {
  name?: string
  lastFour?: string
}
