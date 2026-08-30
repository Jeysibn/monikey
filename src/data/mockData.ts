// Single source of mock/sample data for the whole app.
// Every page derives shared numbers (income, expenses, budget, goals) from here
// instead of hardcoding a second copy — this is what keeps the Dashboard,
// Transactions, Budget, and Goals pages consistent with each other.
// Replace this module with real API calls when the backend exists.

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
}

export const accounts: Account[] = [
  { id: 'checking', name: 'Checking', institution: 'BPI', type: 'checking', classification: 'asset', balance: 4120, lastFour: '4471', syncStatus: 'Synced today', monthlyChangePct: 1.8 },
  { id: 'savings', name: 'Savings', institution: 'BDO', type: 'savings', classification: 'asset', balance: 2860, lastFour: '8830', syncStatus: 'Synced today', monthlyChangePct: 0.6 },
  { id: 'gcash', name: 'GCash', type: 'ewallet', classification: 'asset', balance: 640, syncStatus: 'Linked · synced today', monthlyChangePct: 4.2 },
  { id: 'maya', name: 'Maya', type: 'ewallet', classification: 'asset', balance: 300, syncStatus: 'Linked · synced yesterday', monthlyChangePct: -1.1 },
  { id: 'cash', name: 'Cash Wallet', type: 'cash', classification: 'asset', balance: 120, syncStatus: 'Manual · updated by you' },
]

export interface CreditCard {
  id: string
  name: string
  lastFour: string
  network: 'visa' | 'mastercard'
  balance: number
  limit: number
  dueDate: string
  minPayment: number
}

export const creditCards: CreditCard[] = [
  { id: 'visa', name: 'Visa Platinum', lastFour: '2290', network: 'visa', balance: 1460, limit: 5000, dueDate: 'Sep 15', minPayment: 75 },
  { id: 'mastercard', name: 'Mastercard', lastFour: '7734', network: 'mastercard', balance: 610, limit: 2000, dueDate: 'Sep 22', minPayment: 30 },
]

export const totalAvailableCash = accounts
  .filter((a) => a.classification === 'asset')
  .reduce((sum, a) => sum + a.balance, 0)

export const totalCreditOwed = creditCards.reduce((sum, c) => sum + c.balance, 0)
export const totalCreditLimit = creditCards.reduce((sum, c) => sum + c.limit, 0)

export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionSource = 'manual' | 'ocr' | 'recurring'
export type TransactionStatus = 'cleared' | 'pending'

export interface Transaction {
  id: string
  type: TransactionType
  title: string
  category?: string
  accountId?: string
  accountLabel: string
  date: string
  time?: string
  amount: number
  source: TransactionSource
  status: TransactionStatus
  fromAccountLabel?: string
  toAccountLabel?: string
  note?: string
}

export const transactions: Transaction[] = [
  { id: 'tx1', type: 'expense', title: 'Cafe Amoreza', category: 'Food', accountId: 'checking', accountLabel: 'Checking ••4471', date: 'Aug 29', time: '9:14 AM', amount: -6.4, source: 'manual', status: 'cleared' },
  { id: 'tx2', type: 'expense', title: 'Grab Grocery', category: 'Shopping', accountId: 'gcash', accountLabel: 'GCash', date: 'Aug 29', time: '8:02 AM', amount: -41.85, source: 'ocr', status: 'cleared' },
  { id: 'tx3', type: 'expense', title: 'Grab Ride', category: 'Transport', accountId: 'visa', accountLabel: 'Visa ••2290', date: 'Aug 29', time: '7:48 PM', amount: -8.2, source: 'manual', status: 'cleared' },
  { id: 'tx4', type: 'income', title: 'Payroll Deposit', category: 'Salary', accountId: 'checking', accountLabel: 'Checking ••4471', date: 'Aug 28', time: '9:00 AM', amount: 2150, source: 'manual', status: 'cleared' },
  { id: 'tx5', type: 'expense', title: 'Meralco Bill', category: 'Utilities', accountId: 'savings', accountLabel: 'Savings', date: 'Aug 27', time: '6:30 PM', amount: -64.1, source: 'ocr', status: 'cleared' },
  { id: 'tx6', type: 'transfer', title: 'Checking → GCash', accountLabel: 'Checking → GCash', fromAccountLabel: 'Checking ••4471', toAccountLabel: 'GCash', date: 'Aug 26', amount: 500, source: 'manual', status: 'cleared', note: 'No budget impact' },
  { id: 'tx7', type: 'expense', title: 'Netflix', category: 'Subscriptions', accountId: 'visa', accountLabel: 'Visa ••2290', date: 'Aug 25', source: 'recurring', status: 'pending', amount: -15 },
  { id: 'tx8', type: 'income', title: 'Freelance Payment', category: 'Salary', accountId: 'checking', accountLabel: 'Checking ••4471', date: 'Aug 24', time: '4:20 PM', amount: 350, source: 'manual', status: 'cleared' },
  { id: 'tx9', type: 'expense', title: 'Grab Ride', category: 'Transport', accountId: 'mastercard', accountLabel: 'Mastercard ••7734', date: 'Aug 23', time: '8:05 AM', amount: -9.1, source: 'manual', status: 'cleared' },
]

// Rule: transfers never count toward income/expenses/net cash flow.
export const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
export const totalExpenses = Math.abs(
  transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
)
export const netCashFlow = totalIncome - totalExpenses
export const transferCount = transactions.filter((t) => t.type === 'transfer').length

export type BudgetStatus = 'safe' | 'on_track' | 'near_limit' | 'over_budget'

export interface BudgetCategory {
  id: string
  name: string
  allocated: number
  spent: number
  forecast?: number
}

export const budgetCategories: BudgetCategory[] = [
  { id: 'housing', name: 'Housing', allocated: 3000, spent: 2729 },
  { id: 'food', name: 'Food & Groceries', allocated: 1600, spent: 1476, forecast: 1680 },
  { id: 'transport', name: 'Transport', allocated: 1300, spent: 1220 },
  { id: 'shopping', name: 'Shopping', allocated: 1200, spent: 1460 },
  { id: 'utilities', name: 'Utilities', allocated: 700, spent: 640 },
  { id: 'debt', name: 'Debt Payments', allocated: 1800, spent: 1973 },
]

export function budgetStatus(allocated: number, spent: number): BudgetStatus {
  const pct = (spent / allocated) * 100
  if (pct >= 100) return 'over_budget'
  if (pct >= 90) return 'near_limit'
  if (pct >= 75) return 'on_track'
  return 'safe'
}

export const totalBudgetAllocated = 11600
export const totalBudgetSpent = budgetCategories.reduce((s, c) => s + c.spent, 0)
export const totalBudgetRemaining = totalBudgetAllocated - totalBudgetSpent
export const budgetUsedPct = Math.round((totalBudgetSpent / totalBudgetAllocated) * 100)
export const budgetDaysRemaining = 3
export const budgetUnallocated = totalBudgetAllocated - budgetCategories.reduce((s, c) => s + c.allocated, 0)
export const budgetNearLimitCount = budgetCategories.filter(
  (c) => budgetStatus(c.allocated, c.spent) === 'near_limit',
).length
export const budgetOverCount = budgetCategories.filter(
  (c) => budgetStatus(c.allocated, c.spent) === 'over_budget',
).length

export const budgetVsActual = [
  { month: 'MAR', budget: 70, actual: 62 },
  { month: 'APR', budget: 70, actual: 75 },
  { month: 'MAY', budget: 70, actual: 58 },
  { month: 'JUN', budget: 70, actual: 80 },
  { month: 'JUL', budget: 70, actual: 66 },
  { month: 'AUG', budget: 70, actual: 82 },
]

export const spendMix = [
  { category: 'Housing', pct: 29, amount: 2729, color: 'var(--cyan)' },
  { category: 'Food & Groceries', pct: 16, amount: 1476, color: 'var(--teal)' },
  { category: 'Transport', pct: 13, amount: 1220, color: 'var(--purple)' },
  { category: 'Shopping', pct: 10, amount: 944, color: 'var(--amber)' },
  { category: 'Utilities', pct: 10, amount: 944, color: 'var(--slate-lt)' },
  { category: 'Other', pct: 22, amount: 2129, color: 'var(--slate)' },
]
export const spendMixTotal = spendMix.reduce((s, c) => s + c.amount, 0)

export type GoalStatus = 'just_started' | 'on_track' | 'behind_pace' | 'goal_reached' | 'completed'

export interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  monthlyContribution?: number
  requiredContribution?: number
  status: GoalStatus
  active: boolean
}

export const goals: Goal[] = [
  { id: 'travel', name: 'Travel', targetAmount: 4000, currentAmount: 2125, targetDate: 'Mar 2027', monthlyContribution: 100, requiredContribution: 184, status: 'behind_pace', active: true },
  { id: 'laptop', name: 'New Laptop', targetAmount: 1300, currentAmount: 1179, targetDate: 'Oct 2026', monthlyContribution: 60, status: 'on_track', active: true },
  { id: 'car', name: 'Car Down Payment', targetAmount: 5000, currentAmount: 13, targetDate: 'Jun 2027', monthlyContribution: 200, status: 'just_started', active: true },
  { id: 'home', name: 'Home Fund', targetAmount: 3500, currentAmount: 3743, targetDate: 'Nov 2026', status: 'goal_reached', active: false },
  { id: 'emergency', name: 'Emergency Fund', targetAmount: 3700, currentAmount: 3700, targetDate: 'Jan 2026', status: 'completed', active: false },
]

export const activeGoals = goals.filter((g) => g.active)
export const completedGoals = goals.filter((g) => !g.active)
export const totalGoalSavings = goals.reduce((s, g) => s + g.currentAmount, 0)
export const monthlyContributionTotal = activeGoals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
export const avgGoalProgressPct = Math.round(
  (goals.reduce((s, g) => s + g.currentAmount / g.targetAmount, 0) / goals.length) * 100,
)

export interface AttentionItem {
  id: string
  type: 'payment_due' | 'budget_warning' | 'uncategorized_transaction'
  title: string
  severity: 'info' | 'warning'
}

export const attentionItems: AttentionItem[] = [
  { id: 'a1', type: 'payment_due', title: 'Visa payment due in 3 days', severity: 'warning' },
  { id: 'a2', type: 'budget_warning', title: 'Food & Groceries budget is near its limit', severity: 'warning' },
  { id: 'a3', type: 'uncategorized_transaction', title: '3 transactions need categorization', severity: 'info' },
]

export interface Holding {
  ticker: string
  price: number
  changePct: number
  units: number
  history: number[]
}

export const portfolio: Holding[] = [
  { ticker: 'AAPL', price: 1721.3, changePct: 0.7, units: 104, history: [1602, 1618, 1596, 1640, 1671, 1655, 1698, 1721.3] },
  { ticker: 'AMZN', price: 1721.3, changePct: 0.7, units: 12, history: [1580, 1611, 1634, 1622, 1660, 1648, 1690, 1721.3] },
  { ticker: 'MSFT', price: 1721.3, changePct: 0.7, units: 41, history: [1560, 1572, 1601, 1589, 1620, 1652, 1670, 1721.3] },
  { ticker: 'NVDA', price: 1721.3, changePct: 0.7, units: 16, history: [1540, 1585, 1573, 1618, 1602, 1655, 1680, 1721.3] },
]

export const expensesByDay = [
  { day: 'MON', amount: 180 },
  { day: 'TUE', amount: 240 },
  { day: 'WED', amount: 95 },
  { day: 'THU', amount: 410 },
  { day: 'FRI', amount: 150 },
  { day: 'SAT', amount: 205 },
  { day: 'SUN', amount: 312 },
]
export const expensesToday = expensesByDay[expensesByDay.length - 1].amount

// Color coding for transaction categories and accounts, shown as tags/dots in transaction lists.
export const CATEGORY_COLORS: Record<string, string> = {
  Food: 'var(--teal)',
  'Food & Groceries': 'var(--teal)',
  Shopping: 'var(--amber)',
  Transport: 'var(--purple)',
  Salary: 'var(--cyan)',
  Utilities: 'var(--slate-lt)',
  Subscriptions: 'var(--purple)',
  Housing: 'var(--cyan)',
}

export function categoryColor(category?: string): string {
  return (category && CATEGORY_COLORS[category]) || 'var(--text-dim)'
}

export const ACCOUNT_COLORS: Record<string, string> = {
  checking: 'var(--cyan)',
  savings: 'var(--teal)',
  gcash: 'var(--purple)',
  maya: 'var(--purple)',
  cash: 'var(--slate-lt)',
  visa: 'var(--amber)',
  mastercard: 'var(--amber)',
}

export function accountColor(accountId?: string): string {
  return (accountId && ACCOUNT_COLORS[accountId]) || 'var(--text-faint)'
}

export function formatMoney(value: number, opts: { withCents?: boolean } = {}): string {
  const withCents = opts.withCents ?? true
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  })}`
}
