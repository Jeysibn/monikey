import { withFavorites } from '../domain/favorites'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AddCategoryInput, AddManualAccountInput, AddManualCreditCardInput, AddTransactionInput, BudgetCategory, Category, CreateGoalInput, FinanceState, Transaction, Account, CreditCard, Goal, UpdateAccountInput, UpdateCreditCardInput, UpdateGoalInput } from '../domain/finance'
import { FinanceApiError, PostedRefreshError, type FinanceGateway } from '../services/apiFinanceGateway'
import type { AddRecurringItemInput, RecurringItem } from '../domain/recurring'
import type { ConfirmPaymentInput, ConfirmPaymentResult, PaymentCandidate, RecurringGateway, RecurringSuggestion } from '../services/apiRecurringGateway'
import { ApiRecurringGateway } from '../services/apiRecurringGateway'
import { ApiFinanceGateway } from '../services/apiFinanceGateway'
import { FinanceContext, type FinanceContextValue } from './financeContext'
import { localFirstStore } from '../services/localFirstStore'
import { syncPendingOutbox } from '../services/outboxSync'
import { cryptoApi } from '../services/cryptoApiGateway'
import { uploadAndProcessReceipt } from '../services/apiAuth'

export type FinanceBootStatus = 'loading' | 'ready' | 'error'

export interface AsyncFinanceContextValue {
  state: FinanceState | null
  status: FinanceBootStatus
  error: Error | null
  offline: boolean
  retry: () => void
  /** Re-load balances and lists without touching the ledger (used after a posted transaction whose refresh failed). */
  refreshState: () => Promise<void>
  /** Bumps after every confirmed mutation or refresh. Derived views (reports, budgets, activity) key their refetch on it instead of guessing from transaction counts. */
  financeVersion: number
  /** Authoritative refetch of balances, transactions and recurring items. Resolves false (never throws) when any part failed. */
  refreshAfterPayment: () => Promise<boolean>
  refreshRecurring: () => Promise<boolean>
  confirmRecurringPayment: (id: string, input: ConfirmPaymentInput) => Promise<{ result: ConfirmPaymentResult; refreshed: boolean }>
  linkRecurringPayment: (id: string, input: { expectedDueDate: string; transactionId: string }) => Promise<{ result: ConfirmPaymentResult; refreshed: boolean }>
  recurringPaymentCandidates: (id: string, query: { dueDate: string; amountMinor: string; accountId?: string }) => Promise<PaymentCandidate[]>
  addTransaction: (input: AddTransactionInput) => Promise<Transaction>
  updateTransaction: (transactionId: string, input: Partial<AddTransactionInput>) => Promise<Transaction>
  reverseTransaction: (transactionId: string) => Promise<Transaction>
  addManualAccount: (input: AddManualAccountInput) => Promise<Account>
  addManualCreditCard: (input: AddManualCreditCardInput) => Promise<CreditCard>
  updateAccount: (accountId: string, input: UpdateAccountInput) => Promise<Account>
  updateCreditCard: (cardId: string, input: UpdateCreditCardInput) => Promise<CreditCard>
  archiveAccount: (accountId: string) => Promise<void>
  archiveCreditCard: (cardId: string) => Promise<void>
  /** Replaces the whole ordered favorite selection (max 4). Rejects without changing state if the server refuses. */
  setFavorites: (accountIds: string[]) => Promise<void>
  createGoal: (input: CreateGoalInput) => Promise<Goal>
  addGoalFunds: (goalId: string, sourceAccountId: string, amount: number, date: string) => Promise<Goal>
  updateGoal: (goalId: string, input: UpdateGoalInput) => Promise<Goal>
  deleteGoal: (goalId: string) => Promise<void>
  setBudgetAllocation: (periodId: string, categoryId: string, allocated: number) => Promise<BudgetCategory>
  addCategory: (input: AddCategoryInput) => Promise<Category>
  updateCategory: (categoryId: string, updates: { name?: string; color?: string }) => Promise<Category>
  setCategoryBudget: (categoryId: string, allocated: number) => Promise<BudgetCategory>
  deleteCategory: (categoryId: string) => Promise<void>
  recurringItems: RecurringItem[]
  recurringSuggestions: RecurringSuggestion[]
  addRecurringItem: (input: AddRecurringItemInput) => Promise<RecurringItem>
  setRecurringStatus: (id: string, status: 'active' | 'paused') => Promise<RecurringItem>
  markRecurringPaid: (id: string) => Promise<RecurringItem>
  editRecurringItem: (id: string, input: Partial<AddRecurringItemInput>) => Promise<RecurringItem>
  deleteRecurringItem: (id: string) => Promise<void>
}

const AsyncFinanceContext = createContext<AsyncFinanceContextValue | null>(null)

export interface AsyncFinanceProviderProps {
  children: ReactNode
  gateway?: FinanceGateway
  recurringGateway?: RecurringGateway
}

export function AsyncFinanceProvider({ children, gateway, recurringGateway }: AsyncFinanceProviderProps) {
  const [stableGateway] = useState(() => gateway ?? new ApiFinanceGateway())
  const [status, setStatus] = useState<FinanceBootStatus>('loading')
  const [state, setState] = useState<FinanceState | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [stableRecurringGateway] = useState(() => recurringGateway ?? (gateway ? undefined : new ApiRecurringGateway()))
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([])
  const [recurringSuggestions, setRecurringSuggestions] = useState<RecurringSuggestion[]>([])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    stableGateway.load(controller.signal).then((next) => {
      if (!controller.signal.aborted) {
        setState(next); setOffline(false); setStatus('ready')
        void localFirstStore.saveSnapshot({ key: 'latest', value: next, syncedAt: new Date().toISOString() }).catch(() => undefined)
        void syncPendingOutbox(stableGateway, cryptoApi, { upload: uploadAndProcessReceipt }).then((result) => {
          if (result.synced > 0) void stableGateway.load().then(setState).catch(() => undefined)
        }).catch(() => undefined)
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        if (cause instanceof FinanceApiError && (cause.status === 401 || cause.status === 403)) {
          setError(cause); setStatus('error'); return
        }
        void localFirstStore.latestSnapshot().then((snapshot) => {
          if (snapshot) { setState(snapshot.value as FinanceState); setOffline(true); setStatus('ready') }
          else { setError(cause instanceof Error ? cause : new Error('Unable to load finance data')); setStatus('error') }
        }).catch(() => { setError(cause instanceof Error ? cause : new Error('Unable to load finance data')); setStatus('error') })
      }
    })
    return () => controller.abort()
  }, [stableGateway, attempt])

  useEffect(() => {
    if (!stableRecurringGateway) return
    stableRecurringGateway.load().then(setRecurringItems).catch(() => undefined)
    stableRecurringGateway.suggestions?.().then(setRecurringSuggestions).catch(() => undefined)
  }, [stableRecurringGateway])

  const [financeVersion, setFinanceVersion] = useState(0)
  const bump = useCallback(() => setFinanceVersion((v) => v + 1), [])
  const refreshState = useCallback(async () => {
    const refreshed = await stableGateway.load()
    if (refreshed) setState(refreshed)
    bump()
  }, [stableGateway, bump])
  const refreshRecurring = useCallback(async () => {
    if (!stableRecurringGateway) return false
    try { setRecurringItems(await stableRecurringGateway.load()); return true } catch { return false }
  }, [stableRecurringGateway])
  const refreshAfterPayment = useCallback(async () => {
    const [balances, recurring] = await Promise.all([refreshState().then(() => true, () => false), refreshRecurring()])
    bump()
    return balances && recurring
  }, [refreshState, refreshRecurring, bump])
  // A confirmed payment is final even when the follow-up refetch fails: the caller gets `refreshed:false` and a retry
  // that only refetches. It never re-sends the payment.
  const confirmRecurringPayment = useCallback(async (id: string, input: ConfirmPaymentInput) => {
    if (!stableRecurringGateway?.confirmPayment) throw new Error('Recurring backend is not configured')
    const result = await stableRecurringGateway.confirmPayment(id, input)
    setRecurringItems((current) => current.map((item) => item.id === id ? result.recurring : item))
    return { result, refreshed: await refreshAfterPayment() }
  }, [stableRecurringGateway, refreshAfterPayment])
  const linkRecurringPayment = useCallback(async (id: string, input: { expectedDueDate: string; transactionId: string }) => {
    if (!stableRecurringGateway?.linkPayment) throw new Error('Recurring backend is not configured')
    const result = await stableRecurringGateway.linkPayment(id, input)
    setRecurringItems((current) => current.map((item) => item.id === id ? result.recurring : item))
    return { result, refreshed: await refreshAfterPayment() }
  }, [stableRecurringGateway, refreshAfterPayment])
  const recurringPaymentCandidates = useCallback(async (id: string, query: { dueDate: string; amountMinor: string; accountId?: string }) => {
    if (!stableRecurringGateway?.paymentCandidates) throw new Error('Recurring backend is not configured')
    return stableRecurringGateway.paymentCandidates(id, query)
  }, [stableRecurringGateway])
  const addTransaction = useCallback(async (input: AddTransactionInput) => {
    // Errors thrown here mean the posting outcome is unknown or rejected; the caller classifies them.
    const result = await stableGateway.addTransaction(input)
    // From here on the transaction IS posted. A failed reload must never look like a failed post
    // (that would invite a second submission or a second outbox entry), so it is reported separately.
    // A posted transaction changes balances, goals, budget spending, and related selectors:
    // reload the authoritative snapshot instead of maintaining a partial client-side projection.
    let refreshed: FinanceState | undefined
    try { refreshed = await stableGateway.load() } catch (cause) {
      setState((current) => current ? { ...current, transactions: current.transactions.some((t) => t.id === result.id) ? current.transactions : [result, ...current.transactions] } : current)
      bump()
      throw new PostedRefreshError(result, cause)
    }
    bump()
    setState((current) => {
      if (refreshed) return refreshed.transactions.some((transaction) => transaction.id === result.id) ? refreshed : { ...refreshed, transactions: [result, ...refreshed.transactions] }
      return current ? { ...current, transactions: [result, ...current.transactions] } : current
    })
    return result
  }, [stableGateway, bump])
  const updateTransaction = useCallback(async (transactionId: string, input: Partial<AddTransactionInput>) => {
    const result = await stableGateway.updateTransaction(transactionId, input)
    const refreshed = await stableGateway.load()
    setState((current) => {
      if (refreshed) return refreshed.transactions.some((transaction) => transaction.id === result.id) ? refreshed : { ...refreshed, transactions: current ? current.transactions.map((t) => t.id === result.id ? result : t) : [result] }
      return current ? { ...current, transactions: current.transactions.map((t) => t.id === result.id ? result : t) } : current
    })
    return result
  }, [stableGateway])
  const reverseTransaction = useCallback(async (transactionId: string) => {
    const result = await stableGateway.reverseTransaction(transactionId)
    const refreshed = await stableGateway.load()
    setState((current) => {
      if (refreshed) return refreshed
      return current
    })
    return result
  }, [stableGateway])
  const addManualAccount = useCallback(async (input: AddManualAccountInput) => {
    const result = await stableGateway.addManualAccount(input)
    const refreshed = await stableGateway.load()
    setState((current) => {
      if (refreshed) return refreshed.accounts.some((account) => account.id === result.id) ? refreshed : { ...refreshed, accounts: [...refreshed.accounts, result] }
      return current ? { ...current, accounts: [...current.accounts, result] } : current
    })
    return result
  }, [stableGateway])
  const addManualCreditCard = useCallback(async (input: AddManualCreditCardInput) => {
    const result = await stableGateway.addManualCreditCard(input)
    const refreshed = await stableGateway.load()
    setState((current) => {
      if (refreshed) return refreshed.creditCards.some((card) => card.id === result.id) ? refreshed : { ...refreshed, creditCards: [...refreshed.creditCards, result] }
      return current ? { ...current, creditCards: [...current.creditCards, result] } : current
    })
    return result
  }, [stableGateway])
  const createGoal = useCallback(async (input: CreateGoalInput) => {
    const result = await stableGateway.createGoal(input)
    const refreshed = await stableGateway.load()
    setState((current) => {
      if (refreshed) return refreshed.goals.some((goal) => goal.id === result.id) ? refreshed : { ...refreshed, goals: [...refreshed.goals, result] }
      return current ? { ...current, goals: [...current.goals, result] } : current
    })
    return result
  }, [stableGateway])
  const addGoalFunds = useCallback(async (goalId: string, sourceAccountId: string, amount: number, date: string) => {
    const result = await stableGateway.addGoalFunds(goalId, sourceAccountId, amount, date)
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, goals: current.goals.map((goal) => goal.id === result.id ? result : goal) } : current))
    return result
  }, [stableGateway])
  const updateGoal = useCallback(async (goalId: string, input: UpdateGoalInput) => {
    const result = await stableGateway.updateGoal(goalId, input)
    setState((current) => current ? { ...current, goals: current.goals.map((g) => g.id === goalId ? result : g) } : current)
    return result
  }, [stableGateway])
  const deleteGoal = useCallback(async (goalId: string) => {
    await stableGateway.deleteGoal(goalId)
    setState((current) => current ? { ...current, goals: current.goals.filter((g) => g.id !== goalId) } : current)
  }, [stableGateway])
  const setBudgetAllocation = useCallback(async (periodId: string, categoryId: string, allocated: number) => {
    const result = await stableGateway.setBudgetAllocation(periodId, categoryId, allocated)
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, budgetCategories: current.budgetCategories.some((item) => item.id === categoryId) ? current.budgetCategories.map((item) => item.id === categoryId ? { ...item, allocated: result.allocated } : item) : [...current.budgetCategories, result] } : current))
    return result
  }, [stableGateway])
  const addCategory = useCallback(async (input: AddCategoryInput) => {
    const result = await stableGateway.addCategory(input)
    const category: Category = { id: result.id, name: result.name, color: result.color, budgetable: result.budgetable, transactionKinds: [...(result.allowsIncome ? ['income' as const] : []), ...(result.allowsExpense ? ['expense' as const] : [])] }
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, categories: [...current.categories, category] } : current))
    return category
  }, [stableGateway])
  const updateCategory = useCallback(async (categoryId: string, updates: { name?: string; color?: string }) => {
    const result = await stableGateway.updateCategory(categoryId, updates)
    const category: Category = { id: result.id, name: result.name, color: result.color, budgetable: true, transactionKinds: ['expense'] }
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, categories: current.categories.map((c) => c.id === categoryId ? category : c) } : current))
    return category
  }, [stableGateway])
  const setCategoryBudget = useCallback(async (categoryId: string, allocated: number) => {
    const result = await stableGateway.setCategoryBudget(categoryId, allocated)
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, budgetCategories: current.budgetCategories.some((item) => item.id === categoryId) ? current.budgetCategories.map((item) => item.id === categoryId ? result : item) : [...current.budgetCategories, result] } : current))
    return result
  }, [stableGateway])
  const deleteCategory = useCallback(async (categoryId: string) => {
    await stableGateway.deleteCategory(categoryId)
    setState((current) => current ? { ...current, categories: current.categories.filter((c) => c.id !== categoryId), budgetCategories: current.budgetCategories.filter((bc) => bc.id !== categoryId) } : current)
  }, [stableGateway])
  const updateAccount = useCallback(async (accountId: string, input: UpdateAccountInput) => {
    const result = await stableGateway.updateAccount(accountId, input)
    setState((current) => current ? { ...current, accounts: current.accounts.map((a) => a.id === accountId ? result : a) } : current)
    return result
  }, [stableGateway])
  const updateCreditCard = useCallback(async (cardId: string, input: UpdateCreditCardInput) => {
    const result = await stableGateway.updateCreditCard(cardId, input)
    setState((current) => current ? { ...current, creditCards: current.creditCards.map((c) => c.id === cardId ? result : c) } : current)
    return result
  }, [stableGateway])
  const archiveAccount = useCallback(async (accountId: string) => {
    await stableGateway.archiveAccount(accountId)
    setState((current) => current ? { ...current, accounts: current.accounts.filter((a) => a.id !== accountId) } : current)
  }, [stableGateway])
  const setFavorites = useCallback(async (accountIds: string[]) => {
    await stableGateway.setFavorites(accountIds)
    setState((current) => current ? withFavorites(current, accountIds) : current)
  }, [stableGateway])
  const archiveCreditCard = useCallback(async (cardId: string) => {
    await stableGateway.archiveCreditCard(cardId)
    setState((current) => current ? { ...current, creditCards: current.creditCards.filter((c) => c.id !== cardId) } : current)
  }, [stableGateway])
  const addRecurringItem = useCallback(async (input: AddRecurringItemInput) => {
    if (!stableRecurringGateway) throw new Error('Recurring backend is not configured')
    const result = await stableRecurringGateway.add(input)
    setRecurringItems((current) => [...current, result])
    return result
  }, [stableRecurringGateway])
  const setRecurringStatus = useCallback(async (id: string, status: 'active' | 'paused') => {
    if (!stableRecurringGateway) throw new Error('Recurring backend is not configured')
    const result = await stableRecurringGateway.setStatus(id, status)
    setRecurringItems((current) => current.map((item) => item.id === id ? result : item))
    return result
  }, [stableRecurringGateway])
  const markRecurringPaid = useCallback(async (id: string) => {
    if (!stableRecurringGateway) throw new Error('Recurring backend is not configured')
    const result = await stableRecurringGateway.markPaid(id)
    setRecurringItems((current) => current.map((item) => item.id === id ? result : item))
    return result
  }, [stableRecurringGateway])
  const editRecurringItem = useCallback(async (id: string, input: Partial<AddRecurringItemInput>) => {
    if (!stableRecurringGateway) throw new Error('Recurring backend is not configured')
    const result = await stableRecurringGateway.update(id, input)
    setRecurringItems((current) => current.map((item) => item.id === id ? result : item))
    return result
  }, [stableRecurringGateway])
  const deleteRecurringItem = useCallback(async (id: string) => {
    if (!stableRecurringGateway) throw new Error('Recurring backend is not configured')
    await stableRecurringGateway.delete(id)
    setRecurringItems((current) => current.filter((item) => item.id !== id))
  }, [stableRecurringGateway])
  const value = useMemo<AsyncFinanceContextValue>(() => ({ state, status, error, offline, retry: () => setAttempt((value) => value + 1), refreshState, financeVersion, refreshAfterPayment, refreshRecurring, confirmRecurringPayment, linkRecurringPayment, recurringPaymentCandidates, addTransaction, updateTransaction, reverseTransaction, addManualAccount, addManualCreditCard, updateAccount, updateCreditCard, archiveAccount, archiveCreditCard, setFavorites, createGoal, addGoalFunds, updateGoal, deleteGoal, setBudgetAllocation, addCategory, updateCategory, setCategoryBudget, deleteCategory, recurringItems, recurringSuggestions, addRecurringItem, setRecurringStatus, markRecurringPaid, editRecurringItem, deleteRecurringItem }), [state, status, error, offline, refreshState, financeVersion, refreshAfterPayment, refreshRecurring, confirmRecurringPayment, linkRecurringPayment, recurringPaymentCandidates, addTransaction, updateTransaction, reverseTransaction, addManualAccount, addManualCreditCard, updateAccount, updateCreditCard, archiveAccount, archiveCreditCard, setFavorites, createGoal, addGoalFunds, updateGoal, deleteGoal, setBudgetAllocation, addCategory, updateCategory, setCategoryBudget, deleteCategory, recurringItems, recurringSuggestions, addRecurringItem, setRecurringStatus, markRecurringPaid, editRecurringItem, deleteRecurringItem])
  const financeValue = useMemo<FinanceContextValue>(() => ({
    state: state ?? { accounts: [], creditCards: [], categories: [], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [] },
    recurringItems,
    recurringSuggestions,
    todayIso: stableGateway.todayIso ?? new Date().toISOString().slice(0, 10),
    addTransaction,
    updateTransaction,
    reverseTransaction,
    addManualAccount,
    addManualCreditCard,
    addCategory,
    updateCategory,
    setCategoryBudget,
    deleteCategory: (categoryId) => deleteCategory(categoryId),
    createGoal,
    updateGoal,
    addGoalFunds: (goalId, sourceAccountId, amount) => addGoalFunds(goalId, sourceAccountId, amount, stableGateway.todayIso ?? new Date().toISOString().slice(0, 10)),
  }), [state, recurringItems, recurringSuggestions, addTransaction, updateTransaction, reverseTransaction, addManualAccount, addManualCreditCard, addCategory, updateCategory, setCategoryBudget, deleteCategory, createGoal, updateGoal, addGoalFunds])
  return <AsyncFinanceContext.Provider value={value}><FinanceContext.Provider value={financeValue}>{children}</FinanceContext.Provider></AsyncFinanceContext.Provider>
}

export function useAsyncFinance(): AsyncFinanceContextValue {
  const context = useContext(AsyncFinanceContext)
  if (!context) throw new Error('useAsyncFinance must be used inside AsyncFinanceProvider')
  return context
}

export function useAsyncFinanceOptional(): AsyncFinanceContextValue | null {
  return useContext(AsyncFinanceContext)
}
