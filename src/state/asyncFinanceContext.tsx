import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AddManualAccountInput, AddManualCreditCardInput, AddTransactionInput, FinanceState, Transaction, Account, CreditCard } from '../domain/finance'
import type { FinanceGateway } from '../services/apiFinanceGateway'
import { ApiFinanceGateway } from '../services/apiFinanceGateway'

export type FinanceBootStatus = 'loading' | 'ready' | 'error'

export interface AsyncFinanceContextValue {
  state: FinanceState | null
  status: FinanceBootStatus
  error: Error | null
  retry: () => void
  addTransaction: (input: AddTransactionInput) => Promise<Transaction>
  addManualAccount: (input: AddManualAccountInput) => Promise<Account>
  addManualCreditCard: (input: AddManualCreditCardInput) => Promise<CreditCard>
}

const AsyncFinanceContext = createContext<AsyncFinanceContextValue | null>(null)

export interface AsyncFinanceProviderProps {
  children: ReactNode
  gateway?: FinanceGateway
}

export function AsyncFinanceProvider({ children, gateway = new ApiFinanceGateway() }: AsyncFinanceProviderProps) {
  const [status, setStatus] = useState<FinanceBootStatus>('loading')
  const [state, setState] = useState<FinanceState | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    gateway.load(controller.signal).then((next) => {
      if (!controller.signal.aborted) { setState(next); setStatus('ready') }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause : new Error('Unable to load finance data')); setStatus('error') }
    })
    return () => controller.abort()
  }, [gateway, attempt])

  const addTransaction = useCallback(async (input: AddTransactionInput) => {
    const result = await gateway.addTransaction(input)
    setState((current) => current ? { ...current, transactions: [result, ...current.transactions] } : current)
    return result
  }, [gateway])
  const addManualAccount = useCallback(async (input: AddManualAccountInput) => {
    const result = await gateway.addManualAccount(input)
    setState((current) => current ? { ...current, accounts: [...current.accounts, result] } : current)
    return result
  }, [gateway])
  const addManualCreditCard = useCallback(async (input: AddManualCreditCardInput) => {
    const result = await gateway.addManualCreditCard(input)
    setState((current) => current ? { ...current, creditCards: [...current.creditCards, result] } : current)
    return result
  }, [gateway])

  const value = useMemo<AsyncFinanceContextValue>(() => ({ state, status, error, retry: () => setAttempt((value) => value + 1), addTransaction, addManualAccount, addManualCreditCard }), [state, status, error, addTransaction, addManualAccount, addManualCreditCard])
  return <AsyncFinanceContext.Provider value={value}>{children}</AsyncFinanceContext.Provider>
}

export function useAsyncFinance(): AsyncFinanceContextValue {
  const context = useContext(AsyncFinanceContext)
  if (!context) throw new Error('useAsyncFinance must be used inside AsyncFinanceProvider')
  return context
}
