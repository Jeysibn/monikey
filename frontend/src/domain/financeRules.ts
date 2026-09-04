// TR-002 / TR-003 / TR-004: the finance invariants, in ONE place.
//
// These validators are the authority on what a valid finance mutation is.
// The repository calls every one of them before it touches state, so an
// invariant holds even when a mutation arrives from a component that forgot
// to validate, from a test adapter, or from a future API client — a form's
// inline validation is only an earlier, friendlier surface for the same
// rule, never the rule itself. A rejected mutation throws before any state
// object is built, so the caller's state is returned completely unchanged.
//
// ---- The documented balance rules -------------------------------------
//
// 1. ASSET OVERDRAFT — not supported. No mutation may drive an asset
//    account (checking/savings/e-wallet/cash) below zero: not an expense,
//    not the debit side of a transfer, not a transfer fee, and not goal
//    funding. Monikey tracks money that exists; it has no overdraft product,
//    so a negative "available cash" would be a fiction, and Money Position
//    (which sums asset balances) would silently under-report.
//
// 2. CREDIT LIMIT — hard. A credit-card charge may not push the card's
//    amount owed above its own credit limit, and a card may not be created
//    already over its limit. `balance` on a `CreditCard` is amount OWED, so
//    `balance <= limit` at all times.
//
// 3. CREDIT-CARD PAYMENT — may not exceed the amount owed. Paying a card is
//    an asset → card transfer; paying more than is owed would leave a
//    negative "owed" (a credit balance on the card), which this app has no
//    representation for. Card → asset movement (a cash advance) is not a
//    supported transfer direction at all.
//
// 4. GOAL OVERFUNDING — not supported. `currentAmount` may never exceed
//    `targetAmount`; funding beyond the remaining amount is rejected, and
//    the seed data satisfies the same invariant as user-created goals.
//
// 5. Every stored date is a strict `YYYY-MM-DD`; every stored time is a
//    strict 24-hour `HH:mm` (see `utils/date.ts`).

import type {
  AddBudgetCategoryInput,
  AddManualAccountInput,
  AddManualCreditCardInput,
  AddTransactionInput,
  CreateGoalInput,
  FinanceState,
} from './finance'
import { isIsoDateBefore, isValidIsoDate, isValidTime24 } from '../utils/date'
import { formatMoney } from '../utils/currency'

/**
 * A rejected mutation. `code` is a stable identifier a caller can branch on
 * (or map to a field) without string-matching the message; `field` names the
 * input property at fault so a form can place the message on the control
 * that caused it (TR-009).
 */
export class FinanceValidationError extends Error {
  readonly code: string
  readonly field?: string

  constructor(code: string, message: string, field?: string) {
    super(message)
    this.name = 'FinanceValidationError'
    this.code = code
    this.field = field
  }
}

function reject(code: string, message: string, field?: string): never {
  throw new FinanceValidationError(code, message, field)
}

/** A finite, strictly positive money amount. */
function requirePositiveAmount(value: number, field: string, code: string, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    reject(code, `Enter a ${label} greater than zero.`, field)
  }
}

function requireNonNegativeAmount(value: number, field: string, code: string, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    reject(code, `Enter a ${label} of zero or more.`, field)
  }
}

// ---- Transactions -------------------------------------------------------

/**
 * Validates an `addTransaction` input against the current state. Throws a
 * `FinanceValidationError` on the first violated invariant; returns normally
 * only when the mutation is safe to apply.
 */
export function validateAddTransaction(state: FinanceState, input: AddTransactionInput): void {
  if (input.type !== 'income' && input.type !== 'expense' && input.type !== 'transfer') {
    reject('TX_TYPE_INVALID', 'Choose an income, expense, or transfer.', 'type')
  }
  if (!input.title || !input.title.trim()) {
    reject('TX_TITLE_REQUIRED', 'Description is required.', 'title')
  }
  requirePositiveAmount(input.amount, 'amount', 'TX_AMOUNT_INVALID', 'amount')
  if (input.fee !== undefined) {
    requireNonNegativeAmount(input.fee, 'fee', 'TX_FEE_INVALID', 'fee')
  }
  if (!isValidIsoDate(input.date)) {
    reject('TX_DATE_INVALID', 'Enter a real calendar date.', 'date')
  }
  if (input.time !== undefined && input.time !== '' && !isValidTime24(input.time)) {
    reject('TX_TIME_INVALID', 'Enter a time between 00:00 and 23:59.', 'time')
  }

  if (input.type === 'transfer') {
    validateTransfer(state, input)
    return
  }

  // Income / expense.
  if (input.categoryId === undefined || input.categoryId === '') {
    reject('TX_CATEGORY_REQUIRED', 'Category is required.', 'categoryId')
  }
  const category = state.categories.find((c) => c.id === input.categoryId)
  if (!category) {
    reject('TX_CATEGORY_UNKNOWN', 'Select a category from the list.', 'categoryId')
  }
  if (!category.transactionKinds.includes(input.type)) {
    reject('TX_CATEGORY_TYPE_MISMATCH', `${category.name} can’t be used for ${input.type === 'income' ? 'income' : 'an expense'}.`, 'categoryId')
  }
  if (!input.accountId) {
    reject('TX_ACCOUNT_REQUIRED', 'Account is required.', 'accountId')
  }

  const account = state.accounts.find((a) => a.id === input.accountId)
  const card = state.creditCards.find((c) => c.id === input.accountId)
  if (!account && !card) {
    reject('TX_ACCOUNT_UNKNOWN', 'Select an account from the list.', 'accountId')
  }
  if (input.type === 'income' && card) {
    // Income is money arriving; a credit card can't receive a deposit in
    // this model (paying a card down is a transfer, not income).
    reject('TX_INCOME_TO_CARD', 'Income has to be deposited into a cash account.', 'accountId')
  }
  if (input.type === 'expense') {
    if (account) {
      requireSufficientAssetBalance(account.balance, input.amount, account.name, 'accountId')
    } else if (card) {
      // Rule 2: a charge may not exceed the card's remaining credit.
      if (card.balance + input.amount > card.limit) {
        const available = Math.max(0, card.limit - card.balance)
        reject(
          'TX_CARD_LIMIT_EXCEEDED',
          `${card.name} only has ${formatMoney(available)} of credit left.`,
          'accountId',
        )
      }
    }
  }
}

function validateTransfer(state: FinanceState, input: AddTransactionInput): void {
  if (input.categoryId) {
    reject('TX_TRANSFER_HAS_CATEGORY', 'A transfer doesn’t take a category.', 'categoryId')
  }
  if (!input.fromAccountId) {
    reject('TX_TRANSFER_FROM_REQUIRED', 'From Account is required.', 'fromAccountId')
  }
  if (!input.toAccountId) {
    reject('TX_TRANSFER_TO_REQUIRED', 'To Account is required.', 'toAccountId')
  }
  if (input.fromAccountId === input.toAccountId) {
    reject('TX_TRANSFER_SAME_ACCOUNT', 'From Account and To Account can’t be the same.', 'toAccountId')
  }

  const from = state.accounts.find((a) => a.id === input.fromAccountId)
  if (!from) {
    // Rule 3: card → asset (a cash advance) is not a supported direction, so
    // the source must be a real, known asset account.
    if (state.creditCards.some((c) => c.id === input.fromAccountId)) {
      reject('TX_TRANSFER_FROM_CARD', 'Transferring out of a credit card (a cash advance) isn’t supported yet.', 'fromAccountId')
    }
    reject('TX_TRANSFER_FROM_UNKNOWN', 'Select an account to transfer from.', 'fromAccountId')
  }
  if (from.classification !== 'asset') {
    reject('TX_TRANSFER_FROM_NOT_ASSET', 'Transfers can only start from a cash account.', 'fromAccountId')
  }

  const toAccount = state.accounts.find((a) => a.id === input.toAccountId)
  const toCard = state.creditCards.find((c) => c.id === input.toAccountId)
  if (!toAccount && !toCard) {
    reject('TX_TRANSFER_TO_UNKNOWN', 'Select an account to transfer to.', 'toAccountId')
  }

  // Rule 1: the source pays both the amount and the fee.
  requireSufficientAssetBalance(from.balance, input.amount + (input.fee ?? 0), from.name, 'amount')

  if (toCard) {
    // Rule 3: a card payment may not exceed the amount owed.
    if (input.amount > toCard.balance) {
      reject(
        'TX_CARD_PAYMENT_EXCEEDS_OWED',
        `${toCard.name} only owes ${formatMoney(toCard.balance)} — enter that or less.`,
        'amount',
      )
    }
  }
}

function requireSufficientAssetBalance(balance: number, needed: number, accountName: string, field: string): void {
  if (needed > balance) {
    reject(
      'ASSET_INSUFFICIENT_BALANCE',
      `${accountName} only has ${formatMoney(balance)} available.`,
      field,
    )
  }
}

// ---- Accounts and cards -------------------------------------------------

export function validateAddManualAccount(input: AddManualAccountInput): void {
  if (!input.name || !input.name.trim()) {
    reject('ACCOUNT_NAME_REQUIRED', 'Account name is required.', 'name')
  }
  // Rule 1 applied at creation time too: an account can't start overdrawn.
  requireNonNegativeAmount(input.balance, 'balance', 'ACCOUNT_BALANCE_INVALID', 'starting balance')
  if (input.lastFour !== undefined && input.lastFour !== '' && !/^\d{4}$/.test(input.lastFour)) {
    reject('ACCOUNT_LAST_FOUR_INVALID', 'Enter the last 4 digits of the account.', 'lastFour')
  }
}

export function validateAddManualCreditCard(input: AddManualCreditCardInput, todayIso: string): void {
  if (!input.name || !input.name.trim()) {
    reject('CARD_NAME_REQUIRED', 'Card name is required.', 'name')
  }
  if (!/^\d{4}$/.test(input.lastFour)) {
    reject('CARD_LAST_FOUR_INVALID', 'Enter the last 4 digits of the card.', 'lastFour')
  }
  if (input.network !== 'visa' && input.network !== 'mastercard') {
    reject('CARD_NETWORK_INVALID', 'Choose Visa or Mastercard.', 'network')
  }
  requirePositiveAmount(input.limit, 'limit', 'CARD_LIMIT_INVALID', 'credit limit')
  requireNonNegativeAmount(input.balance, 'balance', 'CARD_BALANCE_INVALID', 'current balance')
  // Rule 2 applied at creation time.
  if (input.balance > input.limit) {
    reject(
      'CARD_BALANCE_OVER_LIMIT',
      `Current balance can’t exceed the ${formatMoney(input.limit)} credit limit.`,
      'balance',
    )
  }
  // TR-003: a card carries a real due date and minimum payment, so it can
  // participate in Money Position's upcoming commitments.
  if (!isValidIsoDate(input.dueDate)) {
    reject('CARD_DUE_DATE_INVALID', 'Enter a real payment due date.', 'dueDate')
  }
  // A due date already in the past is not merely odd — it falls outside the
  // commitment horizon forever, so the card would silently never contribute
  // to Money Position: exactly the failure TR-003 exists to remove. Reject it
  // rather than storing a card that can never be a commitment.
  if (isIsoDateBefore(input.dueDate, todayIso)) {
    reject('CARD_DUE_DATE_PAST', 'Payment due date can’t be in the past.', 'dueDate')
  }
  requireNonNegativeAmount(input.minPayment, 'minPayment', 'CARD_MIN_PAYMENT_INVALID', 'minimum payment')
  if (input.minPayment > input.limit) {
    reject('CARD_MIN_PAYMENT_OVER_LIMIT', 'Minimum payment can’t exceed the credit limit.', 'minPayment')
  }
}

// ---- Budget -------------------------------------------------------------

export function validateAddBudgetCategory(state: FinanceState, input: AddBudgetCategoryInput): void {
  if (!input.name || !input.name.trim()) {
    reject('BUDGET_NAME_REQUIRED', 'Category name is required.', 'name')
  }
  requirePositiveAmount(input.allocated, 'allocated', 'BUDGET_ALLOCATION_INVALID', 'budget amount')
  // `totalBudgetAllocated` is the fixed monthly envelope, not a running sum
  // that grows every time a category is created (SR-002): a new category can
  // only consume what is still unallocated.
  const unallocated = state.totalBudgetAllocated - state.budgetCategories.reduce((s, c) => s + c.allocated, 0)
  if (input.allocated > unallocated) {
    reject(
      'BUDGET_ALLOCATION_EXCEEDS_UNALLOCATED',
      `Allocation can’t exceed the ${formatMoney(unallocated)} unallocated.`,
      'allocated',
    )
  }
}

// ---- Goals --------------------------------------------------------------

export function validateCreateGoal(input: CreateGoalInput, todayIso: string): void {
  if (!input.name || !input.name.trim()) {
    reject('GOAL_NAME_REQUIRED', 'Goal name is required.', 'name')
  }
  requirePositiveAmount(input.targetAmount, 'targetAmount', 'GOAL_TARGET_INVALID', 'target amount')
  if (!isValidIsoDate(input.targetDate)) {
    reject('GOAL_TARGET_DATE_INVALID', 'Enter a real target date.', 'targetDate')
  }
  if (isIsoDateBefore(input.targetDate, todayIso)) {
    reject('GOAL_TARGET_DATE_PAST', 'Target date can’t be in the past.', 'targetDate')
  }
  if (input.monthlyContribution !== undefined) {
    requireNonNegativeAmount(input.monthlyContribution, 'monthlyContribution', 'GOAL_CONTRIBUTION_INVALID', 'planned monthly contribution')
  }
}

/**
 * The largest amount that may be moved into a goal from a given source
 * account right now: the smaller of what the account holds (rule 1) and what
 * the goal still needs (rule 4). Selectors and the Add Funds form both read
 * this rather than each deriving their own ceiling.
 */
export function maxFundableAmount(state: FinanceState, goalId: string, sourceAccountId: string): number {
  const goal = state.goals.find((g) => g.id === goalId)
  const account = state.accounts.find((a) => a.id === sourceAccountId && a.classification === 'asset')
  if (!goal || !account) return 0
  return Math.max(0, Math.min(account.balance, goal.targetAmount - goal.currentAmount))
}

export function validateAddGoalFunds(state: FinanceState, goalId: string, sourceAccountId: string, amount: number): void {
  const goal = state.goals.find((g) => g.id === goalId)
  if (!goal) {
    reject('GOAL_UNKNOWN', 'Goal not found.', 'goalId')
  }
  if (!goal.active) {
    reject('GOAL_INACTIVE', 'This goal is already complete and can’t receive more funds.', 'goalId')
  }
  requirePositiveAmount(amount, 'amount', 'GOAL_FUNDS_AMOUNT_INVALID', 'amount')

  const account = state.accounts.find((a) => a.id === sourceAccountId && a.classification === 'asset')
  if (!account) {
    reject('GOAL_SOURCE_UNKNOWN', 'Select an account to fund this goal from.', 'sourceAccountId')
  }
  // Rule 4 first: "that's all this goal needs" is the more useful message
  // when both ceilings would be crossed.
  const remaining = goal.targetAmount - goal.currentAmount
  if (amount > remaining) {
    reject(
      'GOAL_OVERFUNDING',
      `Enter at most ${formatMoney(remaining)} — that’s all this goal needs to reach its target.`,
      'amount',
    )
  }
  // Rule 1: funding may not overdraw the source account.
  requireSufficientAssetBalance(account.balance, amount, account.name, 'amount')
}
