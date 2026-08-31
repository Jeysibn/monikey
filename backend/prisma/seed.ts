// Phase 1 seed stub (QA Attempt 1, Finding 12: `db:seed:demo` pointed at a
// missing file). This intentionally seeds ONLY the stable system categories
// the plan asks for ("Seed stable category IDs compatible with the current
// demo state" — plan §13) — no users/accounts/cards/transactions yet, since
// LedgerModule and account/card creation don't exist until Phase 3. Phase 3
// must extend this file with the rest of the demo dataset (accounts, cards,
// historical transactions, budgets, goals) rather than replace it wholesale.
//
// Idempotent: safe to run against an already-seeded database (upsert by id).
import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

// Deterministic UUIDs (not random) so re-running this script — in dev, in
// CI, or against a fresh container — always produces the same category ids.
// Mirrors the stable slugs in src/services/mockFinanceRepository.ts's
// CATEGORIES array; kept in the same order for easy comparison.
const SYSTEM_CATEGORIES = [
  { id: '00000000-0000-4000-8000-000000000001', slug: 'housing', name: 'Housing', color: 'var(--cyan)', budgetable: true, allowsIncome: false, allowsExpense: true },
  { id: '00000000-0000-4000-8000-000000000002', slug: 'food', name: 'Food & Groceries', color: 'var(--teal)', budgetable: true, allowsIncome: false, allowsExpense: true },
  { id: '00000000-0000-4000-8000-000000000003', slug: 'transport', name: 'Transport', color: 'var(--purple)', budgetable: true, allowsIncome: false, allowsExpense: true },
  { id: '00000000-0000-4000-8000-000000000004', slug: 'shopping', name: 'Shopping', color: 'var(--amber)', budgetable: true, allowsIncome: false, allowsExpense: true },
  { id: '00000000-0000-4000-8000-000000000005', slug: 'utilities', name: 'Utilities', color: 'var(--slate-lt-fg)', budgetable: true, allowsIncome: false, allowsExpense: true },
  { id: '00000000-0000-4000-8000-000000000006', slug: 'debt', name: 'Debt Payments', color: 'var(--slate-fg)', budgetable: true, allowsIncome: false, allowsExpense: true },
  { id: '00000000-0000-4000-8000-000000000007', slug: 'salary', name: 'Salary', color: 'var(--cyan)', budgetable: false, allowsIncome: true, allowsExpense: false },
  { id: '00000000-0000-4000-8000-000000000008', slug: 'subscriptions', name: 'Subscriptions', color: 'var(--purple)', budgetable: false, allowsIncome: false, allowsExpense: true },
] as const

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000010'
const DEMO_ACCOUNTS = [
  { id: '00000000-0000-4000-8000-000000000011', name: 'Checking', institution: 'BPI', accountType: 'checking' as const, balance: 412000, lastFour: '4471' },
  { id: '00000000-0000-4000-8000-000000000012', name: 'Savings', institution: 'BDO', accountType: 'savings' as const, balance: 286000, lastFour: '8830' },
  { id: '00000000-0000-4000-8000-000000000013', name: 'GCash', institution: null, accountType: 'ewallet' as const, balance: 64000, lastFour: null },
  { id: '00000000-0000-4000-8000-000000000014', name: 'Maya', institution: null, accountType: 'ewallet' as const, balance: 30000, lastFour: null },
  { id: '00000000-0000-4000-8000-000000000015', name: 'Cash Wallet', institution: null, accountType: 'cash' as const, balance: 12000, lastFour: null },
] as const
const DEMO_CARDS = [
  { id: '00000000-0000-4000-8000-000000000016', name: 'Visa Platinum', lastFour: '2290', balance: 146000, limit: 500000, dueDay: 15, minimum: 7500, network: 'visa' as const },
  { id: '00000000-0000-4000-8000-000000000017', name: 'Mastercard', lastFour: '7734', balance: 61000, limit: 200000, dueDay: 22, minimum: 3000, network: 'mastercard' as const },
] as const
const DEMO_GOALS = [
  { id: '00000000-0000-4000-8000-000000000021', name: 'Travel', target: 400000, current: 212500, date: '2027-03-01', monthly: 10000, status: 'behind_pace', active: true },
  { id: '00000000-0000-4000-8000-000000000022', name: 'New Laptop', target: 130000, current: 117900, date: '2026-10-01', monthly: 6000, status: 'on_track', active: true },
  { id: '00000000-0000-4000-8000-000000000023', name: 'Car Down Payment', target: 500000, current: 1300, date: '2027-06-01', monthly: 20000, status: 'just_started', active: true },
] as const

async function main(): Promise<void> {
  for (const category of SYSTEM_CATEGORIES) {
    await prisma.category.upsert({
      where: { id: category.id },
      create: {
        id: category.id,
        userId: null, // system category, per Database Schema.md's "null means a protected system category"
        name: category.name,
        color: category.color,
        budgetable: category.budgetable,
        allowsIncome: category.allowsIncome,
        allowsExpense: category.allowsExpense,
      },
      update: {
        name: category.name,
        color: category.color,
        budgetable: category.budgetable,
        allowsIncome: category.allowsIncome,
        allowsExpense: category.allowsExpense,
      },
    })
  }
  const passwordHash = await argon2.hash('monikey-demo-password', { type: argon2.argon2id })
  await prisma.user.upsert({ where: { id: DEMO_USER_ID }, create: { id: DEMO_USER_ID, email: 'demo@monikey.local', passwordHash, displayName: 'Demo User', timezone: 'Asia/Manila', baseCurrency: 'PHP' }, update: { passwordHash, displayName: 'Demo User', timezone: 'Asia/Manila', baseCurrency: 'PHP' } })
  await prisma.userPreferences.upsert({ where: { userId: DEMO_USER_ID }, create: { userId: DEMO_USER_ID }, update: {} })
  for (const account of DEMO_ACCOUNTS) {
    await prisma.financialAccount.upsert({ where: { id: account.id }, create: { id: account.id, userId: DEMO_USER_ID, name: account.name, institution: account.institution, accountType: account.accountType, classification: 'asset', currencyCode: 'PHP', openingBalanceMinor: BigInt(account.balance), currentBalanceMinor: BigInt(account.balance), lastFour: account.lastFour, syncStatus: 'manual', manual: true }, update: { name: account.name, currentBalanceMinor: BigInt(account.balance), openingBalanceMinor: BigInt(account.balance) } })
  }
  for (const card of DEMO_CARDS) {
    await prisma.financialAccount.upsert({ where: { id: card.id }, create: { id: card.id, userId: DEMO_USER_ID, name: card.name, accountType: 'credit_card', classification: 'liability', currencyCode: 'PHP', openingBalanceMinor: BigInt(card.balance), currentBalanceMinor: BigInt(card.balance), lastFour: card.lastFour, syncStatus: 'manual', manual: true }, update: { name: card.name, currentBalanceMinor: BigInt(card.balance), openingBalanceMinor: BigInt(card.balance) } })
    await prisma.creditCardDetail.upsert({ where: { accountId: card.id }, create: { accountId: card.id, network: card.network, creditLimitMinor: BigInt(card.limit), dueDay: card.dueDay, minimumPaymentMinor: BigInt(card.minimum) }, update: { creditLimitMinor: BigInt(card.limit), dueDay: card.dueDay, minimumPaymentMinor: BigInt(card.minimum) } })
  }
  for (const goal of DEMO_GOALS) {
    await prisma.goal.upsert({ where: { id: goal.id }, create: { id: goal.id, userId: DEMO_USER_ID, name: goal.name, targetMinor: BigInt(goal.target), currentMinor: BigInt(goal.current), currencyCode: 'PHP', targetDate: new Date(`${goal.date}T00:00:00Z`), monthlyContributionMinor: BigInt(goal.monthly), status: goal.status, active: goal.active }, update: { name: goal.name, targetMinor: BigInt(goal.target), currentMinor: BigInt(goal.current), targetDate: new Date(`${goal.date}T00:00:00Z`), monthlyContributionMinor: BigInt(goal.monthly), status: goal.status, active: goal.active } })
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${SYSTEM_CATEGORIES.length} system categories, demo user, ${DEMO_ACCOUNTS.length + DEMO_CARDS.length} accounts/cards, and ${DEMO_GOALS.length} goals.`)
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
