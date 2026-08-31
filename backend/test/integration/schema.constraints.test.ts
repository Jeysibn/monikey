// Real-Postgres integration coverage for every CHECK constraint and trigger
// in the Phase 1 migration. QA Attempt 1, Finding 18: none of these were
// tested, which is exactly how Findings 2 (card details on a non-card
// account), 6 (unbounded owed balance with no details row), and 9 (negative
// opening balance) survived the developer's self-check. Every one of those
// three regressions gets its own explicit test below, plus the rest of the
// constraint/trigger surface.
//
// Gated on a real database exactly like health.db.test.ts: skips itself
// (rather than failing) when no TEST_DATABASE_URL/DATABASE_URL is set.
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
const describeIfDb = databaseUrl ? describe : describe.skip

describeIfDb('Phase 1 database constraints and triggers (real PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  const createdUserIds: string[] = []

  async function createUser(): Promise<string> {
    const id = randomUUID()
    await prisma.user.create({
      data: {
        id,
        email: `qa-${id}@monikey.test`,
        passwordHash: 'not-a-real-hash',
        displayName: 'QA Constraint Test',
      },
    })
    createdUserIds.push(id)
    return id
  }

  afterAll(async () => {
    // Cascades to financial_accounts -> credit_card_details, categories, etc.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await prisma.$disconnect()
  })

  // --- categories -----------------------------------------------------

  it('rejects a category that allows neither income nor expense', async () => {
    const userId = await createUser()
    await expect(
      prisma.category.create({
        data: { userId, name: 'Neither', color: '#000', allowsIncome: false, allowsExpense: false },
      }),
    ).rejects.toThrow()
  })

  it('accepts a category that allows at least one of income/expense', async () => {
    const userId = await createUser()
    await expect(
      prisma.category.create({
        data: { userId, name: 'Expense OK', color: '#000', allowsIncome: false, allowsExpense: true },
      }),
    ).resolves.toBeDefined()
  })

  // --- financial_accounts: asset non-negative (current + opening) -----

  it('rejects an asset account with a negative current_balance_minor', async () => {
    const userId = await createUser()
    await expect(
      prisma.financialAccount.create({
        data: {
          userId,
          name: 'Neg Current',
          accountType: 'cash',
          classification: 'asset',
          currentBalanceMinor: -1n,
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects an asset account with a negative opening_balance_minor (QA Attempt 1, Finding 9)', async () => {
    const userId = await createUser()
    await expect(
      prisma.financialAccount.create({
        data: {
          userId,
          name: 'Neg Opening',
          accountType: 'savings',
          classification: 'asset',
          openingBalanceMinor: -500000n,
        },
      }),
    ).rejects.toThrow()
  })

  it('accepts a zero-balance asset account', async () => {
    const userId = await createUser()
    await expect(
      prisma.financialAccount.create({
        data: { userId, name: 'Zero Balance', accountType: 'cash', classification: 'asset' },
      }),
    ).resolves.toBeDefined()
  })

  // --- financial_accounts: account_type <-> classification pairing ----

  it('rejects a credit_card account_type paired with asset classification', async () => {
    const userId = await createUser()
    await expect(
      prisma.financialAccount.create({
        data: { userId, name: 'Bad Pair', accountType: 'credit_card', classification: 'asset' },
      }),
    ).rejects.toThrow()
  })

  it('rejects a non-credit_card account_type paired with liability classification', async () => {
    const userId = await createUser()
    await expect(
      prisma.financialAccount.create({
        data: { userId, name: 'Bad Pair 2', accountType: 'checking', classification: 'liability' },
      }),
    ).rejects.toThrow()
  })

  // --- credit_card_details: single-table CHECKs ------------------------

  it('rejects a credit_card_details row with credit_limit_minor <= 0', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await expect(
      prisma.$transaction([
        prisma.financialAccount.create({
          data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
        }),
        prisma.creditCardDetail.create({
          data: { accountId, network: 'visa', creditLimitMinor: 0n, dueDay: 15 },
        }),
      ]),
    ).rejects.toThrow()
  })

  it('rejects a credit_card_details row with a negative minimum_payment_minor', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await expect(
      prisma.$transaction([
        prisma.financialAccount.create({
          data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
        }),
        prisma.creditCardDetail.create({
          data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15, minimumPaymentMinor: -1n },
        }),
      ]),
    ).rejects.toThrow()
  })

  it.each([0, 32])('rejects a credit_card_details row with due_day = %i', async (dueDay) => {
    const userId = await createUser()
    const accountId = randomUUID()
    await expect(
      prisma.$transaction([
        prisma.financialAccount.create({
          data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
        }),
        prisma.creditCardDetail.create({
          data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay },
        }),
      ]),
    ).rejects.toThrow()
  })

  it('accepts a valid credit_card + credit_card_details pair created together', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await expect(
      prisma.$transaction([
        prisma.financialAccount.create({
          data: { id: accountId, userId, name: 'Good Card', accountType: 'credit_card', classification: 'liability' },
        }),
        prisma.creditCardDetail.create({
          data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
        }),
      ]),
    ).resolves.toBeDefined()
  })

  // --- cross-table trigger invariants ----------------------------------

  it('rejects credit_card_details attached to a non-liability/non-card account (QA Attempt 1, Finding 2)', async () => {
    const userId = await createUser()
    const account = await prisma.financialAccount.create({
      data: { userId, name: 'Cash Wallet', accountType: 'cash', classification: 'asset' },
    })
    await expect(
      prisma.creditCardDetail.create({
        data: { accountId: account.id, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ).rejects.toThrow()
  })

  it('rejects a credit_card/liability account with no matching credit_card_details row at commit (QA Attempt 1, Finding 6a)', async () => {
    const userId = await createUser()
    await expect(
      prisma.financialAccount.create({
        data: { userId, name: 'Cardless', accountType: 'credit_card', classification: 'liability' },
      }),
    ).rejects.toThrow()
  })

  it('rejects deleting a credit_card_details row while its account is still a live credit_card account (QA Attempt 1, Finding 6b)', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    await expect(prisma.creditCardDetail.delete({ where: { accountId } })).rejects.toThrow()

    // The account is still bounded — a follow-up attempt to blow past the
    // limit is still rejected, proving the "orphan then go wild" hole is
    // fully closed, not just the DELETE statement itself.
    await expect(
      prisma.financialAccount.update({ where: { id: accountId }, data: { currentBalanceMinor: 999999999n } }),
    ).rejects.toThrow()
  })

  it('allows a credit_card_details row to be removed via cascading account deletion', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card To Delete', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'mastercard', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    await expect(prisma.financialAccount.delete({ where: { id: accountId } })).resolves.toBeDefined()
    await expect(prisma.creditCardDetail.findUnique({ where: { accountId } })).resolves.toBeNull()
  })

  it('rejects a card owed balance that exceeds its credit limit', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    await expect(
      prisma.financialAccount.update({ where: { id: accountId }, data: { currentBalanceMinor: 200000n } }),
    ).rejects.toThrow()
  })

  it('rejects a negative card owed balance', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    await expect(
      prisma.financialAccount.update({ where: { id: accountId }, data: { currentBalanceMinor: -1n } }),
    ).rejects.toThrow()
  })

  it('accepts a card owed balance within [0, credit_limit_minor]', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    await expect(
      prisma.financialAccount.update({ where: { id: accountId }, data: { currentBalanceMinor: 50000n } }),
    ).resolves.toBeDefined()
  })

  // --- QA Attempt 2, Finding D2: reclassifying a live card account -----

  it('rejects reclassifying a live credit_card/liability account to cash/asset while its credit_card_details row still exists', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    // QA Attempt 2's exact repro: reclassify alone, in one statement/one
    // transaction, with the credit_card_details row left in place.
    await expect(
      prisma.financialAccount.update({
        where: { id: accountId },
        data: { accountType: 'cash', classification: 'asset' },
      }),
    ).rejects.toThrow()

    // The account must still genuinely be a live, bounded card afterward —
    // not silently reclassified by a rolled-back-but-partially-applied
    // update (Postgres transactions don't allow that, but this proves it,
    // not just assumes it).
    const stillACard = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
    expect(stillACard.accountType).toBe('credit_card')
    expect(stillACard.classification).toBe('liability')
  })

  it('rejects the two-step bypass: reclassify then delete credit_card_details in a follow-up transaction', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    // Reclassify commits on its own (no delete in this transaction) — the
    // deferred trigger fires at commit and must reject it outright, exactly
    // like the single-statement case above.
    await expect(
      prisma.financialAccount.update({
        where: { id: accountId },
        data: { accountType: 'cash', classification: 'asset' },
      }),
    ).rejects.toThrow()
  })

  it('allows the legitimate one-transaction path: reclassify AND delete credit_card_details together', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Former Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    // Reclassify first, then delete the details row, in the SAME
    // transaction — the immediate BEFORE DELETE guard only blocks the
    // delete while account_type is still 'credit_card' *at delete time*,
    // and by then this transaction has already changed it. This is the
    // documented, intended way to convert a card account to a plain asset.
    await expect(
      prisma.$transaction([
        prisma.financialAccount.update({
          where: { id: accountId },
          data: { accountType: 'cash', classification: 'asset' },
        }),
        prisma.creditCardDetail.delete({ where: { accountId } }),
      ]),
    ).resolves.toBeDefined()

    const reclassified = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } })
    expect(reclassified.accountType).toBe('cash')
    expect(reclassified.classification).toBe('asset')
    await expect(prisma.creditCardDetail.findUnique({ where: { accountId } })).resolves.toBeNull()
  })

  it('rejects attempting the bypass in the wrong order: delete credit_card_details before reclassifying', async () => {
    const userId = await createUser()
    const accountId = randomUUID()
    await prisma.$transaction([
      prisma.financialAccount.create({
        data: { id: accountId, userId, name: 'Card', accountType: 'credit_card', classification: 'liability' },
      }),
      prisma.creditCardDetail.create({
        data: { accountId, network: 'visa', creditLimitMinor: 100000n, dueDay: 15 },
      }),
    ])

    // Delete-then-reclassify (wrong order): the immediate BEFORE DELETE
    // guard sees account_type still 'credit_card' at delete time and
    // rejects the delete before the reclassify ever runs.
    await expect(
      prisma.$transaction([
        prisma.creditCardDetail.delete({ where: { accountId } }),
        prisma.financialAccount.update({
          where: { id: accountId },
          data: { accountType: 'cash', classification: 'asset' },
        }),
      ]),
    ).rejects.toThrow()
  })
})

describeIfDb('Prisma schema/migration drift (QA Attempt 1, Finding 1)', () => {
  it('prisma migrate diff reports no drift between schema.prisma and the applied migration', async () => {
    const { execFileSync } = await import('node:child_process')
    const path = await import('node:path')
    const backendRoot = path.resolve(import.meta.dirname, '..', '..')

    const output = execFileSync(
      'npx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-schema-datamodel',
        'prisma/schema.prisma',
        '--to-url',
        databaseUrl!,
        '--script',
      ],
      { cwd: backendRoot, encoding: 'utf-8', env: { ...process.env, DATABASE_URL: databaseUrl! } },
    )

    // An empty/no-op diff prints a comment-only script with no ALTER/CREATE
    // statements. Assert specifically that no column-type change is
    // proposed — that is exactly what the timestamptz-vs-timestamp drift
    // looked like in QA Attempt 1.
    expect(output).not.toMatch(/ALTER COLUMN/i)
    expect(output).not.toMatch(/SET DATA TYPE/i)
  })
})
