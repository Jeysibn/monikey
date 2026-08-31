import type {
  Account,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  CreateGoalInput,
  Goal,
  BudgetCategory,
  CreditCard,
  FinanceState,
  Transaction,
} from '../domain/finance'

type ApiAccount = {
  id: string; name: string; institution: string | null; accountType: Account['type'];
  classification: Account['classification']; currentBalanceMinor: number; lastFour: string | null;
  syncStatus: string; manual: boolean; creditCardDetail?: { network: CreditCard['network']; creditLimitMinor: number; dueDay: number; minimumPaymentMinor: number } | null;
}
type ApiTransaction = { id: string; type: Transaction['type']; title: string; categoryId: string | null; goalId: string | null; fromAccountId: string | null; toAccountId: string | null; occurredOn: string; occurredTime: string | null; amountMinor: number; feeMinor: number; source: Transaction['source']; status: Transaction['status']; note: string | null }
type ApiGoal = { id: string; name: string; targetMinor: number; currentMinor: number; targetDate: string; completedDate: string | null; monthlyContributionMinor: number | null; status: string; active: boolean }
type ApiBudgetPeriod = { id: string; periodStart: string; periodEnd: string; incomePoolMinor: number; allocations: Array<{ id: string; categoryId: string; allocatedMinor: number }> }
type Bootstrap = { financeState: { accounts: ApiAccount[]; transactions: ApiTransaction[]; categories: Array<{ id: string; name: string; color: string; budgetable: boolean; allowsIncome: boolean; allowsExpense: boolean }>; budgets: unknown[]; goals: ApiGoal[] }; }

export interface FinanceGateway {
  load(signal?: AbortSignal): Promise<FinanceState>
  addTransaction(input: AddTransactionInput, signal?: AbortSignal): Promise<Transaction>
  addManualAccount(input: AddManualAccountInput, signal?: AbortSignal): Promise<Account>
  addManualCreditCard(input: AddManualCreditCardInput, signal?: AbortSignal): Promise<CreditCard>
  createGoal(input: CreateGoalInput, signal?: AbortSignal): Promise<Goal>
  addGoalFunds(goalId: string, sourceAccountId: string, amount: number, date: string, signal?: AbortSignal): Promise<Goal>
  createBudgetPeriod(periodStart: string, periodEnd: string, incomePool: number, signal?: AbortSignal): Promise<ApiBudgetPeriod>
  setBudgetAllocation(periodId: string, categoryId: string, allocated: number, signal?: AbortSignal): Promise<BudgetCategory>
  addBudgetCategory(input: { name: string; allocated: number; color?: string }, signal?: AbortSignal): Promise<{ id: string; name: string; color: string; allocated: number }>
}

export class FinanceApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string
  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.name = 'FinanceApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

const minor = (value: number) => value / 100

export class ApiFinanceGateway implements FinanceGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = fetch) { this.baseUrl = baseUrl; this.fetcher = fetcher }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
      throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Monikey API request failed: ${response.status}`, payload?.error?.field)
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
  }

  async load(signal?: AbortSignal): Promise<FinanceState> {
    const { financeState } = await this.request<Bootstrap>('/bootstrap', { signal })
    const accounts: Account[] = financeState.accounts.filter((a) => a.classification === 'asset').map((a) => ({ id: a.id, name: a.name, institution: a.institution ?? undefined, type: a.accountType, classification: a.classification, balance: minor(a.currentBalanceMinor), lastFour: a.lastFour ?? undefined, syncStatus: a.syncStatus, manual: a.manual }))
    const creditCards: CreditCard[] = financeState.accounts.filter((a) => a.classification === 'liability' && a.creditCardDetail).map((a) => ({ id: a.id, name: a.name, lastFour: a.lastFour ?? '', network: a.creditCardDetail!.network, balance: minor(a.currentBalanceMinor), limit: minor(a.creditCardDetail!.creditLimitMinor), dueDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(a.creditCardDetail!.dueDay).padStart(2, '0')}`, minPayment: minor(a.creditCardDetail!.minimumPaymentMinor), manual: a.manual }))
    return { accounts, creditCards, categories: financeState.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, budgetable: c.budgetable, transactionKinds: [ ...(c.allowsIncome ? ['income' as const] : []), ...(c.allowsExpense ? ['expense' as const] : []) ] })), transactions: financeState.transactions.map(this.mapTransaction), budgetCategories: [], totalBudgetAllocated: 0, goals: financeState.goals.map((g) => ({ id: g.id, name: g.name, targetAmount: minor(g.targetMinor), currentAmount: minor(g.currentMinor), targetDate: g.targetDate, completedDate: g.completedDate ?? undefined, monthlyContribution: g.monthlyContributionMinor == null ? undefined : minor(g.monthlyContributionMinor), status: g.status as FinanceState['goals'][number]['status'], active: g.active })), attentionItems: [], portfolio: [], budgetVsActual: [] }
  }

  async addTransaction(input: AddTransactionInput, signal?: AbortSignal): Promise<Transaction> {
    const result = await this.request<{ transaction: ApiTransaction }>('/transactions', { method: 'POST', signal, body: JSON.stringify({ type: input.type, title: input.title, categoryId: input.categoryId ?? null, fromAccountId: input.type === 'expense' ? input.accountId : input.fromAccountId ?? null, toAccountId: input.type === 'income' ? input.accountId : input.toAccountId ?? null, occurredOn: input.date, occurredTime: input.time ?? null, amountMinor: Math.round(input.amount * 100), feeMinor: Math.round((input.fee ?? 0) * 100), note: input.note ?? null, source: 'manual', status: 'cleared' }) })
    return this.mapTransaction(result.transaction)
  }

  async addManualAccount(input: AddManualAccountInput, signal?: AbortSignal): Promise<Account> {
    const account = await this.request<ApiAccount>('/accounts', { method: 'POST', signal, body: JSON.stringify({ name: input.name, institution: input.institution ?? null, accountType: input.type, openingBalanceMinor: Math.round(input.balance * 100), lastFour: input.lastFour ?? null }) })
    return { id: account.id, name: account.name, institution: account.institution ?? undefined, type: account.accountType, classification: account.classification, balance: minor(account.currentBalanceMinor), lastFour: account.lastFour ?? undefined, syncStatus: account.syncStatus, manual: account.manual }
  }

  async addManualCreditCard(input: AddManualCreditCardInput, signal?: AbortSignal): Promise<CreditCard> {
    const account = await this.request<ApiAccount>('/credit-cards', { method: 'POST', signal, body: JSON.stringify({ name: input.name, lastFour: input.lastFour, network: input.network, openingBalanceMinor: Math.round(input.balance * 100), creditLimitMinor: Math.round(input.limit * 100), dueDay: Number(input.dueDate.slice(-2)), minimumPaymentMinor: Math.round(input.minPayment * 100) }) })
    const detail = account.creditCardDetail!
    return { id: account.id, name: account.name, lastFour: account.lastFour ?? '', network: detail.network, balance: minor(account.currentBalanceMinor), limit: minor(detail.creditLimitMinor), dueDate: input.dueDate, minPayment: minor(detail.minimumPaymentMinor), manual: account.manual }
  }

  async createGoal(input: CreateGoalInput, signal?: AbortSignal): Promise<Goal> {
    const goal = await this.request<ApiGoal>('/goals', { method: 'POST', signal, body: JSON.stringify({ name: input.name, targetMinor: Math.round(input.targetAmount * 100), targetDate: input.targetDate, monthlyContributionMinor: input.monthlyContribution == null ? null : Math.round(input.monthlyContribution * 100) }) })
    return this.mapGoal(goal)
  }

  async addGoalFunds(goalId: string, sourceAccountId: string, amount: number, date: string, signal?: AbortSignal): Promise<Goal> {
    await this.request(`/goals/${goalId}/fund`, { method: 'POST', signal, body: JSON.stringify({ sourceAccountId, amountMinor: Math.round(amount * 100), occurredOn: date }) })
    const state = await this.load(signal)
    const goal = state.goals.find((candidate) => candidate.id === goalId)
    if (!goal) throw new Error('Goal was not returned after funding')
    return goal
  }

  async createBudgetPeriod(periodStart: string, periodEnd: string, incomePool: number, signal?: AbortSignal): Promise<ApiBudgetPeriod> {
    return this.request<ApiBudgetPeriod>('/budgets', { method: 'POST', signal, body: JSON.stringify({ periodStart, periodEnd, incomePoolMinor: Math.round(incomePool * 100) }) })
  }

  async setBudgetAllocation(periodId: string, categoryId: string, allocated: number, signal?: AbortSignal): Promise<BudgetCategory> {
    const result = await this.request<{ allocatedMinor: number }>(`/budgets/${periodId}/allocations`, { method: 'POST', signal, body: JSON.stringify({ categoryId, allocatedMinor: Math.round(allocated * 100) }) })
    return { id: categoryId, allocated: minor(result.allocatedMinor), spent: 0 }
  }

  async addBudgetCategory(input: { name: string; allocated: number; color?: string }, signal?: AbortSignal): Promise<{ id: string; name: string; color: string; allocated: number }> {
    const category = await this.request<{ id: string; name: string; color: string }>('/categories', { method: 'POST', signal, body: JSON.stringify({ name: input.name, color: input.color ?? 'var(--cyan)', budgetable: true, allowsIncome: false, allowsExpense: true }) })
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
    const period = await this.createBudgetPeriod(start, end, 0, signal)
    await this.setBudgetAllocation(period.id, category.id, input.allocated, signal)
    return { ...category, allocated: input.allocated }
  }

  private mapTransaction = (t: ApiTransaction): Transaction => ({ id: t.id, type: t.type, title: t.title, categoryId: t.categoryId ?? undefined, goalId: t.goalId ?? undefined, accountId: t.type === 'expense' || t.type === 'income' ? (t.fromAccountId ?? t.toAccountId ?? undefined) : undefined, fromAccountId: t.fromAccountId ?? undefined, toAccountId: t.toAccountId ?? undefined, date: t.occurredOn, time: t.occurredTime ? t.occurredTime.slice(0, 5) : undefined, amount: t.type === 'expense' ? -minor(t.amountMinor) : minor(t.amountMinor), fee: t.feeMinor ? minor(t.feeMinor) : undefined, source: t.source, status: t.status, note: t.note ?? undefined })
  private mapGoal = (g: ApiGoal): Goal => ({ id: g.id, name: g.name, targetAmount: minor(g.targetMinor), currentAmount: minor(g.currentMinor), targetDate: g.targetDate, completedDate: g.completedDate ?? undefined, monthlyContribution: g.monthlyContributionMinor == null ? undefined : minor(g.monthlyContributionMinor), status: g.status as Goal['status'], active: g.active })
}
