/*
 * Types for the frontend mock (Milestone 4.2).
 *
 * Money is whole centavos (1/100 of a peso) so arithmetic is exact. The real API will send decimal
 * strings and the backend will calculate every authoritative total; these numbers exist only so the
 * screens can be built and checked before the API exists. Dates are local calendar strings, "YYYY-MM-DD".
 * Field names follow the four database tables in the TLD.
 */
export type Centavos = number

export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card'
export type CategoryType = 'income' | 'expense'

/** What every screen and form needs to know about an account. The API will not send opening values. */
export interface AccountInfo {
  id: number
  name: string
  type: AccountType
}

/** The mock's stored account: AccountInfo plus the opening values it calculates from. Only the mock source sees these. */
export interface Account extends AccountInfo {
  openingBalance: Centavos // cash, bank, e-wallet only (0 for cards)
  openingDebt: Centavos // credit cards only (0 otherwise)
  creditLimit: Centavos | null // credit cards only
}

export interface Category {
  id: number
  name: string
  type: CategoryType
}

/** Income or expense. Which one it is comes from the category, never from the sign of the amount. */
export interface Transaction {
  id: number
  accountId: number
  categoryId: number
  amount: Centavos // always positive
  date: string
  note: string | null
  createdAt: string // ISO timestamp; breaks ties between entries on the same date
}

/** Money moved from a cash/bank/e-wallet account to a credit card. It is not an expense. */
export interface CreditCardPayment {
  id: number
  sourceAccountId: number
  cardAccountId: number
  amount: Centavos // always positive
  date: string
  note: string | null
  createdAt: string
}

export interface FinancialSummary {
  liquidBalance: Centavos // cash + bank + e-wallet
  outstandingDebt: Centavos // sum of what cards owe (cards in credit count as 0 here)
  cardCredit: Centavos // sum of overpaid amounts
  netPosition: Centavos // liquid balance minus signed card debt
  monthIncome: Centavos
  monthExpenses: Centavos // card payments are never included
}

/** A cash, bank or e-wallet account with its current balance (negative when below zero). */
export type LiquidAccountType = Exclude<AccountType, 'credit_card'>

export interface AccountBalance {
  account: AccountInfo & { type: LiquidAccountType }
  balance: Centavos
}

/** Current state of one credit card. */
export interface CardStatus {
  account: AccountInfo
  signedDebt: Centavos // negative when the card has been overpaid
  owed: Centavos // max(signedDebt, 0)
  credit: Centavos // max(-signedDebt, 0)
  creditLimit: Centavos
  availableCredit: Centavos // limit - signedDebt. Not cash. Negative when over the limit.
}

export type ActivityKind = 'income' | 'expense' | 'payment'

/** One row of recent activity or the Activity list, with names already looked up for display. */
export interface ActivityItem {
  key: string // unique across both tables, e.g. "t-12" or "p-3"
  kind: ActivityKind
  id: number
  date: string
  amount: Centavos
  title: string // note, or the category name when there is no note
  categoryName: string | null // null for payments
  accountName: string // the account used, or the paying account
  accountType: AccountType
  cardName: string | null // payments only: the card that was paid
  entry: EntryValues // the stored entry in form shape, so Edit and Delete need no lookup
}

/** The kinds of entry the Quick Add form handles. */
export type EntryKind = 'expense' | 'income' | 'payment'

/** What a person types into the Quick Add form (amount is the text as typed). */
export interface EntryValues {
  kind: EntryKind
  amount: string
  accountId: number | null // expense: the account · income: deposit to · payment: pay from
  cardId: number | null // payment only
  categoryId: number | null // expense and income only
  date: string // "YYYY-MM-DD"
  note: string
}

/** One stored entry: a row of the transactions table or of the credit-card payments table. */
export interface EntryTarget {
  table: 'transaction' | 'payment'
  id: number
}

/** The figures the API computes for accounts: balances, signed debt, owed, credit, available credit. */
export interface AccountsSnapshot {
  accounts: AccountInfo[] // every account, in id order
  liquid: AccountBalance[] // cash, bank, e-wallet in display order
  cards: CardStatus[]
}

/** Everything a form or a message needs: the accounts' figures and the categories. */
export interface LedgerSnapshot extends AccountsSnapshot {
  categories: Category[]
}

/** One page of Activity: `hasMore` says whether a "Load more" is needed. */
export interface ActivityPage {
  items: ActivityItem[]
  hasMore: boolean
}

export interface MockData {
  today: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  payments: CreditCardPayment[]
}
