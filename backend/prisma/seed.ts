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
  // eslint-disable-next-line no-console
  console.log(`Seeded ${SYSTEM_CATEGORIES.length} system categories.`)
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
