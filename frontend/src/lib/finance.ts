import type {
  Account,
  AccountBalance,
  ActivityItem,
  CardStatus,
  Centavos,
  Category,
  CategoryType,
  FinancialSummary,
  MockData,
} from '../types.ts'

/*
 * Accounting rules for the frontend MOCK (Milestone 4.2). FastAPI will be authoritative later; these
 * helpers exist so the screens can be built and tested with believable numbers first.
 *
 * Rules (TLD "Financial calculation definitions"):
 *  - Cash/bank/e-wallet balance = opening balance + income - expenses - card payments sent from it.
 *  - Card signed debt = opening debt + expenses charged to the card - card payments received.
 *    A purchase on a card is an EXPENSE and raises debt. A payment is NOT an expense.
 *  - Available credit = limit - signed debt. It is not cash and is never added to any total.
 *  - A card that has been overpaid has negative signed debt: that is card credit, not debt.
 *  - Net position = liquid balance - sum of SIGNED card debts, so an ordinary card payment leaves it unchanged
 *    (cash falls by the same amount as debt).
 *  - Monthly income/expenses use the transaction's category type and its date. Payments are excluded.
 * Everything is whole centavos, so the arithmetic is exact.
 */

export const isCard = (account: Account): boolean => account.type === 'credit_card'

/** "2026-10-24" -> "2026-10" */
export const monthOf = (date: string): string => date.slice(0, 7)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-10" -> "October 2026" */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${year}`
}

/** The current month and the 11 before it, newest first (future months are not offered). */
export function monthOptions(today: string, count = 12): { value: string; label: string }[] {
  let year = Number(today.slice(0, 4))
  let month = Number(today.slice(5, 7))
  const out: { value: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const value = `${year}-${String(month).padStart(2, '0')}`
    out.push({ value, label: monthLabel(value) })
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
  }
  return out
}

function typeOfCategory(categories: Category[], id: number): CategoryType | undefined {
  return categories.find((c) => c.id === id)?.type
}

const sum = (values: Centavos[]): Centavos => values.reduce((a, b) => a + b, 0)

/** Balance of a cash, bank or e-wallet account. Can be negative (it is shown, never clamped). */
export function liquidBalance(account: Account, data: MockData): Centavos {
  const income = data.transactions
    .filter((t) => t.accountId === account.id && typeOfCategory(data.categories, t.categoryId) === 'income')
    .map((t) => t.amount)
  const expenses = data.transactions
    .filter((t) => t.accountId === account.id && typeOfCategory(data.categories, t.categoryId) === 'expense')
    .map((t) => t.amount)
  const sent = data.payments.filter((p) => p.sourceAccountId === account.id).map((p) => p.amount)
  return account.openingBalance + sum(income) - sum(expenses) - sum(sent)
}

/** Debt on a credit card. Negative means the card was overpaid and holds credit. */
export function signedCardDebt(card: Account, data: MockData): Centavos {
  const charged = data.transactions
    .filter((t) => t.accountId === card.id && typeOfCategory(data.categories, t.categoryId) === 'expense')
    .map((t) => t.amount)
  const paid = data.payments.filter((p) => p.cardAccountId === card.id).map((p) => p.amount)
  return card.openingDebt + sum(charged) - sum(paid)
}

/** Room left on a card. NOT cash. Negative when the card is over its limit. */
export function availableCredit(creditLimit: Centavos, signedDebt: Centavos): Centavos {
  return creditLimit - signedDebt
}

export function cardStatus(card: Account, data: MockData): CardStatus {
  const signedDebt = signedCardDebt(card, data)
  const creditLimit = card.creditLimit ?? 0
  return {
    account: card,
    signedDebt,
    owed: Math.max(signedDebt, 0),
    credit: Math.max(-signedDebt, 0),
    creditLimit,
    availableCredit: availableCredit(creditLimit, signedDebt),
  }
}

const TYPE_ORDER: Record<Account['type'], number> = { cash: 0, bank: 1, ewallet: 2, credit_card: 3 }

/** Cash, bank and e-wallet accounts with their balances, in the order the Accounts screen shows them (Cash, Bank, E-wallet). */
export function liquidAccounts(data: MockData): AccountBalance[] {
  return data.accounts
    .filter((a): a is AccountBalance['account'] => !isCard(a))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id - b.id)
    .map((account) => ({ account, balance: liquidBalance(account, data) }))
}

export function cardStatuses(data: MockData): CardStatus[] {
  return data.accounts.filter(isCard).map((card) => cardStatus(card, data))
}

/** Totals for the position card and the "This month" card. `month` is "YYYY-MM". */
export function summarize(data: MockData, month: string): FinancialSummary {
  const liquid = sum(data.accounts.filter((a) => !isCard(a)).map((a) => liquidBalance(a, data)))
  const cards = cardStatuses(data)
  const inMonth = data.transactions.filter((t) => monthOf(t.date) === month)
  const total = (type: CategoryType): Centavos =>
    sum(inMonth.filter((t) => typeOfCategory(data.categories, t.categoryId) === type).map((t) => t.amount))
  return {
    liquidBalance: liquid,
    outstandingDebt: sum(cards.map((c) => c.owed)),
    cardCredit: sum(cards.map((c) => c.credit)),
    netPosition: liquid - sum(cards.map((c) => c.signedDebt)),
    monthIncome: total('income'),
    monthExpenses: total('expense'),
  }
}

/**
 * Income, expenses and card payments for one month as a single list, newest first.
 * Order: date, then creation time, then expenses/income before payments, then id (all descending),
 * so entries on the same day never swap places between renders.
 * `accountId` keeps entries that use that account (for a card payment, either side) and is applied
 * BEFORE the limit, as the API will do: filtering a capped list afterwards could drop matches.
 */
export function buildActivity(data: MockData, month: string, limit?: number, accountId?: number | null): ActivityItem[] {
  const account = (id: number) => data.accounts.find((a) => a.id === id)
  const items: (ActivityItem & { createdAt: string })[] = []

  for (const t of data.transactions) {
    if (monthOf(t.date) !== month) continue
    if (accountId != null && t.accountId !== accountId) continue
    const category = data.categories.find((c) => c.id === t.categoryId)
    const acct = account(t.accountId)
    if (!category || !acct) continue
    items.push({
      key: `t-${t.id}`,
      kind: category.type,
      id: t.id,
      date: t.date,
      amount: t.amount,
      title: t.note ?? category.name,
      categoryName: category.name,
      accountName: acct.name,
      accountType: acct.type,
      cardName: null,
      createdAt: t.createdAt,
    })
  }
  for (const p of data.payments) {
    if (monthOf(p.date) !== month) continue
    if (accountId != null && p.sourceAccountId !== accountId && p.cardAccountId !== accountId) continue
    const source = account(p.sourceAccountId)
    const card = account(p.cardAccountId)
    if (!source || !card) continue
    items.push({
      key: `p-${p.id}`,
      kind: 'payment',
      id: p.id,
      date: p.date,
      amount: p.amount,
      title: p.note ?? 'Card payment',
      categoryName: null,
      accountName: source.name,
      accountType: source.type,
      cardName: card.name,
      createdAt: p.createdAt,
    })
  }

  const rank = (i: ActivityItem) => (i.kind === 'payment' ? 0 : 1) // payments sort after entries on a tie
  items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      rank(b) - rank(a) ||
      b.id - a.id,
  )
  const list = items.map(({ createdAt: _createdAt, ...item }) => item)
  return limit === undefined ? list : list.slice(0, limit)
}

/**
 * One page of the Activity list. Asks for `limit + 1` entries and shows `limit`; the extra one only
 * says whether "Load more" is needed (the API contract B1-B2 in docs/design/DESIGN_REVIEW.md).
 */
export function activityPage(
  data: MockData,
  month: string,
  accountId: number | null,
  limit: number,
): { items: ActivityItem[]; hasMore: boolean } {
  const rows = buildActivity(data, month, limit + 1, accountId)
  return { items: rows.slice(0, limit), hasMore: rows.length > limit }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-24" -> "Sat, Oct 24". Calendar arithmetic only, so the result never depends on the time zone. */
export function dayHeading(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday}, ${MONTH_SHORT[m - 1]} ${d}`
}

/** "2026-10-24" -> "Oct 24, 2026" */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`
}

/** Groups an already-sorted list by date, keeping the order. */
export function groupByDate(items: ActivityItem[]): { date: string; items: ActivityItem[] }[] {
  const groups: { date: string; items: ActivityItem[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last?.date === item.date) last.items.push(item)
    else groups.push({ date: item.date, items: [item] })
  }
  return groups
}
