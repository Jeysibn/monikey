import type { Account, AccountTransfer, Category, CreditCardPayment, KakeiboEnvelope, KakeiboPlan, MockData, Transaction } from './types.ts'

/*
 * Fictional Philippine-peso data for Milestone 4.2. No real accounts, people or amounts.
 * It is the same ledger as docs/design/UI_UX_SPEC.md section 2, in whole centavos:
 *   money you have ₱54,196.25 · card debt ₱21,050.00 · net position ₱33,146.25
 *   October 2026 income ₱36,500.00 · expenses ₱27,127.40 (card payments excluded)
 * Opening values are the balances on Oct 1; balances are always CALCULATED from them
 * (see lib/finance.ts), never typed in, so the figures cannot drift apart.
 * Categories are the seeded set from the TLD.
 *
 * Kakeibo (ADR-021): a fictional October plan, an envelope on most October expenses, and two left
 * unclassified (₱1,025.00) to show that state. Needs is planned at ₱18,000.00 and ₱19,951.90 is spent,
 * so one envelope is over its limit. Some expense categories suggest an envelope; Food and Other don't,
 * because the same category can be a need one day and a want the next.
 */

const accounts: Account[] = [
  { id: 1, name: 'Cash on hand', type: 'cash', openingBalance: 481_175, openingDebt: 0, creditLimit: null },
  { id: 2, name: 'Main Savings', type: 'bank', openingBalance: 2_722_450, openingDebt: 0, creditLimit: null },
  { id: 3, name: 'GCash', type: 'ewallet', openingBalance: 631_115, openingDebt: 0, creditLimit: null },
  { id: 4, name: 'Blue Card', type: 'credit_card', openingBalance: 0, openingDebt: 1_197_275, creditLimit: 5_000_000 },
  { id: 5, name: 'Everyday Card', type: 'credit_card', openingBalance: 0, openingDebt: 260_100, creditLimit: 3_000_000 },
]

const categories: Category[] = [
  { id: 1, name: 'Salary', type: 'income', iconKey: 'briefcase-business', colorKey: 'green' },
  { id: 2, name: 'Freelance', type: 'income', iconKey: 'briefcase-business', colorKey: 'teal' },
  { id: 3, name: 'Other', type: 'income' },
  { id: 4, name: 'Food', type: 'expense', iconKey: 'utensils', colorKey: 'orange' },
  { id: 5, name: 'Transportation', type: 'expense', iconKey: 'car-front', colorKey: 'blue' },
  { id: 6, name: 'Groceries', type: 'expense', iconKey: 'shopping-basket', colorKey: 'green' },
  { id: 7, name: 'Bills', type: 'expense', iconKey: 'house', colorKey: 'indigo' },
  { id: 8, name: 'Shopping', type: 'expense', iconKey: 'shopping-bag', colorKey: 'pink' },
  { id: 9, name: 'Other', type: 'expense' },
]
const defaultEnvelopes: Record<number, KakeiboEnvelope> = { 5: 'needs', 6: 'needs', 7: 'needs', 8: 'wants' }
const kakeiboCategories: Category[] = categories.map((c) => ({ ...c, defaultEnvelope: defaultEnvelopes[c.id] ?? null }))

// [id, date, accountId, categoryId, amount in centavos, note, Kakeibo envelope (expenses; null = unclassified)]
type Row = [number, string, number, number, number, string, KakeiboEnvelope | null]
const rows: Row[] = [
  [1, '2026-10-02', 2, 7, 850_000, 'Apartment rent', 'needs'],
  [2, '2026-10-03', 1, 6, 142_025, 'Wet market', 'needs'],
  [3, '2026-10-05', 3, 7, 186_540, 'Electricity bill', 'needs'],
  [4, '2026-10-06', 2, 7, 149_900, 'Internet', 'needs'],
  [5, '2026-10-07', 1, 4, 21_500, 'Coffee and pandesal', 'wants'],
  [6, '2026-10-08', 2, 2, 450_000, 'Logo project', null],
  [7, '2026-10-09', 1, 5, 34_000, 'Commute', 'needs'],
  [8, '2026-10-11', 4, 4, 125_000, 'Dinner with family', 'wants'],
  [9, '2026-10-12', 5, 8, 239_900, 'Online order', 'wants'],
  [10, '2026-10-14', 4, 6, 318_075, 'Supermarket', 'needs'],
  [11, '2026-10-15', 2, 1, 3_200_000, 'October salary', null],
  [12, '2026-10-16', 3, 7, 30_000, 'Mobile load', 'needs'],
  [13, '2026-10-18', 5, 7, 180_000, 'Gym membership', 'culture'],
  [14, '2026-10-19', 3, 9, 64_000, 'Movie night', null],
  [15, '2026-10-21', 1, 9, 48_650, 'Pharmacy', 'unexpected'],
  [16, '2026-10-23', 4, 6, 284_650, 'Supermarket', 'needs'],
  [17, '2026-10-24', 3, 4, 38_500, 'Lunch with team', null],
]

const transactions: Transaction[] = rows.map(([id, date, accountId, categoryId, amount, note, envelope]) => ({
  id,
  accountId,
  categoryId,
  amount,
  date,
  note,
  envelope,
  createdAt: `${date}T${String(8 + (id % 10)).padStart(2, '0')}:00:00.000Z`,
}))

// Planned income 36,000 + starting funds 2,000 − savings 5,000 − debt reserve 3,000 = 30,000 available;
// the four limits add up to 28,000, so 2,000 is unallocated.
const kakeiboPlans: KakeiboPlan[] = [
  {
    month: '2026-10',
    plannedIncome: 3_600_000,
    allocatedStartingFunds: 200_000,
    savingsTarget: 500_000,
    priorPeriodDebtReserve: 300_000,
    limits: { needs: 1_800_000, wants: 500_000, culture: 200_000, unexpected: 300_000 },
    monthlyIntention: 'Cook at home on weekdays and keep weekends for one treat.',
  },
]

// A fictional weekly check-in for the week of Mon 19 – Sun 25 October.
const kakeiboWeekReviews: NonNullable<MockData['kakeiboWeekReviews']> = [
  {
    weekStart: '2026-10-19',
    surprise: 'Small food buys added up faster than I thought.',
    worthwhile: 'The movie night with friends.',
    nextWeek: 'Pack lunch on Tuesday and Thursday.',
    updatedAt: '2026-10-25T12:00:00.000Z',
  },
]

// For ?demo=reviewed: an October reflection saved before "Lunch with team" (₱385.00, unclassified) was
// recorded, so today's totals differ from its snapshot and the screen says so.
const reviewedOctober: NonNullable<MockData['kakeiboReviews']>[number] = {
  month: '2026-10',
  savedDeclared: 400_000,
  available: 'Salary and one freelance job; about ₱30,000 to spend.',
  savings: 'I meant to save ₱5,000 and set aside ₱4,000.',
  change: 'Cap eating out at two times a week.',
  appreciated: 'The family dinner.',
  surprise: 'How much Needs went over.',
  lesson: 'Plan groceries before the week starts.',
  reviewedAt: '2026-10-24T13:00:00.000Z',
  snapshot: {
    actualIncome: 3_650_000,
    totalExpenses: 2_674_240,
    unclassified: 64_000,
    envelopes: { needs: 1_995_190, wants: 386_400, culture: 180_000, unexpected: 48_650 },
  },
}

const payments: CreditCardPayment[] = [
  { id: 1, sourceAccountId: 2, cardAccountId: 4, amount: 500_000, date: '2026-10-20', note: null, createdAt: '2026-10-20T10:00:00.000Z' },
]

const transfers: AccountTransfer[] = []

const base: MockData = { today: '2026-10-25', accounts, categories: kakeiboCategories, transactions, payments, transfers, kakeiboPlans, kakeiboWeekReviews }

/**
 * Which fictional ledger to show. The default is the ledger above. The others exist so that rare
 * states can be seen and tested without editing code (open the app with `?demo=<name>`):
 *  - "overpaid": ₱20,000 sent from Main Savings to Everyday Card, which only owed ₱6,800 (card credit)
 *  - "negative": ₱4,000 sent from GCash, which only held ₱3,120.75 (account below zero)
 *  - "no-accounts": first run, nothing added yet
 *  - "over-limit": a ₱30,000.00 purchase on Everyday Card (limit ₱30,000.00), so it is over its limit
 *  - "paid-off": Blue Card paid in full (₱14,250.00 from Main Savings), so it owes nothing
 *  - "many": 40 extra October entries (58 in all) so the Activity list is longer than one page
 *  - "huge": 1,200 extra October entries (1,218 in all) to reach the Activity list's 1,000-row cap
 *  - "no-plan": the same ledger with no Kakeibo plan (expenses recorded, nothing planned)
 *  - "reviewed": October has a month-end reflection whose snapshot no longer matches the ledger
 */
export type DemoScenario = 'overpaid' | 'negative' | 'no-accounts' | 'over-limit' | 'paid-off' | 'many' | 'huge' | 'no-plan' | 'reviewed'

export function getMockData(scenario?: DemoScenario | null): MockData {
  if (scenario === 'overpaid') {
    return { ...base, payments: [...payments, { id: 2, sourceAccountId: 2, cardAccountId: 5, amount: 2_000_000, date: '2026-10-25', note: null, createdAt: '2026-10-25T09:00:00.000Z' }] }
  }
  if (scenario === 'negative') {
    return { ...base, payments: [...payments, { id: 2, sourceAccountId: 3, cardAccountId: 4, amount: 400_000, date: '2026-10-25', note: null, createdAt: '2026-10-25T09:00:00.000Z' }] }
  }
  if (scenario === 'over-limit') {
    return { ...base, transactions: [...transactions, { id: 18, accountId: 5, categoryId: 8, amount: 3_000_000, date: '2026-10-25', note: 'Laptop', createdAt: '2026-10-25T09:00:00.000Z' }] }
  }
  if (scenario === 'paid-off') {
    return { ...base, payments: [...payments, { id: 2, sourceAccountId: 2, cardAccountId: 4, amount: 1_425_000, date: '2026-10-25', note: null, createdAt: '2026-10-25T09:00:00.000Z' }] }
  }
  if (scenario === 'huge') {
    const extra: Transaction[] = Array.from({ length: 1200 }, (_, i) => {
      const day = String(1 + (i % 24)).padStart(2, '0')
      return {
        id: 1000 + i,
        accountId: [1, 2, 3, 4][i % 4],
        categoryId: 4 + (i % 6),
        amount: 1_000 + i,
        date: `2026-10-${day}`,
        note: `Bulk entry ${i + 1}`,
        createdAt: `2026-10-${day}T${String(8 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      }
    })
    return { ...base, transactions: [...transactions, ...extra] }
  }
  if (scenario === 'many') {
    const extra: Transaction[] = Array.from({ length: 40 }, (_, i) => {
      const day = String(1 + (i % 24)).padStart(2, '0')
      return {
        id: 100 + i,
        accountId: [1, 2, 3, 4][i % 4],
        categoryId: 4 + (i % 6),
        amount: 10_000 + i * 1_300,
        date: `2026-10-${day}`,
        note: `Extra entry ${i + 1}`,
        createdAt: `2026-10-${day}T${String(8 + (i % 10)).padStart(2, '0')}:30:00.000Z`,
      }
    })
    return { ...base, transactions: [...transactions, ...extra] }
  }
  if (scenario === 'no-accounts') {
    return { today: base.today, accounts: [], categories: kakeiboCategories, transactions: [], payments: [], transfers: [], kakeiboPlans: [] }
  }
  if (scenario === 'no-plan') return { ...base, kakeiboPlans: [] }
  if (scenario === 'reviewed') return { ...base, kakeiboReviews: [reviewedOctober] }
  return base
}
