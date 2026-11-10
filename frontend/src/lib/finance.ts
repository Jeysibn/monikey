import type {
  Account,
  AccountBalance,
  AccountInfo,
  ActivityItem,
  AnalyticsReport,
  CardStatus,
  Centavos,
  Category,
  CategoryType,
  FinancialSummary,
  KakeiboEnvelope,
  KakeiboMonth,
  KakeiboSnapshot,
  KakeiboWeek,
  LedgerSnapshot,
  MockData,
} from '../types.ts'
import { amountText } from './money.ts'
import { compareTimestamps } from './timestamp.ts'

/*
 * Accounting rules for the frontend MOCK (Milestone 4.2). FastAPI will be authoritative later; these
 * helpers exist so the screens can be built and tested with believable numbers first.
 *
 * Rules (TLD "Financial calculation definitions"):
 *  - Cash/bank/e-wallet balance = opening balance + income - expenses - card payments sent - transfers out + transfers in.
 *  - Card signed debt = opening debt + expenses charged to the card - card payments received.
 *    A purchase on a card is an EXPENSE and raises debt. A payment is NOT an expense.
 *  - Available credit = limit - signed debt. It is not cash and is never added to any total.
 *  - A card that has been overpaid has negative signed debt: that is card credit, not debt.
 *  - Net position = liquid balance - sum of SIGNED card debts, so an ordinary card payment leaves it unchanged
 *    (cash falls by the same amount as debt).
 *  - Monthly income/expenses use the transaction's category type and its date. Payments are excluded.
 * Everything is whole centavos, so the arithmetic is exact.
 */

export const isCard = (account: Pick<AccountInfo, 'type'>): boolean => account.type === 'credit_card'

/** "2026-10-24" -> "2026-10" */
export const monthOf = (date: string): string => date.slice(0, 7)

/** Mock-only analytics over synthetic fixture rows. Production analytics are aggregated by PostgreSQL. */
export function mockAnalytics(data: MockData, query: { startDate: string; endDate: string; accountId: number | null }): AnalyticsReport {
  if (query.endDate < query.startDate) throw new Error('End date must be on or after start date.')
  const rows = data.transactions.filter((row) => row.date >= query.startDate && row.date <= query.endDate && (query.accountId === null || row.accountId === query.accountId))
  const types = new Map(data.categories.map((category) => [category.id, category.type]))
  const totals = (start: string, end: string) => {
    let income = 0
    let expenses = 0
    for (const row of data.transactions) {
      if (row.date < start || row.date >= end || (query.accountId !== null && row.accountId !== query.accountId)) continue
      if (types.get(row.categoryId) === 'income') income += row.amount
      else expenses += row.amount
    }
    return { income, expenses, netCashFlow: income - expenses }
  }
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`)
  const endExclusive = new Date(day(query.endDate) + 86_400_000).toISOString().slice(0, 10)
  const previousStart = new Date(day(query.startDate) - (day(endExclusive) - day(query.startDate))).toISOString().slice(0, 10)
  const previousTotals = query.endDate < data.today ? totals(previousStart, query.startDate) : null
  const monthKeys: string[] = []
  let month = monthOf(query.startDate)
  const finalMonth = monthOf(query.endDate)
  while (month <= finalMonth) {
    monthKeys.push(month)
    const [year, number] = month.split('-').map(Number)
    const next = number === 12 ? [year + 1, 1] : [year, number + 1]
    month = `${next[0]}-${String(next[1]).padStart(2, '0')}`
  }
  const categories = new Map<number, number>()
  for (const row of rows) if (types.get(row.categoryId) === 'expense') categories.set(row.categoryId, (categories.get(row.categoryId) ?? 0) + row.amount)
  const envelopeTotals = Object.fromEntries(['needs', 'wants', 'culture', 'unexpected'].map((envelope) => [envelope, rows.filter((row) => row.envelope === envelope && types.get(row.categoryId) === 'expense').reduce((sum, row) => sum + row.amount, 0)])) as Record<KakeiboEnvelope, number>
  const unclassified = rows.filter((row) => row.envelope == null && types.get(row.categoryId) === 'expense').reduce((sum, row) => sum + row.amount, 0)
  const plans = new Map((data.kakeiboPlans ?? []).map((plan) => [plan.month, plan]))
  const envelopes = ['needs', 'wants', 'culture', 'unexpected'] as const
  return {
    startDate: query.startDate,
    endDate: query.endDate,
    accountId: query.accountId,
    totals: totals(query.startDate, endExclusive),
    previousTotals,
    months: monthKeys.map((key) => {
      const end = new Date(Date.parse(`${key}-01T00:00:00Z`))
      end.setUTCMonth(end.getUTCMonth() + 1)
      const monthStart = `${key}-01`
      return { month: key, ...totals(query.startDate > monthStart ? query.startDate : monthStart, query.endDate < end.toISOString().slice(0, 10) ? endExclusive : end.toISOString().slice(0, 10)) }
    }),
    categories: [...categories].map(([id, expenses]) => {
      const category = data.categories.find((item) => item.id === id)!
      return { id, name: category.name, iconKey: category.iconKey ?? null, archived: category.archived ?? false, expenses }
    }).sort((a, b) => b.expenses - a.expenses || a.name.localeCompare(b.name)),
    kakeiboTotals: { ...envelopeTotals, unclassified },
    kakeibo: monthKeys.map((key) => {
      const plan = plans.get(key)
      const actuals = Object.fromEntries(envelopes.map((envelope) => [envelope, rows.filter((row) => monthOf(row.date) === key && row.envelope === envelope && types.get(row.categoryId) === 'expense').reduce((sum, row) => sum + row.amount, 0)])) as Record<typeof envelopes[number], number>
      const unclassified = rows.filter((row) => monthOf(row.date) === key && row.envelope == null && types.get(row.categoryId) === 'expense').reduce((sum, row) => sum + row.amount, 0)
      return { month: key, planStatus: plan ? 'saved' as const : 'not_saved' as const, limits: plan ? plan.limits : null, actuals, unclassified }
    }),
  }
}

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
  const transferredOut = data.transfers.filter((t) => t.sourceAccountId === account.id).map((t) => t.amount)
  const transferredIn = data.transfers.filter((t) => t.destinationAccountId === account.id).map((t) => t.amount)
  return account.openingBalance + sum(income) - sum(expenses) - sum(sent) - sum(transferredOut) + sum(transferredIn)
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
    account: { id: card.id, name: card.name, type: card.type, cardProductId: card.cardProductId ?? null }, // no opening values: the API will not send them
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
    .filter((a) => !isCard(a))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id - b.id)
    .map((a) => ({
      account: { id: a.id, name: a.name, type: a.type as AccountBalance['account']['type'], cardProductId: a.cardProductId ?? null },
      balance: liquidBalance(a, data),
    }))
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
 * Kakeibo actuals between two dates (`from` inclusive, `until` exclusive), as the server's kakeibo_actuals works
 * them out: only expense transactions count, so a card purchase counts once and card payments and transfers
 * never do; an expense with no envelope is "unclassified" and still part of total expenses.
 */
function kakeiboActuals(data: MockData, from: string, until: string): KakeiboSnapshot {
  const inRange = data.transactions.filter((t) => t.date >= from && t.date < until)
  const ofType = (type: CategoryType) => inRange.filter((t) => typeOfCategory(data.categories, t.categoryId) === type)
  const expenses = ofType('expense')
  const spentOn = (envelope: KakeiboEnvelope | null) => sum(expenses.filter((t) => (t.envelope ?? null) === envelope).map((t) => t.amount))
  return {
    actualIncome: sum(ofType('income').map((t) => t.amount)),
    totalExpenses: sum(expenses.map((t) => t.amount)),
    unclassified: spentOn(null),
    envelopes: { needs: spentOn('needs'), wants: spentOn('wants'), culture: spentOn('culture'), unexpected: spentOn('unexpected') },
  }
}

const nextMonthStart = (month: string): string => {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** The month's actuals in the shape a review snapshot stores. */
export const kakeiboMonthSnapshot = (data: MockData, month: string): KakeiboSnapshot => kakeiboActuals(data, `${month}-01`, nextMonthStart(month))

const sameSnapshot = (a: KakeiboSnapshot, b: KakeiboSnapshot): boolean =>
  a.actualIncome === b.actualIncome && a.totalExpenses === b.totalExpenses && a.unclassified === b.unclassified &&
  (['needs', 'wants', 'culture', 'unexpected'] as const).every((e) => a.envelopes[e] === b.envelopes[e])

/**
 * The month's Kakeibo report (ADR-021), the mock's stand-in for GET /api/kakeibo/months/{month}/report.
 * remaining = limit − spent and may be negative; with no plan, limits and remainders are null. A saved review
 * keeps the snapshot taken when it was saved; `actualsChangedSinceReview` says whether today's totals differ.
 */
export function kakeiboMonth(data: MockData, month: string): KakeiboMonth {
  const actuals = kakeiboMonthSnapshot(data, month)
  const plan = data.kakeiboPlans?.find((p) => p.month === month) ?? null
  const envelopes = Object.fromEntries(
    (['needs', 'wants', 'culture', 'unexpected'] as const).map((envelope) => {
      const spent = actuals.envelopes[envelope]
      const limit = plan ? plan.limits[envelope] : null
      return [envelope, { limit, spent, remaining: limit === null ? null : limit - spent }]
    }),
  ) as KakeiboMonth['envelopes']
  const available = plan ? plan.plannedIncome + plan.allocatedStartingFunds - plan.savingsTarget - plan.priorPeriodDebtReserve : null
  const limits = plan ? sum(Object.values(plan.limits)) : 0
  const stored = data.kakeiboReviews?.find((r) => r.month === month) ?? null
  const review = stored ? (({ month: _month, ...rest }) => rest)(stored) : null
  return {
    month,
    planStatus: plan ? 'saved' : 'not_saved',
    plan,
    actualIncome: actuals.actualIncome,
    availableToAllocate: available,
    unallocated: available === null ? null : available - limits,
    envelopes,
    unclassifiedExpenses: actuals.unclassified,
    totalExpenses: actuals.totalExpenses,
    review,
    actualsChangedSinceReview: stored !== null && !sameSnapshot(stored.snapshot, actuals),
  }
}

/** One Monday-to-Sunday week, the mock's stand-in for GET /api/kakeibo/weeks/{monday}. It ignores month edges. */
export function kakeiboWeek(data: MockData, weekStart: string): KakeiboWeek {
  const until = new Date(`${weekStart}T00:00:00Z`)
  until.setUTCDate(until.getUTCDate() + 7)
  const untilDate = until.toISOString().slice(0, 10)
  const end = new Date(until)
  end.setUTCDate(end.getUTCDate() - 1)
  const actuals = kakeiboActuals(data, weekStart, untilDate)
  const stored = data.kakeiboWeekReviews?.find((r) => r.weekStart === weekStart)
  return {
    weekStart,
    weekEnd: end.toISOString().slice(0, 10),
    spending: actuals.envelopes,
    unclassifiedExpenses: actuals.unclassified,
    totalExpenses: actuals.totalExpenses,
    review: stored ? { surprise: stored.surprise, worthwhile: stored.worthwhile, nextWeek: stored.nextWeek, updatedAt: stored.updatedAt } : null,
  }
}

/**
 * Income, expenses, card payments and account transfers for one month as a single list, newest first.
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
      categoryIconKey: category.iconKey ?? null,
      accountName: acct.name,
      accountType: acct.type,
      cardName: null,
      destinationAccountName: null,
      createdAt: t.createdAt,
      entry: {
        kind: category.type,
        amount: amountText(t.amount),
        accountId: t.accountId,
        cardId: null,
        destinationAccountId: null,
        categoryId: t.categoryId,
        date: t.date,
        note: t.note ?? '',
        envelope: t.envelope ?? null,
      },
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
      destinationAccountName: null,
      createdAt: p.createdAt,
      entry: {
        kind: 'payment',
        amount: amountText(p.amount),
        accountId: p.sourceAccountId,
        cardId: p.cardAccountId,
        destinationAccountId: null,
        categoryId: null,
        date: p.date,
        note: p.note ?? '',
      },
    })
  }

  for (const transfer of data.transfers) {
    if (monthOf(transfer.date) !== month) continue
    if (accountId != null && transfer.sourceAccountId !== accountId && transfer.destinationAccountId !== accountId) continue
    const source = account(transfer.sourceAccountId)
    const destination = account(transfer.destinationAccountId)
    if (!source || !destination) continue
    items.push({
      key: `x-${transfer.id}`,
      kind: 'transfer',
      id: transfer.id,
      date: transfer.date,
      amount: transfer.amount,
      title: transfer.note ?? 'Account transfer',
      categoryName: null,
      accountName: source.name,
      accountType: source.type,
      cardName: null,
      destinationAccountName: destination.name,
      createdAt: transfer.createdAt,
      entry: {
        kind: 'transfer', amount: amountText(transfer.amount), accountId: transfer.sourceAccountId,
        cardId: null, destinationAccountId: transfer.destinationAccountId, categoryId: null,
        date: transfer.date, note: transfer.note ?? '',
      },
    })
  }

  const rank = (i: ActivityItem) => (i.kind === 'payment' || i.kind === 'transfer' ? 0 : 1) // non-expense movements sort after entries on a tie
  items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      compareTimestamps(b.createdAt, a.createdAt) || // full precision: microseconds and any offset, no rounding to milliseconds
      rank(b) - rank(a) ||
      b.id - a.id,
  )
  return limit === undefined ? items : items.slice(0, limit)
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

/**
 * Everything the screens and forms read about accounts, in the shape the API will answer:
 * balances, signed debt, owed, credit and available credit are already worked out. This is the mock's side
 * of the seam (the real client gets the same shape from GET /api/accounts and /api/categories).
 */
export function buildSnapshot(data: MockData): LedgerSnapshot {
  return {
    accounts: data.accounts.map(({ id, name, type, cardProductId }) => ({ id, name, type, cardProductId: cardProductId ?? null })),
    liquid: liquidAccounts(data),
    cards: cardStatuses(data),
    categories: data.categories,
  }
}

/** Rows per Activity page; "Load more" asks for this many more. */
export const ACTIVITY_PAGE_SIZE = 50
/** The most rows Activity ever shows (the API accepts a limit of 1001 so the client can ask for one spare row). */
export const ACTIVITY_MAX_ROWS = 1000

/** The page size after "Load more": never beyond the cap. */
export const nextPageSize = (size: number): number => Math.min(size + ACTIVITY_PAGE_SIZE, ACTIVITY_MAX_ROWS)
