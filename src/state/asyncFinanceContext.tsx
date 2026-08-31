import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AddManualAccountInput, AddManualCreditCardInput, AddTransactionInput, BudgetCategory, CreateGoalInput, FinanceState, Transaction, Account, CreditCard, Goal } from '../domain/finance'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import { ApiFinanceGateway } from '../services/apiFinanceGateway'
import { FinanceContext, type FinanceContextValue } from './financeContext'

export type FinanceBootStatus = 'loading' | 'ready' | 'error'

export interface AsyncFinanceContextValue {
  state: FinanceState | null
  status: FinanceBootStatus
  error: Error | null
  retry: () => void
  addTransaction: (input: AddTransactionInput) => Promise<Transaction>
  addManualAccount: (input: AddManualAccountInput) => Promise<Account>
  addManualCreditCard: (input: AddManualCreditCardInput) => Promise<CreditCard>
  createGoal: (input: CreateGoalInput) => Promise<Goal>
  addGoalFunds: (goalId: string, sourceAccountId: string, amount: number, date: string) => Promise<Goal>
  setBudgetAllocation: (periodId: string, categoryId: string, allocated: number) => Promise<BudgetCategory>
  addBudgetCategory: (input: { name: string; allocated: number; color?: string }) => Promise<{ id: string; name: string; color: string; allocated: number }>
}

const AsyncFinanceContext = createContext<AsyncFinanceContextValue | null>(null)

export interface AsyncFinanceProviderProps {
  children: ReactNode
  gateway?: FinanceGateway
}

export function AsyncFinanceProvider({ children, gateway }: AsyncFinanceProviderProps) {
  const [stableGateway] = useState(() => gateway ?? new ApiFinanceGateway())
  const [status, setStatus] = useState<FinanceBootStatus>('loading')
  const [state, setState] = useState<FinanceState | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    stableGateway.load(controller.signal).then((next) => {
      if (!controller.signal.aborted) { setState(next); setStatus('ready') }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause : new Error('Unable to load finance data')); setStatus('error') }
    })
    return () => controller.abort()
  }, [stableGateway, attempt])

  const addTransaction = useCallback(async (input: AddTransactionInput) => {
    const result = await stableGateway.addTransaction(input)
    // A posted transaction changes balances, goals, budget spending, and
    // related selectors. Reload the authoritative snapshot instead of
    // maintaining a partial client-side projection of those effects.
    const refreshed = await stableGateway.load()
    setState((current) => {
      if (refreshed) return refreshed.transactions.some((transaction) => transaction.id === result.id) ? refreshed : { ...refreshed, transactions: [result, ...refreshed.transactions] }
      return current ? { ...current, transactions: [result, ...current.transactions] } : current
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
  const setBudgetAllocation = useCallback(async (periodId: string, categoryId: string, allocated: number) => {
    const result = await stableGateway.setBudgetAllocation(periodId, categoryId, allocated)
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, budgetCategories: current.budgetCategories.some((item) => item.id === categoryId) ? current.budgetCategories.map((item) => item.id === categoryId ? { ...item, allocated: result.allocated } : item) : [...current.budgetCategories, result] } : current))
    return result
  }, [stableGateway])
  const addBudgetCategory = useCallback(async (input: { name: string; allocated: number; color?: string }) => {
    const result = await stableGateway.addBudgetCategory(input)
    const refreshed = await stableGateway.load()
    setState((current) => refreshed ?? (current ? { ...current, categories: [...current.categories, { id: result.id, name: result.name, color: result.color, budgetable: true, transactionKinds: ['expense'] }], budgetCategories: [...current.budgetCategories, { id: result.id, allocated: result.allocated, spent: 0 }] } : current))
    return result
  }, [stableGateway])

  const value = useMemo<AsyncFinanceContextValue>(() => ({ state, status, error, retry: () => setAttempt((value) => value + 1), addTransaction, addManualAccount, addManualCreditCard, createGoal, addGoalFunds, setBudgetAllocation, addBudgetCategory }), [state, status, error, addTransaction, addManualAccount, addManualCreditCard, createGoal, addGoalFunds, setBudgetAllocation, addBudgetCategory])
  const financeValue = useMemo<FinanceContextValue>(() => ({
    state: state ?? { accounts: [], creditCards: [], categories: [], transactions: [], budgetCategories: [], totalBudgetAllocated: 0, goals: [], attentionItems: [], portfolio: [], budgetVsActual: [] },
    todayIso: new Date().toISOString().slice(0, 10),
    addTransaction,
    addManualAccount,
    addManualCreditCard,
    addBudgetCategory: (input) => addBudgetCategory(input).then((category) => ({ id: category.id, name: category.name, allocated: input.allocated, spent: 0 })),
    createGoal,
    addGoalFunds: (goalId, sourceAccountId, amount) => addGoalFunds(goalId, sourceAccountId, amount, new Date().toISOString().slice(0, 10)),
  }), [state, addTransaction, addManualAccount, addManualCreditCard, createGoal, addGoalFunds])
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
