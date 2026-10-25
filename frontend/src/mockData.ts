import type { Account, Category, CreditCardPayment, MockData, Transaction } from './types.ts'

/*
 * Fictional Philippine-peso data for Milestone 4.2. No real accounts, people or amounts.
 * It is the same ledger as docs/design/UI_UX_SPEC.md section 2, in whole centavos:
 *   money you have ₱54,196.25 · card debt ₱21,050.00 · net position ₱33,146.25
 *   October 2026 income ₱36,500.00 · expenses ₱27,127.40 (card payments excluded)
 * Opening values are the balances on Oct 1; balances are always CALCULATED from them
 * (see lib/finance.ts), never typed in, so the figures cannot drift apart.
 * Categories are the seeded set from the TLD.
 */

const accounts: Account[] = [
  { id: 1, name: 'Cash on hand', type: 'cash', openingBalance: 481_175, openingDebt: 0, creditLimit: null },
  { id: 2, name: 'Main Savings', type: 'bank', openingBalance: 2_722_450, openingDebt: 0, creditLimit: null },
  { id: 3, name: 'GCash', type: 'ewallet', openingBalance: 631_115, openingDebt: 0, creditLimit: null },
  { id: 4, name: 'Blue Card', type: 'credit_card', openingBalance: 0, openingDebt: 1_197_275, creditLimit: 5_000_000 },
  { id: 5, name: 'Everyday Card', type: 'credit_card', openingBalance: 0, openingDebt: 260_100, creditLimit: 3_000_000 },
]

const categories: Category[] = [
  { id: 1, name: 'Salary', type: 'income' },
  { id: 2, name: 'Freelance', type: 'income' },
  { id: 3, name: 'Other', type: 'income' },
  { id: 4, name: 'Food', type: 'expense' },
  { id: 5, name: 'Transportation', type: 'expense' },
  { id: 6, name: 'Groceries', type: 'expense' },
  { id: 7, name: 'Bills', type: 'expense' },
  { id: 8, name: 'Shopping', type: 'expense' },
  { id: 9, name: 'Other', type: 'expense' },
]

// [id, date, accountId, categoryId, amount in centavos, note]
type Row = [number, string, number, number, number, string]
const rows: Row[] = [
  [1, '2026-10-02', 2, 7, 850_000, 'Apartment rent'],
  [2, '2026-10-03', 1, 6, 142_025, 'Wet market'],
  [3, '2026-10-05', 3, 7, 186_540, 'Electricity bill'],
  [4, '2026-10-06', 2, 7, 149_900, 'Internet'],
  [5, '2026-10-07', 1, 4, 21_500, 'Coffee and pandesal'],
  [6, '2026-10-08', 2, 2, 450_000, 'Logo project'],
  [7, '2026-10-09', 1, 5, 34_000, 'Commute'],
  [8, '2026-10-11', 4, 4, 125_000, 'Dinner with family'],
  [9, '2026-10-12', 5, 8, 239_900, 'Online order'],
  [10, '2026-10-14', 4, 6, 318_075, 'Supermarket'],
  [11, '2026-10-15', 2, 1, 3_200_000, 'October salary'],
  [12, '2026-10-16', 3, 7, 30_000, 'Mobile load'],
  [13, '2026-10-18', 5, 7, 180_000, 'Gym membership'],
  [14, '2026-10-19', 3, 9, 64_000, 'Movie night'],
  [15, '2026-10-21', 1, 9, 48_650, 'Pharmacy'],
  [16, '2026-10-23', 4, 6, 284_650, 'Supermarket'],
  [17, '2026-10-24', 3, 4, 38_500, 'Lunch with team'],
]

const transactions: Transaction[] = rows.map(([id, date, accountId, categoryId, amount, note]) => ({
  id,
  accountId,
  categoryId,
  amount,
  date,
  note,
  createdAt: `${date}T${String(8 + (id % 10)).padStart(2, '0')}:00:00.000Z`,
}))

const payments: CreditCardPayment[] = [
  { id: 1, sourceAccountId: 2, cardAccountId: 4, amount: 500_000, date: '2026-10-20', note: null, createdAt: '2026-10-20T10:00:00.000Z' },
]

const base: MockData = { today: '2026-10-25', accounts, categories, transactions, payments }

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
 */
export type DemoScenario = 'overpaid' | 'negative' | 'no-accounts' | 'over-limit' | 'paid-off' | 'many' | 'huge'

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
    return { today: base.today, accounts: [], categories, transactions: [], payments: [] }
  }
  return base
}
