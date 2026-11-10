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

/** What screens need from the accounts list. Current amounts are read separately for the edit form. */
export interface AccountInfo {
  id: number
  name: string
  type: AccountType
  /**
   * The card chosen for the account (ADR-020), such as "bdo-visa-classic"; null for none. Absent when the
   * server predates ADR-020, in which case the choice lives in browser storage.
   */
  cardProductId?: string | null
}

/** The mock's stored account: AccountInfo plus the opening values it calculates from. Only the mock source sees these. */
export interface Account extends AccountInfo {
  openingBalance: Centavos // cash, bank, e-wallet only (0 for cards)
  openingDebt: Centavos // credit cards only (0 otherwise)
  creditLimit: Centavos | null // credit cards only
}

/** Kakeibo's four spending envelopes (ADR-021). They say why money was spent; the category says on what. */
export type KakeiboEnvelope = 'needs' | 'wants' | 'culture' | 'unexpected'

export interface Category {
  id: number
  name: string
  type: CategoryType
  /**
   * The envelope suggested for new expenses in this category (ADR-021), or null for no suggestion. A suggestion
   * only: it never changes saved expenses. Absent when the server predates Kakeibo.
   */
  defaultEnvelope?: KakeiboEnvelope | null
  /** Optional presentation metadata; unknown legacy values resolve to the default icon. */
  iconKey?: string | null
  /** Archived categories remain available for historical transaction labels. */
  archived?: boolean
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
  envelope?: KakeiboEnvelope | null // expenses only; null (or absent) is unclassified
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

/** Money moved between two cash, bank or e-wallet accounts. It is neither income nor expense. */
export interface AccountTransfer {
  id: number
  sourceAccountId: number
  destinationAccountId: number
  amount: Centavos
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

export type ActivityKind = 'income' | 'expense' | 'payment' | 'transfer'

/** One row of recent activity or the Activity list, with names already looked up for display. */
export interface ActivityItem {
  key: string // unique across both tables, e.g. "t-12" or "p-3"
  kind: ActivityKind
  id: number
  date: string
  amount: Centavos
  title: string // note, or the category name when there is no note
  categoryName: string | null // null for payments
  categoryIconKey?: string | null
  accountName: string // the account used, or the paying account
  accountType: AccountType
  cardName: string | null // payments only: the card that was paid
  destinationAccountName: string | null // transfers only
  createdAt: string // ISO timestamp; retained for a precise merge of transaction and payment rows
  entry: EntryValues // the stored entry in form shape, so Edit and Delete need no lookup
}

/** The kinds of entry the Quick Add form handles. */
export type EntryKind = 'expense' | 'income' | 'payment' | 'transfer'

/** What a person types into the Quick Add form (amount is the text as typed). */
export interface EntryValues {
  kind: EntryKind
  amount: string
  accountId: number | null // expense: the account · income: deposit to · payment: pay from
  cardId: number | null // payment only
  destinationAccountId: number | null // transfer only
  categoryId: number | null // expense and income only
  date: string // "YYYY-MM-DD"
  note: string
  /**
   * Expense only: the Kakeibo envelope, or null for "not classified". Undefined means the server predates
   * Kakeibo: the field is then left out of the request, so an older API never sees it.
   */
  envelope?: KakeiboEnvelope | null
}

/** One stored entry: a row of the transactions table or of the credit-card payments table. */
export interface EntryTarget {
  table: 'transaction' | 'payment' | 'transfer'
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

/** One month's Kakeibo plan as stored (ADR-021). Plans are planning figures, never account balances. */
export interface KakeiboPlan {
  month: string // "YYYY-MM"
  plannedIncome: Centavos
  allocatedStartingFunds: Centavos // money already held that the person chose to use this month
  savingsTarget: Centavos // a goal set aside first, not money already saved
  priorPeriodDebtReserve: Centavos // for paying off card debt from earlier months
  limits: Record<KakeiboEnvelope, Centavos>
  monthlyIntention: string | null
}

/** One envelope in the month's report. `limit` and `remaining` are null when the month has no plan. */
export interface KakeiboEnvelopeReport {
  limit: Centavos | null
  spent: Centavos
  remaining: Centavos | null // limit − spent, worked out by the server; negative when over the limit
}

export type KakeiboPlanStatus = 'saved' | 'not_saved' | 'legacy_unknown'

/**
 * The month's Kakeibo report, exactly as the server works it out (GET /api/kakeibo/months/{month}/report).
 * Actual figures come from the ledger; plan figures are null when the month has no plan. The screen shows
 * these numbers and never adds them up itself.
 */
export interface KakeiboMonth {
  month: string // "YYYY-MM"
  planStatus: KakeiboPlanStatus // old rows are unknown until the owner explicitly confirms them
  plan: KakeiboPlan | null
  actualIncome: Centavos
  availableToAllocate: Centavos | null // planned income + starting funds − savings target − debt reserve
  unallocated: Centavos | null // available to allocate − the four limits; negative when over-allocated
  envelopes: Record<KakeiboEnvelope, KakeiboEnvelopeReport>
  unclassifiedExpenses: Centavos // expenses with no envelope; still part of total expenses
  totalExpenses: Centavos // every expense of the month, classified or not; card payments and transfers excluded
  review: KakeiboReview | null // the month-end reflection, if one was saved
  /** The server compared today's ledger totals with the review's snapshot and found a difference. */
  actualsChangedSinceReview: boolean
}

/** Ledger totals the server stored when a monthly review was saved. Never worked out in the browser. */
export interface KakeiboSnapshot {
  actualIncome: Centavos
  totalExpenses: Centavos
  unclassified: Centavos
  envelopes: Record<KakeiboEnvelope, Centavos>
}

/** A saved month-end reflection (PUT /api/kakeibo/months/{month}/review). */
export interface KakeiboReview {
  savedDeclared: Centavos | null // self-reported: what the person says they saved; never checked against accounts
  available: string | null
  savings: string | null
  change: string | null
  appreciated: string | null
  surprise: string | null
  lesson: string | null
  reviewedAt: string // ISO timestamp of the last save
  snapshot: KakeiboSnapshot | null
}

/** What a person types into the monthly reflection form. */
export interface KakeiboReviewValues {
  savedDeclared: string // empty for "not saying"
  available: string
  savings: string
  change: string
  appreciated: string
  surprise: string
  lesson: string
}

/** One Monday-to-Sunday week (GET /api/kakeibo/weeks/{monday}). It may cross into another month or year. */
export interface KakeiboWeek {
  weekStart: string // "YYYY-MM-DD", always a Monday
  weekEnd: string // the Sunday, inclusive
  spending: Record<KakeiboEnvelope, Centavos>
  unclassifiedExpenses: Centavos
  totalExpenses: Centavos
  review: KakeiboWeekNotes & { updatedAt: string } | null
}

/** The three weekly notes. Saving always sends all three: the server replaces the whole set. */
export interface KakeiboWeekNotes {
  surprise: string
  worthwhile: string
  nextWeek: string
}

/** What a person types into the plan form (amounts are the text as typed). */
export interface KakeiboPlanValues {
  plannedIncome: string
  allocatedStartingFunds: string
  savingsTarget: string
  priorPeriodDebtReserve: string
  needsLimit: string
  wantsLimit: string
  cultureLimit: string
  unexpectedLimit: string
  monthlyIntention: string
}

export interface MockData {
  today: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  payments: CreditCardPayment[]
  transfers: AccountTransfer[]
  kakeiboPlans?: KakeiboPlan[] // the mock's stored plans, one per month
  kakeiboReviews?: (Omit<KakeiboReview, 'snapshot'> & { month: string; snapshot: KakeiboSnapshot })[] // month-end reflections
  kakeiboWeekReviews?: (KakeiboWeekNotes & { weekStart: string; updatedAt: string })[] // weekly notes, by Monday
}

/** Whether Add transaction can be used: not until the accounts have loaded, and not before the first account exists. */
export type AddState = 'ready' | 'loading' | 'no-accounts'
