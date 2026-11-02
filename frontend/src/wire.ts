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
  KakeiboEnvelope,
  KakeiboEnvelopeReport,
  KakeiboMonth,
  KakeiboPlan,
  KakeiboPlanValues,
  LiquidAccountType,
} from './types.ts'
import { ENVELOPES, PLAN_MONEY_FIELDS, parsePlanAmount } from './lib/kakeibo.ts'

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
  /** ADR-021. Absent from a server that predates Kakeibo. */
  default_kakeibo_envelope?: KakeiboEnvelope | null
}

export interface WireTransaction {
  id: number
  account_id: number
  category_id: number
  amount: WireMoney
  transaction_date: string
  note: string | null
  /** ADR-021. Absent from a server that predates Kakeibo. */
  kakeibo_envelope?: KakeiboEnvelope | null
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

export interface WireTransfer {
  id: number
  source_account_id: number
  destination_account_id: number
  amount: WireMoney
  transfer_date: string
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
  /** ADR-021, expenses only. Left out for income and for a server that predates Kakeibo; null is "not classified". */
  kakeibo_envelope?: KakeiboEnvelope | null
}

export interface WireKakeiboPlanInput {
  planned_income: WireMoney
  allocated_starting_funds: WireMoney
  savings_target: WireMoney
  prior_period_debt_reserve: WireMoney
  needs_limit: WireMoney
  wants_limit: WireMoney
  culture_limit: WireMoney
  unexpected_limit: WireMoney
  monthly_intention: string | null
}

export interface WirePaymentInput {
  source_account_id: number
  card_account_id: number
  amount: WireMoney
  payment_date: string
  note: string | null
}

export interface WireTransferInput {
  source_account_id: number
  destination_account_id: number
  amount: WireMoney
  transfer_date: string
  note: string | null
}

export interface WireAccountInput {
  name: string
  type: WireAccountType
  opening_balance: WireMoney
  opening_debt: WireMoney
  credit_limit: WireMoney | null
  /** ADR-020. Sent only to a server that returns the field; an older API refuses unknown fields. */
  card_product_id?: string | null
}

export interface WireAccountUpdateInput {
  name: string
  type: WireAccountType
  current_balance: WireMoney
  current_debt: WireMoney
  credit_limit: WireMoney | null
  /** ADR-020. Omitted keeps the stored card; null clears it. */
  card_product_id?: string | null
}

export interface WireEditableAccount extends WireAccountUpdateInput {
  id: number
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

const isEnvelope = (value: unknown): value is KakeiboEnvelope => typeof value === 'string' && (ENVELOPES as readonly string[]).includes(value)

/** A nullable envelope field: undefined when an older server leaves it out. */
function envelopeField(row: Record<string, unknown>, field: string, what: string): KakeiboEnvelope | null | undefined {
  if (!(field in row)) return undefined
  const value = row[field]
  if (value === null) return null
  if (isEnvelope(value)) return value
  throw contractError(what)
}

function parseCategory(value: unknown): Category {
  const row = record(value, 'category')
  const type = row.type
  if (type !== 'income' && type !== 'expense') throw contractError('category')
  const name = string(row.name, 'category')
  if (!name.trim()) throw contractError('category')
  const defaultEnvelope = envelopeField(row, 'default_kakeibo_envelope', 'category envelope')
  if (type === 'income' && defaultEnvelope) throw contractError('category envelope') // only expense categories may suggest one
  return { id: id(row.id, 'category'), name, type, ...(defaultEnvelope === undefined ? {} : { defaultEnvelope }) }
}

const CARD_PRODUCT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** ADR-020: undefined when an older server leaves the field out, null for no card, otherwise a card ID. */
function cardProductId(row: Record<string, unknown>): { cardProductId?: string | null } {
  if (!('card_product_id' in row)) return {}
  const value = row.card_product_id
  if (value === null) return { cardProductId: null }
  if (typeof value === 'string' && value.length <= 64 && CARD_PRODUCT_ID.test(value)) return { cardProductId: value }
  throw contractError('card choice')
}

/** Validate and convert a JSON account row into the view model used by the screens. */
export function fromWireAccount(value: unknown): { account: AccountInfo; liquid?: AccountsSnapshot['liquid'][number]; card?: CardStatus } {
  const row = record(value, 'account')
  const accountId = id(row.id, 'account')
  const name = string(row.name, 'account')
  if (!name.trim()) throw contractError('account')
  const type = row.type
  if (type === 'cash' || type === 'bank' || type === 'ewallet') {
    const account: AccountInfo & { type: LiquidAccountType } = { id: accountId, name, type, ...cardProductId(row) }
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
  const account: AccountInfo = { id: accountId, name, type, ...cardProductId(row) }
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

/** Read server-calculated current amounts for the edit form. */
export function fromWireEditableAccount(value: unknown, expectedId: number): AccountValues {
  const row = record(value, 'editable account')
  if (id(row.id, 'editable account') !== expectedId) throw contractError('editable account')
  const name = string(row.name, 'editable account name')
  if (!name.trim()) throw contractError('editable account name')
  const type = row.type
  if (type !== 'cash' && type !== 'bank' && type !== 'ewallet' && type !== 'credit_card') throw contractError('editable account type')
  const currentBalance = toCentavos(row.current_balance, 'current balance')
  const currentDebt = toCentavos(row.current_debt, 'current debt')
  const creditLimit = row.credit_limit === null ? null : toCentavos(row.credit_limit, 'credit limit')
  if (type === 'credit_card') {
    if (currentBalance !== 0 || creditLimit === null || creditLimit <= 0) throw contractError('editable credit card')
  } else if (currentDebt !== 0 || creditLimit !== null) {
    throw contractError('editable liquid account')
  }
  return {
    type,
    name,
    balance: amountText(currentBalance),
    limit: creditLimit === null ? '' : amountText(creditLimit),
    owed: amountText(currentDebt),
  }
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
  const envelope = envelopeField(row, 'kakeibo_envelope', 'transaction envelope')
  if (category.type === 'income' && envelope) throw contractError('transaction envelope') // income is never classified
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
    destinationAccountName: null,
    entry: {
      kind: category.type, amount: amountText(amount), accountId, cardId: null, destinationAccountId: null, categoryId, date, note: note ?? '',
      ...(envelope === undefined ? {} : { envelope }),
    },
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
    destinationAccountName: null,
    entry: { kind: 'payment', amount: amountText(amount), accountId: sourceId, cardId, destinationAccountId: null, categoryId: null, date, note: note ?? '' },
    createdAt: timestamp,
  }
}

export function fromWireTransfer(value: unknown, accounts: AccountInfo[]): ActivityItem {
  const row = record(value, 'account transfer')
  const sourceId = id(row.source_account_id, 'account transfer')
  const destinationId = id(row.destination_account_id, 'account transfer')
  const source = accounts.find((item) => item.id === sourceId)
  const destination = accounts.find((item) => item.id === destinationId)
  if (!source || !destination || source.type === 'credit_card' || destination.type === 'credit_card' || sourceId === destinationId) throw contractError('account transfer references')
  const amount = toCentavos(row.amount, 'transfer amount')
  if (amount <= 0) throw contractError('transfer amount')
  const date = calendarDate(row.transfer_date, 'transfer date')
  const note = nullableString(row.note, 'transfer note')
  if (note !== null && note.length > 120) throw contractError('transfer note')
  const timestamp = createdAt(row.created_at)
  const transferId = id(row.id, 'account transfer')
  return {
    key: `x-${transferId}`,
    kind: 'transfer',
    id: transferId,
    date,
    amount,
    title: note ?? 'Account transfer',
    categoryName: null,
    accountName: source.name,
    accountType: source.type,
    cardName: null,
    destinationAccountName: destination.name,
    entry: { kind: 'transfer', amount: amountText(amount), accountId: sourceId, cardId: null, destinationAccountId: destinationId, categoryId: null, date, note: note ?? '' },
    createdAt: timestamp,
  }
}

/** Convert validated form input to the transaction or payment request shape. */
export function toWireEntryInput(values: EntryValues): WireEntryInput | WirePaymentInput | WireTransferInput {
  const parsedAmount = parseAmount(values.amount)
  if (!parsedAmount.ok) throw new Error('The entry amount must be validated before it is sent.')
  const amount = amountText(parsedAmount.centavos)
  if (!isValidDate(values.date) || values.accountId === null) throw new Error('The entry must be validated before it is sent.')
  const note = values.note.trim() || null
  if (values.kind === 'payment') {
    if (values.cardId === null) throw new Error('The payment must be validated before it is sent.')
    return { source_account_id: values.accountId, card_account_id: values.cardId, amount, payment_date: values.date, note }
  }
  if (values.kind === 'transfer') {
    if (values.destinationAccountId === null || values.destinationAccountId === values.accountId) throw new Error('The transfer must be validated before it is sent.')
    return { source_account_id: values.accountId, destination_account_id: values.destinationAccountId, amount, transfer_date: values.date, note }
  }
  if (values.categoryId === null) throw new Error('The entry must be validated before it is sent.')
  const base: WireEntryInput = { account_id: values.accountId, category_id: values.categoryId, amount, transaction_date: values.date, note }
  // Only an expense carries an envelope. Leaving the field out of an update keeps the stored one (ADR-021).
  return values.kind === 'expense' && values.envelope !== undefined ? { ...base, kakeibo_envelope: values.envelope } : base
}

/* ---------- Kakeibo (ADR-021) ---------- */

function nullableMoney(value: unknown, what: string): Centavos | null {
  return value === null ? null : toCentavos(value, what)
}

/** The stored plan inside a month response; `month` is "YYYY-MM" and the server's plan month is its first day. */
export function fromWireKakeiboPlan(value: unknown, month: string): KakeiboPlan | null {
  if (value === null) return null
  const row = record(value, 'Kakeibo plan')
  if (row.month !== `${month}-01`) throw contractError('Kakeibo plan month')
  const money = (field: string) => {
    const centavos = toCentavos(row[field], 'Kakeibo plan amount')
    if (centavos < 0) throw contractError('Kakeibo plan amount')
    return centavos
  }
  const intention = row.monthly_intention === undefined ? null : nullableString(row.monthly_intention, 'monthly intention')
  return {
    month,
    plannedIncome: money('planned_income'),
    allocatedStartingFunds: money('allocated_starting_funds'),
    savingsTarget: money('savings_target'),
    priorPeriodDebtReserve: money('prior_period_debt_reserve'),
    limits: { needs: money('needs_limit'), wants: money('wants_limit'), culture: money('culture_limit'), unexpected: money('unexpected_limit') },
    monthlyIntention: intention,
  }
}

function envelopeReport(value: unknown, planned: boolean): KakeiboEnvelopeReport {
  const row = record(value, 'Kakeibo envelope')
  const spent = toCentavos(row.actual_spent, 'envelope spending')
  const limit = nullableMoney(row.limit, 'envelope limit')
  const remaining = nullableMoney(row.remaining, 'envelope remaining')
  // A planned month has a limit and a remainder for every envelope; a month with no plan has neither.
  if (spent < 0 || (planned ? limit === null || remaining === null || limit < 0 || remaining !== limit - spent : limit !== null || remaining !== null)) {
    throw contractError('Kakeibo envelope figures')
  }
  return { limit, spent, remaining }
}

/** GET (or PUT) /api/kakeibo/months/{month}[/report]: the plan and the month's ledger actuals, as the server worked them out. */
export function fromWireKakeiboMonth(value: unknown, expectedMonth: string): KakeiboMonth {
  const row = record(value, 'Kakeibo month')
  if (row.month !== expectedMonth) throw contractError('Kakeibo month')
  const plan = fromWireKakeiboPlan(row.plan ?? null, expectedMonth)
  const wireEnvelopes = record(row.envelopes, 'Kakeibo envelopes')
  const envelopes = Object.fromEntries(ENVELOPES.map((envelope) => [envelope, envelopeReport(wireEnvelopes[envelope], plan !== null)])) as Record<KakeiboEnvelope, KakeiboEnvelopeReport>
  const availableToAllocate = nullableMoney(row.available_to_allocate, 'available to allocate')
  const unallocated = nullableMoney(row.unallocated, 'unallocated amount')
  if ((plan === null) !== (availableToAllocate === null) || (plan === null) !== (unallocated === null)) throw contractError('Kakeibo plan figures')
  const actualIncome = toCentavos(row.actual_income, 'actual income')
  const unclassifiedExpenses = toCentavos(row.unclassified_expenses, 'unclassified expenses')
  const totalExpenses = toCentavos(row.total_expenses, 'total expenses')
  if (actualIncome < 0 || unclassifiedExpenses < 0 || totalExpenses < unclassifiedExpenses) throw contractError('Kakeibo actuals')
  return { month: expectedMonth, plan, actualIncome, availableToAllocate, unallocated, envelopes, unclassifiedExpenses, totalExpenses }
}

/** Validated plan form values as the PUT body. Every amount is sent, including zeros. */
export function toWireKakeiboPlan(values: KakeiboPlanValues): WireKakeiboPlanInput {
  const money = (field: (typeof PLAN_MONEY_FIELDS)[number]): WireMoney => {
    const parsed = parsePlanAmount(values[field])
    if (!parsed.ok) throw new Error('The plan must be validated before it is sent.')
    return amountText(parsed.centavos)
  }
  return {
    planned_income: money('plannedIncome'),
    allocated_starting_funds: money('allocatedStartingFunds'),
    savings_target: money('savingsTarget'),
    prior_period_debt_reserve: money('priorPeriodDebtReserve'),
    needs_limit: money('needsLimit'),
    wants_limit: money('wantsLimit'),
    culture_limit: money('cultureLimit'),
    unexpected_limit: money('unexpectedLimit'),
    monthly_intention: values.monthlyIntention.trim() || null,
  }
}

/** `card` is included only when given: undefined leaves the field out (for a server that predates ADR-020). */
export function toWireAccountInput(values: AccountValues, card?: string | null): WireAccountInput {
  const base = { name: values.name.trim(), type: values.type, opening_balance: '0.00', opening_debt: '0.00', credit_limit: null, ...(card === undefined ? {} : { card_product_id: card }) }
  if (values.type === 'credit_card') {
    return { ...base, opening_debt: accountMoney(values.owed, 'owed'), credit_limit: accountMoney(values.limit, 'limit') }
  }
  return { ...base, opening_balance: accountMoney(values.balance, 'balance') }
}

/** `card` undefined leaves the field out, which keeps the stored card. */
export function toWireAccountUpdate(values: AccountValues, card?: string | null): WireAccountUpdateInput {
  return {
    ...(card === undefined ? {} : { card_product_id: card }),
    name: values.name.trim(), type: values.type,
    current_balance: values.type === 'credit_card' ? '0.00' : accountMoney(values.balance, 'balance', true),
    current_debt: values.type === 'credit_card' ? accountMoney(values.owed, 'owed', true) : '0.00',
    credit_limit: values.type === 'credit_card' ? accountMoney(values.limit, 'limit') : null,
  }
}

function accountMoney(value: string, field: 'balance' | 'limit' | 'owed', current = false): WireMoney {
  const parsed = parseAccountMoney(value, field, current)
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
    destination_account_id: 'destination',
    category_id: 'category',
    transaction_date: 'date',
    payment_date: 'date',
    transfer_date: 'date',
    credit_limit: 'limit',
    current_balance: 'balance',
    current_debt: 'owed',
    opening_balance: 'balance',
    opening_debt: 'owed',
    kakeibo_envelope: 'envelope',
    // Kakeibo plan fields (the plan form uses the same names in camelCase)
    planned_income: 'plannedIncome',
    allocated_starting_funds: 'allocatedStartingFunds',
    savings_target: 'savingsTarget',
    prior_period_debt_reserve: 'priorPeriodDebtReserve',
    needs_limit: 'needsLimit',
    wants_limit: 'wantsLimit',
    culture_limit: 'cultureLimit',
    unexpected_limit: 'unexpectedLimit',
    monthly_intention: 'monthlyIntention',
  }
  return fields[field] ?? (['amount', 'name', 'balance', 'limit', 'owed', 'account', 'card', 'destination', 'category', 'date', 'note'].includes(field) ? field : undefined)
}
