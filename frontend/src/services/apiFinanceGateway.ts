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
  UpdateAccountInput,
  UpdateCreditCardInput,
  UpdateGoalInput,
} from '../domain/finance'
import type { paths } from '../api.generated'
import { majorNumberToMinorUnits, minorUnitsToMajorDisplayNumber } from '../utils/money'

type ApiAccount = paths['/accounts']['post']['responses'][201]['content']['application/json']
type CreateAccountRequest = paths['/accounts']['post']['requestBody']['content']['application/json']
type CreateCreditCardRequest = paths['/credit-cards']['post']['requestBody']['content']['application/json']
type UpdateAccountRequest = paths['/accounts/{id}']['patch']['requestBody']['content']['application/json']
type ApiTransaction = paths['/transactions']['post']['responses'][201]['content']['application/json']['transaction']
type TransactionMutationResponse = paths['/transactions']['post']['responses'][201]['content']['application/json']
type ReverseTransactionResponse = paths['/transactions/{id}/reverse']['post']['responses'][201]['content']['application/json']
type ApiGoal = paths['/goals']['post']['responses'][201]['content']['application/json']
type CreateGoalRequest = paths['/goals']['post']['requestBody']['content']['application/json']
type UpdateGoalRequest = paths['/goals/{id}']['patch']['requestBody']['content']['application/json']
type ApiCategory = paths['/categories']['post']['responses'][201]['content']['application/json']
type ApiBudgetPeriod = paths['/budgets']['get']['responses'][200]['content']['application/json'][number]
type ApiBudgetAllocation = ApiBudgetPeriod['allocations'][number]
type ApiInvestmentTrade = { id: string; ticker: string; type: 'buy' | 'sell'; units: number; priceMinor: string; amountMinor?: string; occurredOn: string; note: string | null }
type ApiDividend = { id: string; ticker: string; amountMinor: string; occurredOn: string }
type Bootstrap = { financeState: { accounts: ApiAccount[]; transactions: ApiTransaction[]; categories: Array<{ id: string; name: string; color: string; budgetable: boolean; allowsIncome: boolean; allowsExpense: boolean }>; budgets: unknown[]; goals: ApiGoal[] }; investmentActivity?: { trades: ApiInvestmentTrade[]; dividends: ApiDividend[] }; serverDate?: string }

export interface FinanceGateway {
  readonly todayIso?: string
  load(signal?: AbortSignal): Promise<FinanceState>
  addTransaction(input: AddTransactionInput, signal?: AbortSignal): Promise<Transaction>
  updateTransaction(transactionId: string, input: Partial<AddTransactionInput>, signal?: AbortSignal): Promise<Transaction>
  reverseTransaction(transactionId: string, signal?: AbortSignal): Promise<Transaction>
  addManualAccount(input: AddManualAccountInput, signal?: AbortSignal): Promise<Account>
  addManualCreditCard(input: AddManualCreditCardInput, signal?: AbortSignal): Promise<CreditCard>
  updateAccount(accountId: string, input: UpdateAccountInput, signal?: AbortSignal): Promise<Account>
  updateCreditCard(cardId: string, input: UpdateCreditCardInput, signal?: AbortSignal): Promise<CreditCard>
  archiveAccount(accountId: string, signal?: AbortSignal): Promise<void>
  archiveCreditCard(cardId: string, signal?: AbortSignal): Promise<void>
  createGoal(input: CreateGoalInput, signal?: AbortSignal): Promise<Goal>
  addGoalFunds(goalId: string, sourceAccountId: string, amount: number, date: string, signal?: AbortSignal): Promise<Goal>
  updateGoal(goalId: string, input: UpdateGoalInput, signal?: AbortSignal): Promise<Goal>
  deleteGoal(goalId: string, signal?: AbortSignal): Promise<void>
  createBudgetPeriod(periodStart: string, periodEnd: string, incomePool: number, signal?: AbortSignal): Promise<ApiBudgetPeriod>
  setBudgetAllocation(periodId: string, categoryId: string, allocated: number, signal?: AbortSignal): Promise<BudgetCategory>
  /** Settings: create a category (name/color only), unbudgeted until Budget calls `setCategoryBudget`. */
  addCategory(input: { name: string; color?: string; transactionKinds?: ('income' | 'expense')[] }, signal?: AbortSignal): Promise<{ id: string; name: string; color: string; budgetable: boolean; allowsIncome: boolean; allowsExpense: boolean }>
  /** Settings: rename/recolor a category. Never touches budget allocation. */
  updateCategory(categoryId: string, input: { name?: string; color?: string }, signal?: AbortSignal): Promise<{ id: string; name: string; color: string }>
  /** Budget: set (or change) the budget amount for a category that already exists. */
  setCategoryBudget(categoryId: string, allocated: number, signal?: AbortSignal): Promise<BudgetCategory>
  deleteCategory(categoryId: string, signal?: AbortSignal): Promise<void>
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

const minor = minorUnitsToMajorDisplayNumber

export class ApiFinanceGateway implements FinanceGateway {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private _todayIso: string | undefined
  get todayIso(): string | undefined { return this._todayIso }
  constructor(baseUrl = '/api/v1', fetcher: typeof fetch = (...args) => fetch(...args)) { this.baseUrl = baseUrl; this.fetcher = fetcher }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { credentials: 'include', ...init, headers: { ...(init.body !== undefined && { 'Content-Type': 'application/json' }), ...init.headers } })
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string; field?: string } } | undefined
      throw new FinanceApiError(response.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.message ?? `Monikey API request failed: ${response.status}`, payload?.error?.field)
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
  }

  async load(signal?: AbortSignal): Promise<FinanceState> {
    const bootstrap = await this.request<Bootstrap>('/bootstrap', { signal })
    const { financeState } = bootstrap
    const accounts: Account[] = financeState.accounts.filter((a) => a.classification === 'asset').map((a) => ({ id: a.id, name: a.name, institution: a.institution ?? undefined, type: a.accountType, classification: a.classification, balanceMinor: a.currentBalanceMinor, balance: minor(a.currentBalanceMinor), lastFour: a.lastFour ?? undefined, syncStatus: a.syncStatus, manual: a.manual }))
    const serverDate = bootstrap.serverDate && /^\d{4}-\d{2}-\d{2}$/.test(bootstrap.serverDate) ? bootstrap.serverDate : new Date().toISOString().slice(0, 10)
    this._todayIso = serverDate
    const dueDatePrefix = serverDate.slice(0, 7)
    const creditCards: CreditCard[] = financeState.accounts.filter((a) => a.classification === 'liability' && a.creditCardDetail).map((a) => ({ id: a.id, name: a.name, lastFour: a.lastFour ?? '', network: a.creditCardDetail!.network, balanceMinor: a.currentBalanceMinor, balance: minor(a.currentBalanceMinor), limitMinor: a.creditCardDetail!.creditLimitMinor, limit: minor(a.creditCardDetail!.creditLimitMinor), dueDate: `${dueDatePrefix}-${String(a.creditCardDetail!.dueDay).padStart(2, '0')}`, minPaymentMinor: a.creditCardDetail!.minimumPaymentMinor, minPayment: minor(a.creditCardDetail!.minimumPaymentMinor), manual: a.manual }))
    const trades = bootstrap.investmentActivity?.trades ?? []
    const dividends = bootstrap.investmentActivity?.dividends ?? []
    // Budgets are not part of `/bootstrap` yet, so fetch the period list
    // separately and use the most recent period (periods are returned newest
    // first) as the "current" budget. `spentMinor` is computed server-side
    // from qualifying cleared transactions (see budget.routes.ts) — the
    // frontend never recomputes it locally.
    const budgetPeriods = await this.request<ApiBudgetPeriod[]>('/budgets', { signal }).catch(() => [] as ApiBudgetPeriod[])
    const currentPeriod = budgetPeriods[0]
    const budgetCategories: BudgetCategory[] = currentPeriod ? currentPeriod.allocations.map((a) => ({ id: a.categoryId, allocatedMinor: a.allocatedMinor, allocated: minor(a.allocatedMinor), spentMinor: a.spentMinor, spent: minor(a.spentMinor) })) : []
    const totalBudgetAllocatedMinor = budgetCategories.reduce((sum, c) => sum + BigInt(c.allocatedMinor!), 0n).toString()
    const totalBudgetAllocated = minor(totalBudgetAllocatedMinor)
    return { accounts, creditCards, categories: financeState.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, budgetable: c.budgetable, transactionKinds: [ ...(c.allowsIncome ? ['income' as const] : []), ...(c.allowsExpense ? ['expense' as const] : []) ] })), transactions: financeState.transactions.map(this.mapTransaction), budgetCategories, totalBudgetAllocatedMinor, totalBudgetAllocated, goals: financeState.goals.map((g) => ({ id: g.id, name: g.name, targetMinor: g.targetMinor, currentMinor: g.currentMinor, monthlyContributionMinor: g.monthlyContributionMinor ?? undefined, targetAmount: minor(g.targetMinor), currentAmount: minor(g.currentMinor), targetDate: g.targetDate, completedDate: g.completedDate ?? undefined, monthlyContribution: g.monthlyContributionMinor == null ? undefined : minor(g.monthlyContributionMinor), status: g.status as FinanceState['goals'][number]['status'], active: g.active })), attentionItems: [], portfolio: mapInvestmentHoldings(trades), investmentActivity: { trades: trades.map((trade) => ({ id: trade.id, ticker: trade.ticker, type: trade.type, units: trade.units, price: minor(trade.priceMinor), amount: trade.units * minor(trade.priceMinor), date: trade.occurredOn, note: trade.note ?? undefined })), dividends: dividends.map((dividend) => ({ id: dividend.id, ticker: dividend.ticker, amount: minor(dividend.amountMinor), date: dividend.occurredOn })) }, budgetVsActual: [] }
  }

  async addTransaction(input: AddTransactionInput, signal?: AbortSignal): Promise<Transaction> {
    const result = await this.request<TransactionMutationResponse>('/transactions', { method: 'POST', signal, body: JSON.stringify({ type: input.type, title: input.title, categoryId: input.categoryId ?? null, fromAccountId: input.type === 'expense' ? input.accountId : input.fromAccountId ?? null, toAccountId: input.type === 'income' ? input.accountId : input.toAccountId ?? null, occurredOn: input.date, occurredTime: input.time ?? null, amountMinor: input.amountMinor ?? majorNumberToMinorUnits(input.amount), feeMinor: input.feeMinor ?? majorNumberToMinorUnits(input.fee ?? 0), note: input.note ?? null, source: 'manual', status: 'cleared', idempotencyKey: input.idempotencyKey ?? null }) })
    return this.mapTransaction(result.transaction)
  }

  async updateTransaction(transactionId: string, input: Partial<AddTransactionInput>, signal?: AbortSignal): Promise<Transaction> {
    const updatePayload: Record<string, any> = {}
    if (input.title !== undefined) updatePayload.title = input.title
    if (input.categoryId !== undefined) updatePayload.categoryId = input.categoryId
    if (input.date !== undefined) updatePayload.occurredOn = input.date
    if (input.time !== undefined) updatePayload.occurredTime = input.time ?? null
    if (input.amountMinor !== undefined) updatePayload.amountMinor = input.amountMinor
    else if (input.amount !== undefined) updatePayload.amountMinor = majorNumberToMinorUnits(input.amount)
    if (input.feeMinor !== undefined) updatePayload.feeMinor = input.feeMinor
    else if (input.fee !== undefined) updatePayload.feeMinor = majorNumberToMinorUnits(input.fee ?? 0)
    if (input.note !== undefined) updatePayload.note = input.note

    const result = await this.request<TransactionMutationResponse>(`/transactions/${transactionId}`, { method: 'PATCH', signal, body: JSON.stringify(updatePayload) })
    return this.mapTransaction(result.transaction)
  }

  async reverseTransaction(transactionId: string, signal?: AbortSignal): Promise<Transaction> {
    const result = await this.request<ReverseTransactionResponse>(`/transactions/${transactionId}`, { method: 'DELETE', signal })
    return this.mapTransaction(result.reversedTransaction)
  }

  async addManualAccount(input: AddManualAccountInput, signal?: AbortSignal): Promise<Account> {
    const payload: CreateAccountRequest = { name: input.name, institution: input.institution ?? null, accountType: input.type, openingBalanceMinor: input.balanceMinor ?? majorNumberToMinorUnits(input.balance), lastFour: input.lastFour ?? null }
    const account = await this.request<ApiAccount>('/accounts', { method: 'POST', signal, body: JSON.stringify(payload) })
    return { id: account.id, name: account.name, institution: account.institution ?? undefined, type: account.accountType, classification: account.classification, balanceMinor: account.currentBalanceMinor, balance: minor(account.currentBalanceMinor), lastFour: account.lastFour ?? undefined, syncStatus: account.syncStatus, manual: account.manual }
  }

  async addManualCreditCard(input: AddManualCreditCardInput, signal?: AbortSignal): Promise<CreditCard> {
    const payload: CreateCreditCardRequest = { name: input.name, lastFour: input.lastFour, network: input.network, openingBalanceMinor: input.balanceMinor ?? majorNumberToMinorUnits(input.balance), creditLimitMinor: input.limitMinor ?? majorNumberToMinorUnits(input.limit), dueDay: Number(input.dueDate.slice(-2)), minimumPaymentMinor: input.minPaymentMinor ?? majorNumberToMinorUnits(input.minPayment) }
    const account = await this.request<ApiAccount>('/credit-cards', { method: 'POST', signal, body: JSON.stringify(payload) })
    const detail = account.creditCardDetail!
    return { id: account.id, name: account.name, lastFour: account.lastFour ?? '', network: detail.network, balanceMinor: account.currentBalanceMinor, balance: minor(account.currentBalanceMinor), limitMinor: detail.creditLimitMinor, limit: minor(detail.creditLimitMinor), dueDate: input.dueDate, minPaymentMinor: detail.minimumPaymentMinor, minPayment: minor(detail.minimumPaymentMinor), manual: account.manual }
  }

  async updateAccount(accountId: string, input: UpdateAccountInput, signal?: AbortSignal): Promise<Account> {
    const { balance, ...rest } = input
    const body: UpdateAccountRequest = { ...rest, ...(balance !== undefined && { currentBalanceMinor: majorNumberToMinorUnits(balance) }) }
    const account = await this.request<ApiAccount>(`/accounts/${accountId}`, { method: 'PATCH', signal, body: JSON.stringify(body) })
    return { id: account.id, name: account.name, institution: account.institution ?? undefined, type: account.accountType, classification: account.classification, balanceMinor: account.currentBalanceMinor, balance: minor(account.currentBalanceMinor), lastFour: account.lastFour ?? undefined, syncStatus: account.syncStatus, manual: account.manual }
  }

  async updateCreditCard(cardId: string, input: UpdateCreditCardInput, signal?: AbortSignal): Promise<CreditCard> {
    const { balance, ...rest } = input
    const body: UpdateAccountRequest = { ...rest, ...(balance !== undefined && { currentBalanceMinor: majorNumberToMinorUnits(balance) }) }
    const account = await this.request<ApiAccount>(`/accounts/${cardId}`, { method: 'PATCH', signal, body: JSON.stringify(body) })
    const detail = account.creditCardDetail!
    return { id: account.id, name: account.name, lastFour: account.lastFour ?? '', network: detail.network, balanceMinor: account.currentBalanceMinor, balance: minor(account.currentBalanceMinor), limitMinor: detail.creditLimitMinor, limit: minor(detail.creditLimitMinor), dueDate: `${new Date().toISOString().slice(0, 7)}-${String(detail.dueDay).padStart(2, '0')}`, minPaymentMinor: detail.minimumPaymentMinor, minPayment: minor(detail.minimumPaymentMinor), manual: account.manual }
  }

  async archiveAccount(accountId: string, signal?: AbortSignal): Promise<void> {
    await this.request<void>(`/accounts/${accountId}/archive`, { method: 'POST', signal })
  }

  async archiveCreditCard(cardId: string, signal?: AbortSignal): Promise<void> {
    await this.request<void>(`/accounts/${cardId}/archive`, { method: 'POST', signal })
  }

  async createGoal(input: CreateGoalInput, signal?: AbortSignal): Promise<Goal> {
    const payload: CreateGoalRequest = { name: input.name, targetMinor: input.targetMinor ?? majorNumberToMinorUnits(input.targetAmount), targetDate: input.targetDate, monthlyContributionMinor: input.monthlyContributionMinor ?? (input.monthlyContribution == null ? null : majorNumberToMinorUnits(input.monthlyContribution)) }
    const goal = await this.request<ApiGoal>('/goals', { method: 'POST', signal, body: JSON.stringify(payload) })
    return this.mapGoal(goal)
  }

  async addGoalFunds(goalId: string, sourceAccountId: string, amount: number, date: string, signal?: AbortSignal): Promise<Goal> {
    await this.request(`/goals/${goalId}/fund`, { method: 'POST', signal, body: JSON.stringify({ sourceAccountId, amountMinor: majorNumberToMinorUnits(amount), occurredOn: date }) })
    const state = await this.load(signal)
    const goal = state.goals.find((candidate) => candidate.id === goalId)
    if (!goal) throw new Error('Goal was not returned after funding')
    return goal
  }

  async updateGoal(goalId: string, input: UpdateGoalInput, signal?: AbortSignal): Promise<Goal> {
    const updatePayload: UpdateGoalRequest = {}
    if (input.name !== undefined) updatePayload.name = input.name
    if (input.targetMinor !== undefined) updatePayload.targetMinor = input.targetMinor
    else if (input.targetAmount !== undefined) updatePayload.targetMinor = majorNumberToMinorUnits(input.targetAmount)
    if (input.targetDate !== undefined) updatePayload.targetDate = input.targetDate
    if (input.monthlyContributionMinor !== undefined) updatePayload.monthlyContributionMinor = input.monthlyContributionMinor
    else if (input.monthlyContribution !== undefined) updatePayload.monthlyContributionMinor = input.monthlyContribution == null ? null : majorNumberToMinorUnits(input.monthlyContribution)

    const goal = await this.request<ApiGoal>(`/goals/${goalId}`, { method: 'PATCH', signal, body: JSON.stringify(updatePayload) })
    return this.mapGoal(goal)
  }

  async deleteGoal(goalId: string, signal?: AbortSignal): Promise<void> {
    await this.request<void>(`/goals/${goalId}`, { method: 'DELETE', signal })
  }

  async createBudgetPeriod(periodStart: string, periodEnd: string, incomePool: number, signal?: AbortSignal): Promise<ApiBudgetPeriod> {
    return this.request<ApiBudgetPeriod>('/budgets', { method: 'POST', signal, body: JSON.stringify({ periodStart, periodEnd, incomePoolMinor: majorNumberToMinorUnits(incomePool) }) })
  }

  async setBudgetAllocation(periodId: string, categoryId: string, allocated: number, signal?: AbortSignal): Promise<BudgetCategory> {
    const result = await this.request<ApiBudgetAllocation>(`/budgets/${periodId}/allocations`, { method: 'POST', signal, body: JSON.stringify({ categoryId, allocatedMinor: majorNumberToMinorUnits(allocated) }) })
    return { id: categoryId, allocatedMinor: result.allocatedMinor, allocated: minor(result.allocatedMinor), spentMinor: result.spentMinor, spent: minor(result.spentMinor) }
  }

  async addCategory(input: { name: string; color?: string; transactionKinds?: ('income' | 'expense')[] }, signal?: AbortSignal): Promise<ApiCategory> {
    const kinds = input.transactionKinds?.length ? input.transactionKinds : ['expense']
    return this.request('/categories', { method: 'POST', signal, body: JSON.stringify({ name: input.name, color: input.color ?? 'var(--cyan)', budgetable: kinds.includes('expense'), allowsIncome: kinds.includes('income'), allowsExpense: kinds.includes('expense') }) })
  }

  async updateCategory(categoryId: string, input: { name?: string; color?: string }, signal?: AbortSignal): Promise<ApiCategory> {
    return this.request<ApiCategory>(`/categories/${categoryId}`, { method: 'PATCH', signal, body: JSON.stringify(input) })
  }

  // Allocation isn't part of the category record — it lives on the current
  // budget period's allocations, so setting it means resolving (or creating)
  // this month's period, then upserting the allocation on it.
  private async resolveCurrentBudgetPeriod(signal?: AbortSignal): Promise<ApiBudgetPeriod> {
    const today = this._todayIso ?? new Date().toISOString().slice(0, 10)
    const [year, month] = today.split('-').map(Number)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(Date.UTC(year, month, 1))
    const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-01`
    return this.createBudgetPeriod(start, end, 0, signal)
  }

  async setCategoryBudget(categoryId: string, allocated: number, signal?: AbortSignal): Promise<BudgetCategory> {
    const period = await this.resolveCurrentBudgetPeriod(signal)
    return this.setBudgetAllocation(period.id, categoryId, allocated, signal)
  }

  async deleteCategory(categoryId: string, signal?: AbortSignal): Promise<void> {
    await this.request<void>(`/categories/${categoryId}`, { method: 'DELETE', signal })
  }

  private mapTransaction = (t: ApiTransaction): Transaction => ({ id: t.id, type: t.type, title: t.title, categoryId: t.categoryId ?? undefined, goalId: t.goalId ?? undefined, accountId: t.type === 'expense' || t.type === 'income' ? (t.fromAccountId ?? t.toAccountId ?? undefined) : undefined, fromAccountId: t.fromAccountId ?? undefined, toAccountId: t.toAccountId ?? undefined, date: t.occurredOn, time: t.occurredTime ? t.occurredTime.slice(0, 5) : undefined, amountMinor: t.type === 'expense' ? `-${t.amountMinor}` : t.amountMinor, amount: t.type === 'expense' ? -minor(t.amountMinor) : minor(t.amountMinor), feeMinor: t.feeMinor ?? undefined, fee: t.feeMinor ? minor(t.feeMinor) : undefined, source: t.source, status: t.status, note: t.note ?? undefined, reversedTransactionId: t.reversedTransactionId ?? undefined, tags: t.tags ?? [] })
  private mapGoal = (g: ApiGoal): Goal => ({ id: g.id, name: g.name, targetMinor: g.targetMinor, currentMinor: g.currentMinor, monthlyContributionMinor: g.monthlyContributionMinor ?? undefined, targetAmount: minor(g.targetMinor), currentAmount: minor(g.currentMinor), targetDate: g.targetDate, completedDate: g.completedDate ?? undefined, monthlyContribution: g.monthlyContributionMinor == null ? undefined : minor(g.monthlyContributionMinor), status: g.status as Goal['status'], active: g.active })
}

function mapInvestmentHoldings(trades: ApiInvestmentTrade[]): FinanceState['portfolio'] {
  const positions = new Map<string, { units: number; price: number }>()
  for (const trade of trades) {
    const current = positions.get(trade.ticker) ?? { units: 0, price: 0 }
    current.units += trade.type === 'buy' ? trade.units : -trade.units
    current.price = minor(trade.priceMinor)
    positions.set(trade.ticker, current)
  }
  return Array.from(positions.entries()).filter(([, position]) => position.units > 0).map(([ticker, position]) => ({ ticker, name: ticker, price: position.price, changePct: 0, units: position.units, history: [position.price] }))
}
