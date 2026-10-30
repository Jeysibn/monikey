import type { AccountType, Centavos, LedgerSnapshot } from '../types.ts'
import { parseMoney } from './entryForm.ts'

/*
 * The rules of the Add account form (UI_UX_SPEC section 9), free of React so they can be tested.
 * The plain labels people see map onto the API's fields: "Current balance" is the current amount when editing (opening_balance on creation),
 * "Amount you owe today" is current debt when editing (opening_debt on creation), "Credit limit" is credit_limit. Messages are the spec's.
 * A duplicate name is the API's 409 in real life; the mock checks it here, and the real client will
 * show the same message when the API answers 409.
 */
export interface AccountValues {
  type: AccountType
  name: string
  balance: string // cash, bank, e-wallet: what is in it right now
  limit: string // credit card: the most the bank lets you charge
  owed: string // credit card: what you still owe today
}

export type AccountField = 'name' | 'balance' | 'limit' | 'owed'
export type AccountErrors = Partial<Record<AccountField, string>>

export const MAX_NAME = 60
export const isCardType = (type: AccountType) => type === 'credit_card'

type MoneyField = 'balance' | 'limit' | 'owed'
const NEGATIVE = /^\s*[-−]/

/** Parses one money field. Balance and owed may be zero; the limit may not; only current balances/debt may be negative. */
export function parseAccountMoney(text: string, field: MoneyField, current = false): { ok: true; centavos: Centavos } | { ok: false; error: string } {
  if (current && field !== 'limit' && NEGATIVE.test(text)) {
    const parsed = parseMoney(text.trim().slice(1), true)
    return parsed.ok ? { ok: true, centavos: -parsed.centavos } : parsed
  }
  if (NEGATIVE.test(text)) {
    return { ok: false, error: field === 'limit' ? 'Credit limit must be more than ₱0.00.' : 'Use 0.00 or more.' }
  }
  const result = parseMoney(text, field !== 'limit')
  if (!result.ok && field === 'limit' && result.error === 'Amount must be more than ₱0.00.') {
    return { ok: false, error: 'Credit limit must be more than ₱0.00.' }
  }
  return result
}

export function validateAccount(v: AccountValues, snapshot: LedgerSnapshot, excludeAccountId?: number): AccountErrors {
  const errors: AccountErrors = {}
  const name = v.name.trim()
  if (name === '') errors.name = 'Give the account a name.'
  else if (name.length > MAX_NAME) errors.name = 'Keep the name under 60 characters.'
  else if (snapshot.accounts.some((a) => a.id !== excludeAccountId && a.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'You already have an account with that name.'
  }

  if (isCardType(v.type)) {
    const limit = parseAccountMoney(v.limit, 'limit')
    if (!limit.ok) errors.limit = limit.error
    const owed = parseAccountMoney(v.owed, 'owed', excludeAccountId !== undefined)
    if (!owed.ok) errors.owed = owed.error
  } else {
    const balance = parseAccountMoney(v.balance, 'balance', excludeAccountId !== undefined)
    if (!balance.ok) errors.balance = balance.error
  }
  return errors
}

export const accountSavedMessage = (v: AccountValues): string => `Account added: ${v.name.trim()}.`
export const accountUpdatedMessage = (v: AccountValues): string => `Account updated: ${v.name.trim()}. Current amount saved; past activity is unchanged.`
