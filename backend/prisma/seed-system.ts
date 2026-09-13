import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const categories = [
  ['00000000-0000-4000-8000-000000000001', 'Housing', 'var(--cyan)', true, false, true],
  ['00000000-0000-4000-8000-000000000002', 'Food & Groceries', 'var(--teal)', true, false, true],
  ['00000000-0000-4000-8000-000000000003', 'Transport', 'var(--purple)', true, false, true],
  ['00000000-0000-4000-8000-000000000004', 'Shopping', 'var(--amber)', true, false, true],
  ['00000000-0000-4000-8000-000000000005', 'Utilities', 'var(--slate-lt-fg)', true, false, true],
  ['00000000-0000-4000-8000-000000000006', 'Debt Payments', 'var(--slate-fg)', true, false, true],
  ['00000000-0000-4000-8000-000000000007', 'Salary', 'var(--cyan)', false, true, false],
  ['00000000-0000-4000-8000-000000000008', 'Subscriptions', 'var(--purple)', false, false, true],
] as const

for (const [id, name, color, budgetable, allowsIncome, allowsExpense] of categories) {
  await prisma.category.upsert({
    where: { id },
    create: { id, userId: null, name, color, budgetable, allowsIncome, allowsExpense },
    update: { name, color, budgetable, allowsIncome, allowsExpense },
  })
}
console.log(`Seeded ${categories.length} system categories.`)
await prisma.$disconnect()
