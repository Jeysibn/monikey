import { ApiError } from './dataSource.ts'
import { parseAccountMoney, type AccountValues } from './lib/accountForm.ts'
import { isValidDate, parseAmount, type EntryValues } from './lib/entryForm.ts'
import { isMoney, MAX_MONEY_CENTAVOS, amountText } from './lib/money.ts'
import type {
  AccountInfo,
  AccountsSnapshot,
  ActivityItem,
  CardStatus,
  Category,
  Centavos,
  FinancialSummary,
  LiquidAccountType,
} from './types.ts'

export type WireMoney = string
export type WireAccountType = AccountInfo['type']

export interface WireLiquidAccount {
  id: number
  name: string
  type: LiquidAccountType
  balance: WireMoney
}

export interface WireCardAccount {
  id: number
  name: string
  type: 'credit_card'
  credit_limit: WireMoney
  outstanding_signed_debt: WireMoney
  available_credit: WireMoney
  owed: WireMoney
  credit: WireMoney
}

export type WireAccount = WireLiquidAccount | WireCardAccount

export interface WireCategory {
  id: number
  name: string
  type: Category['type']
}

export interface WireTransaction {
  id: number
  account_id: number
  category_id: number
  amount: WireMoney
  transaction_date: string
  note: string | null
  created_at: string
}

export interface WirePayment {
  id: number
  source_account_id: number
  card_account_id: number
  amount: WireMoney
  payment_date: string
  note: string | null
  created_at: string
}

export interface WireSummary {
  month: string
  liquid_balance: WireMoney
  outstanding_debt: WireMoney
  card_credit: WireMoney
  net_position: WireMoney
  month_income: WireMoney
  month_expenses: WireMoney
}

export interface WireEntryInput {
  account_id: number
  category_id: number
  amount: WireMoney
  transaction_date: string
  note: string | null
}

export interface WirePaymentInput {
  source_account_id: number
  card_account_id: number
  amount: WireMoney
  payment_date: string
  note: string | null
}

export interface WireAccountInput {
  name: string
  type: WireAccountType
  opening_balance: WireMoney
  opening_debt: WireMoney
  credit_limit: WireMoney | null
}

export interface WireError {
  error: { code: string; message: string; field?: string }
}

const contractError = (what: string): ApiError => new ApiError(500, 'contract_error', `The server returned invalid ${what}.`)

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw contractError(what)
  return value as Record<string, unknown>
}

function string(value: unknown, what: string): string {
  if (typeof value !== 'string') throw contractError(what)
  return value
}

function nullableString(value: unknown, what: string): string | null {
  if (value === null) return null
  return string(value, what)
}

function id(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw contractError(what)
  return value
}

/** Parse a decimal string using integer arithmetic. API money never passes through a JS float. */
export function toCentavos(value: unknown, what = 'money value'): Centavos {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) throw contractError(what)
  const negative = value.startsWith('-')
  const digits = negative ? value.slice(1) : value
  const [whole, fraction] = digits.split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction)
  const signed = negative ? -amount : amount
  if (signed < -BigInt(MAX_MONEY_CENTAVOS) || signed > BigInt(MAX_MONEY_CENTAVOS)) throw contractError(what)
  const result = Number(signed)
  if (!isMoney(result)) throw contractError(what)
  return result
}

function calendarDate(value: unknown, what: string): string {
  const date = string(value, what)
  if (!isValidDate(date)) throw contractError(what)
  return date
}

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/

function createdAt(value: unknown): string {
  const timestamp = string(value, 'timestamp')
  const match = TIMESTAMP.exec(timestamp)
  if (!match || !isValidDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(timestamp))) throw contractError('timestamp')
  if (match[6] && (Number(match[7]) > 23 || Number(match[8]) > 59)) throw contractError('timestamp')
  return timestamp
}

function parseCategory(value: unknown): Category {
  const row = record(value, 'category')
  const type = row.type
  if (type !== 'income' && type !== 'expense') throw contractError('category')
  const name = string(row.name, 'category')
  if (!name.trim()) throw contractError('category')
  return { id: id(row.id, 'category'), name, type }
}

/** Validate and convert a JSON account row into the view model used by the screens. */
export function fromWireAccount(value: unknown): { account: AccountInfo; liquid?: AccountsSnapshot['liquid'][number]; card?: CardStatus } {
  const row = record(value, 'account')
  const accountId = id(row.id, 'account')
  const name = string(row.name, 'account')
  if (!name.trim()) throw contractError('account')
  const type = row.type
  if (type === 'cash' || type === 'bank' || type === 'ewallet') {
    const account: AccountInfo & { type: LiquidAccountType } = { id: accountId, name, type }
    return { account, liquid: { account, balance: toCentavos(row.balance, 'account balance') } }
  }
  if (type !== 'credit_card') throw contractError('account')

  const creditLimit = toCentavos(row.credit_limit, 'credit limit')
  const signedDebt = toCentavos(row.outstanding_signed_debt, 'card debt')
  const availableCredit = toCentavos(row.available_credit, 'available credit')
  const owed = toCentavos(row.owed, 'card amount owed')
  const credit = toCentavos(row.credit, 'card credit')
  if (creditLimit < 0 || owed < 0 || credit < 0 || availableCredit !== creditLimit - signedDebt || owed !== Math.max(signedDebt, 0) || credit !== Math.max(-signedDebt, 0)) {
    throw contractError('credit-card figures')
  }
  const account: AccountInfo = { id: accountId, name, type }
  const card: CardStatus = { account, creditLimit, signedDebt, availableCredit, owed, credit }
  return { account, card }
}

const TYPE_ORDER: Record<WireAccountType, number> = { cash: 0, bank: 1, ewallet: 2, credit_card: 3 }

export function fromWireAccounts(value: unknown): AccountsSnapshot {
  if (!Array.isArray(value)) throw contractError('accounts')
  const rows = value.map(fromWireAccount)
  const accounts = rows.map((item) => item.account).sort((a, b) => a.id - b.id)
  const liquid = rows.flatMap((item) => item.liquid ? [item.liquid] : []).sort((a, b) => TYPE_ORDER[a.account.type] - TYPE_ORDER[b.account.type] || a.account.id - b.account.id)
  const cards = rows.flatMap((item) => item.card ? [item.card] : []).sort((a, b) => a.account.id - b.account.id)
  if (new Set(accounts.map((account) => account.id)).size !== accounts.length) throw contractError('accounts')
  return { accounts, liquid, cards }
}

export function fromWireCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) throw contractError('categories')
  const categories = value.map(parseCategory)
  if (new Set(categories.map((category) => category.id)).size !== categories.length) throw contractError('categories')
  return categories
}

export function fromWireSummary(value: unknown, expectedMonth: string): FinancialSummary {
  const row = record(value, 'summary')
  if (row.month !== expectedMonth) throw contractError('summary month')
  return {
    liquidBalance: toCentavos(row.liquid_balance, 'liquid balance'),
    outstandingDebt: toCentavos(row.outstanding_debt, 'outstanding debt'),
    cardCredit: toCentavos(row.card_credit, 'card credit'),
    netPosition: toCentavos(row.net_position, 'net position'),
    monthIncome: toCentavos(row.month_income, 'monthly income'),
    monthExpenses: toCentavos(row.month_expenses, 'monthly expenses'),
  }
}

export function fromWireTransaction(value: unknown, accounts: AccountInfo[], categories: Category[]): ActivityItem {
  const row = record(value, 'transaction')
  const accountId = id(row.account_id, 'transaction')
  const categoryId = id(row.category_id, 'transaction')
  const account = accounts.find((item) => item.id === accountId)
  const category = categories.find((item) => item.id === categoryId)
  if (!account || !category || (account.type === 'credit_card' && category.type !== 'expense')) throw contractError('transaction references')
  const amount = toCentavos(row.amount, 'transaction amount')
  if (amount <= 0) throw contractError('transaction amount')
  const date = calendarDate(row.transaction_date, 'transaction date')
  const note = nullableString(row.note, 'transaction note')
  if (note !== null && note.length > 120) throw contractError('transaction note')
  const timestamp = createdAt(row.created_at)
  const transactionId = id(row.id, 'transaction')
  return {
    key: `t-${transactionId}`,
    kind: category.type,
    id: transactionId,
    date,
    amount,
    title: note ?? category.name,
    categoryName: category.name,
    accountName: account.name,
    accountType: account.type,
    cardName: null,
    entry: { kind: category.type, amount: amountText(amount), accountId, cardId: null, categoryId, date, note: note ?? '' },
    createdAt: timestamp,
  }
}

export function fromWirePayment(value: unknown, accounts: AccountInfo[]): ActivityItem {
  const row = record(value, 'card payment')
  const sourceId = id(row.source_account_id, 'card payment')
  const cardId = id(row.card_account_id, 'card payment')
  const source = accounts.find((item) => item.id === sourceId)
  const card = accounts.find((item) => item.id === cardId)
  if (!source || !card || source.type === 'credit_card' || card.type !== 'credit_card' || sourceId === cardId) throw contractError('card payment references')
  const amount = toCentavos(row.amount, 'payment amount')
  if (amount <= 0) throw contractError('payment amount')
  const date = calendarDate(row.payment_date, 'payment date')
  const note = nullableString(row.note, 'payment note')
  if (note !== null && note.length > 120) throw contractError('payment note')
  const timestamp = createdAt(row.created_at)
  const paymentId = id(row.id, 'card payment')
  return {
    key: `p-${paymentId}`,
    kind: 'payment',
    id: paymentId,
    date,
    amount,
    title: note ?? 'Card payment',
    categoryName: null,
    accountName: source.name,
    accountType: source.type,
    cardName: card.name,
    entry: { kind: 'payment', amount: amountText(amount), accountId: sourceId, cardId, categoryId: null, date, note: note ?? '' },
    createdAt: timestamp,
  }
}

/** Convert validated form input to the transaction or payment request shape. */
export function toWireEntryInput(values: EntryValues): WireEntryInput | WirePaymentInput {
  const parsedAmount = parseAmount(values.amount)
  if (!parsedAmount.ok) throw new Error('The entry amount must be validated before it is sent.')
  const amount = amountText(parsedAmount.centavos)
  if (!isValidDate(values.date) || values.accountId === null) throw new Error('The entry must be validated before it is sent.')
  const note = values.note.trim() || null
  if (values.kind === 'payment') {
    if (values.cardId === null) throw new Error('The payment must be validated before it is sent.')
    return { source_account_id: values.accountId, card_account_id: values.cardId, amount, payment_date: values.date, note }
  }
  if (values.categoryId === null) throw new Error('The entry must be validated before it is sent.')
  return { account_id: values.accountId, category_id: values.categoryId, amount, transaction_date: values.date, note }
}

export function toWireAccountInput(values: AccountValues): WireAccountInput {
  const base = { name: values.name.trim(), type: values.type, opening_balance: '0.00', opening_debt: '0.00', credit_limit: null }
  if (values.type === 'credit_card') {
    return { ...base, opening_debt: accountMoney(values.owed, 'owed'), credit_limit: accountMoney(values.limit, 'limit') }
  }
  return { ...base, opening_balance: accountMoney(values.balance, 'balance') }
}

function accountMoney(value: string, field: 'balance' | 'limit' | 'owed'): WireMoney {
  const parsed = parseAccountMoney(value, field)
  if (!parsed.ok) throw new Error('The account amount must be validated before it is sent.')
  return amountText(parsed.centavos)
}

/** Backend fields differ from form fields; translate only known names, ignoring unknown fields safely. */
export function fromWireField(field: unknown): string | undefined {
  if (typeof field !== 'string') return undefined
  const fields: Record<string, string> = {
    account_id: 'account',
    source_account_id: 'account',
    card_account_id: 'card',
    category_id: 'category',
    transaction_date: 'date',
    payment_date: 'date',
    credit_limit: 'limit',
    opening_balance: 'balance',
    opening_debt: 'owed',
  }
  return fields[field] ?? (['amount', 'name', 'balance', 'limit', 'owed', 'account', 'card', 'category', 'date', 'note'].includes(field) ? field : undefined)
}
