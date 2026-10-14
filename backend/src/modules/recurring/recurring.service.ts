import { Prisma } from '@prisma/client'
import type { PrismaClient, RecurringItem, RecurringOccurrence } from '@prisma/client'
import type { LedgerService } from '../ledger/ledger.service.js'
import type { TransactionView } from '../ledger/ledger.schemas.js'
import { addDaysIso, advanceDueDate, isoDate } from './recurring.schedule.js'

// Stage 6B. The ONLY code that turns a recurring bill into a ledger expense. It runs when a signed-in
// user explicitly confirms a cycle (POST /recurring/:id/confirm-payment, or the legacy mark-paid route
// that delegates here). The worker never calls it.

export interface DuplicateCandidate { transactionId: string; title: string; amountMinor: string; occurredOn: string; accountId: string | null; categoryId: string | null; matchedOn: Array<'amount' | 'merchant' | 'account' | 'category'> }
export type RecurringConflict = { kind: 'conflict'; status: number; code: string; message: string; field?: string; transaction?: TransactionView | null; candidates?: DuplicateCandidate[] }
export type RecurringSuccess = { kind: 'ok'; outcome: 'confirmed' | 'replayed' | 'reconciled_existing' | 'skipped' | 'linked'; item: RecurringItem; occurrence: RecurringOccurrence; transaction: TransactionView | null }
export type RecurringResult = RecurringConflict | RecurringSuccess

export interface ConfirmInput { expectedDueDate: string; amountMinor: bigint; accountId?: string; paidOn: string; allowPossibleDuplicate?: boolean }

const conflict = (status: number, code: string, message: string, extra: Partial<RecurringConflict> = {}): RecurringConflict => ({ kind: 'conflict', status, code, message, ...extra })
export const occurrenceLedgerKey = (itemId: string, dueDate: string) => `recurring:${itemId}:${dueDate}` // same key the legacy worker used, so legacy auto-posted cycles are recognised

type Tx = Prisma.TransactionClient

const reversedPayment = (due: string, transaction?: TransactionView | null): RecurringConflict => conflict(409, 'RECURRING_PAYMENT_REVERSED',
  `The payment for the ${due} cycle was reversed, so that cycle stays closed with no payment on record. A reversed bill payment cannot be re-recorded for the same cycle. Record the correct payment as a normal expense in Quick Add; the bill's next cycle is not affected.`, { transaction })

export class RecurringService {
  constructor(private prisma: PrismaClient, private ledger: LedgerService) {}

  private async lockItem(tx: Tx, userId: string, itemId: string): Promise<RecurringItem | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM recurring_items WHERE id = ${itemId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`)
    if (rows.length === 0) return null
    // Announce a user-driven schedule change to the database guard (migration 20261017000000), transaction-local.
    await tx.$executeRaw`SELECT set_config('app.recurring_schedule_write', 'on', true)`
    return tx.recurringItem.findUnique({ where: { id: itemId } })
  }

  private async isReversed(tx: Tx, transactionId: string | null): Promise<boolean> {
    if (!transactionId) return false
    const row = await tx.transaction.findUnique({ where: { id: transactionId }, select: { reversedTransactionId: true } })
    return Boolean(row?.reversedTransactionId)
  }

  /**
   * User edit of a bill. Moving the due date onto (or before) a cycle that is already confirmed or skipped would
   * leave the bill stuck on a settled cycle (every confirm/skip would only replay or refuse), so it is refused
   * with an explanation. Settled occurrence records are never edited or deleted.
   */
  async update(userId: string, itemId: string, data: Prisma.RecurringItemUncheckedUpdateInput, newDueIso?: string): Promise<{ kind: 'item'; item: RecurringItem } | RecurringConflict> {
    return this.prisma.$transaction(async (tx) => {
      const item = await this.lockItem(tx, userId, itemId)
      if (!item) return conflict(404, 'NOT_FOUND', 'Recurring item not found.')
      if (newDueIso !== undefined && newDueIso !== isoDate(item.nextDueDate)) {
        const settled = await tx.recurringOccurrence.findFirst({ where: { recurringItemId: itemId, dueDate: { gte: new Date(`${newDueIso}T00:00:00Z`) } }, orderBy: { dueDate: 'desc' } })
        if (settled) {
          const last = isoDate(settled.dueDate)
          return conflict(409, 'RECURRING_SETTLED_CYCLE', `The ${last} cycle of this bill is already ${settled.status === 'skipped' ? 'skipped' : 'paid'}, and settled cycles cannot be reopened. Choose a due date after ${last}.`, { field: 'nextDueDate' })
        }
      }
      return { kind: 'item' as const, item: await tx.recurringItem.update({ where: { id: itemId }, data }) }
    }, { maxWait: 15_000 })
  }

  // Read-only lookup of an already-committed transaction (the ledger read path uses its own connection).
  /** Read through the caller's transaction client: using the shared pool from inside an interactive transaction
   *  needs a second connection while the first is held, which deadlocks a small pool under concurrent requests. */
  private async view(db: Tx, userId: string, transactionId: string | null): Promise<TransactionView | null> {
    return transactionId ? this.ledger.getTransaction(userId, transactionId, db) : null
  }

  /** Likely already-entered payments for this bill (never reversed, not already linked, not this cycle's own key). */
  async findPossibleDuplicates(db: Tx | PrismaClient, userId: string, item: RecurringItem, dueIso: string, todayIso: string, amountMinor: bigint, accountId?: string): Promise<DuplicateCandidate[]> {
    const rows = await db.transaction.findMany({
      where: {
        userId, type: 'expense', status: 'cleared', reversedTransactionId: null, reversingTransaction: null, recurringOccurrence: null,
        occurredOn: { gte: new Date(`${addDaysIso(dueIso, -10)}T00:00:00Z`), lte: new Date(`${todayIso}T00:00:00Z`) },
        OR: [{ amountMinor }, { amountMinor: item.amountMinor }, { title: { contains: item.merchant, mode: 'insensitive' } }],
        // `NOT startsWith` alone would drop rows whose key is NULL (SQL three-valued logic), hiding exactly the manual entries we look for.
        AND: [{ OR: [{ idempotencyKey: null }, { NOT: { idempotencyKey: { startsWith: `recurring:${item.id}:` } } }] }],
      },
      orderBy: { occurredOn: 'desc' }, take: 5,
    })
    return rows.map((t) => {
      const matchedOn: DuplicateCandidate['matchedOn'] = []
      if (t.amountMinor === amountMinor || t.amountMinor === item.amountMinor) matchedOn.push('amount')
      if (t.title.toLowerCase().includes(item.merchant.toLowerCase())) matchedOn.push('merchant')
      if (t.fromAccountId && t.fromAccountId === (accountId ?? item.accountId)) matchedOn.push('account')
      if (t.categoryId === item.categoryId) matchedOn.push('category')
      return { transactionId: t.id, title: t.title, amountMinor: String(t.amountMinor), occurredOn: isoDate(t.occurredOn), accountId: t.fromAccountId, categoryId: t.categoryId, matchedOn }
    }).filter((c) => c.matchedOn.includes('amount') || c.matchedOn.includes('merchant'))
  }

  async candidates(userId: string, itemId: string, dueDate: string | undefined, todayIso: string, amountMinor?: bigint, accountId?: string): Promise<{ item: RecurringItem; dueDate: string; candidates: DuplicateCandidate[] } | null> {
    const item = await this.prisma.recurringItem.findFirst({ where: { id: itemId, userId } })
    if (!item) return null
    const due = dueDate ?? isoDate(item.nextDueDate)
    return { item, dueDate: due, candidates: await this.findPossibleDuplicates(this.prisma, userId, item, due, todayIso, amountMinor ?? item.amountMinor, accountId) }
  }

  /** Shared cycle checks; returns a conflict, or null when `expectedDueDate` is the current, due cycle. */
  private cycleConflict(item: RecurringItem, expectedDueDate: string, todayIso: string): RecurringConflict | null {
    const current = isoDate(item.nextDueDate)
    if (item.status !== 'active') return conflict(409, 'RECURRING_PAUSED', 'This bill is paused. Resume it before recording a payment.')
    if (expectedDueDate < current) return conflict(409, 'RECURRING_STALE_CYCLE', `The ${expectedDueDate} cycle is no longer the current one (the bill is now due ${current}). Refresh and try again.`, { field: 'expectedDueDate' })
    if (expectedDueDate > current) return conflict(422, 'RECURRING_NOT_DUE', `The current cycle is due ${current}; ${expectedDueDate} cannot be recorded yet.`, { field: 'expectedDueDate' })
    if (current > todayIso) return conflict(422, 'RECURRING_NOT_DUE', `This bill is not due until ${current}.`, { field: 'expectedDueDate' })
    return null
  }

  private async staleCycleResult(tx: Tx, item: RecurringItem, userId: string, expectedDueDate: string): Promise<RecurringConflict | null> {
    if (expectedDueDate >= isoDate(item.nextDueDate)) return null
    const legacy = await tx.transaction.findFirst({ where: { userId, idempotencyKey: occurrenceLedgerKey(item.id, expectedDueDate) } })
    if (legacy?.reversedTransactionId) return reversedPayment(expectedDueDate, await this.view(tx, userId, legacy.id))
    if (legacy) return conflict(409, 'RECURRING_ALREADY_CONFIRMED', `The ${expectedDueDate} cycle was already recorded.`, { transaction: await this.view(tx, userId, legacy.id) })
    return null
  }

  async confirm(userId: string, itemId: string, input: ConfirmInput, todayIso: string): Promise<RecurringResult> {
    if (input.paidOn > todayIso) return conflict(422, 'VALIDATION_ERROR', 'The payment date cannot be in the future.', { field: 'paidOn' })
    if (input.amountMinor <= 0n) return conflict(422, 'VALIDATION_ERROR', 'Enter an amount greater than zero.', { field: 'amountMinor' })
    return this.prisma.$transaction(async (tx): Promise<RecurringResult> => {
      const item = await this.lockItem(tx, userId, itemId)
      if (!item) return conflict(404, 'NOT_FOUND', 'Recurring item not found.')
      const accountId = input.accountId ?? item.accountId
      const due = input.expectedDueDate

      // 1. This cycle was already addressed: replay the identical request, refuse a different one.
      const existing = await tx.recurringOccurrence.findUnique({ where: { recurringItemId_dueDate: { recurringItemId: itemId, dueDate: new Date(`${due}T00:00:00Z`) } } })
      if (existing) {
        if (existing.status === 'skipped') return conflict(409, 'RECURRING_CYCLE_SKIPPED', `The ${due} cycle was skipped, so no payment was recorded for it.`)
        if (await this.isReversed(tx, existing.transactionId)) return reversedPayment(due, await this.view(tx, userId, existing.transactionId))
        const same = existing.amountMinor === input.amountMinor && existing.accountId === accountId && existing.paidOn && isoDate(existing.paidOn) === input.paidOn
        if (!same) return conflict(409, 'RECURRING_ALREADY_CONFIRMED', `The ${due} cycle was already confirmed with different details. Nothing was changed.`, { transaction: await this.view(tx, userId, existing.transactionId) })
        return { kind: 'ok', outcome: 'replayed', item, occurrence: existing, transaction: await this.view(tx, userId, existing.transactionId) }
      }
      const stale = await this.staleCycleResult(tx, item, userId, due)
      if (stale) return stale
      const bad = this.cycleConflict(item, due, todayIso)
      if (bad) return bad

      // 2. Linked resources must still be usable.
      const [account, category] = await Promise.all([
        tx.financialAccount.findFirst({ where: { id: accountId, userId } }),
        tx.category.findFirst({ where: { id: item.categoryId, OR: [{ userId }, { userId: null }] } }),
      ])
      if (!account) return conflict(404, 'UNKNOWN_ACCOUNT', 'Payment account not found.', { field: 'accountId' })
      if (account.archivedAt) return conflict(422, 'ACCOUNT_ARCHIVED', 'That account is archived. Choose another account.', { field: 'accountId' })
      if (!category || category.archivedAt || !category.allowsExpense) return conflict(422, 'UNKNOWN_CATEGORY', "This bill's category is no longer available for expenses. Edit the bill first.", { field: 'categoryId' })

      const key = occurrenceLedgerKey(itemId, due)
      const nextDueDate = advanceDueDate(item.nextDueDate, item.frequency, item.anchorDay)

      // 3. A legacy auto-post (or an interrupted one) already recorded this cycle: link it, never post twice.
      const prior = await tx.transaction.findFirst({ where: { userId, idempotencyKey: key } })
      if (prior) {
        const occurrence = await tx.recurringOccurrence.create({ data: { recurringItemId: itemId, dueDate: new Date(`${due}T00:00:00Z`), status: 'confirmed', transactionId: prior.id, paidOn: prior.occurredOn, amountMinor: prior.amountMinor, accountId: prior.fromAccountId } })
        const updated = await tx.recurringItem.update({ where: { id: itemId }, data: { nextDueDate, lastPaidDate: prior.occurredOn } })
        return { kind: 'ok', outcome: 'reconciled_existing', item: updated, occurrence, transaction: await this.view(tx, userId, prior.id) }
      }

      // 4. Warn about an already-entered payment unless the user has seen the warning.
      if (!input.allowPossibleDuplicate) {
        const candidates = await this.findPossibleDuplicates(tx, userId, item, due, todayIso, input.amountMinor, accountId)
        if (candidates.length > 0) return conflict(409, 'POSSIBLE_DUPLICATE_PAYMENT', 'A similar payment was already recorded. Review it before recording this one.', { candidates })
      }

      // 5. Post + record the occurrence + advance the schedule in this one transaction. Any throw (overdraft,
      //    category rule, a failing update) rolls all of it back.
      // Announce the user-confirmed payment to the database guard (migration 20261016000000), transaction-local.
      await tx.$executeRaw`SELECT set_config('app.recurring_confirmation', 'on', true)`
      const posted = await this.ledger.postTransactionInTransaction(tx, userId, { type: 'expense', title: item.merchant, categoryId: item.categoryId, goalId: null, fromAccountId: accountId, toAccountId: null, occurredOn: input.paidOn, occurredTime: null, amountMinor: input.amountMinor, feeMinor: 0n, currencyCode: 'PHP', source: 'recurring', status: 'cleared', note: 'Recurring payment (confirmed by you)', idempotencyKey: key })
      const occurrence = await tx.recurringOccurrence.create({ data: { recurringItemId: itemId, dueDate: new Date(`${due}T00:00:00Z`), status: 'confirmed', transactionId: posted.transaction.id, paidOn: new Date(`${input.paidOn}T00:00:00Z`), amountMinor: input.amountMinor, accountId } })
      const updated = await tx.recurringItem.update({ where: { id: itemId }, data: { nextDueDate, lastPaidDate: new Date(`${input.paidOn}T00:00:00Z`) } })
      return { kind: 'ok', outcome: 'confirmed', item: updated, occurrence, transaction: posted.transaction }
    }, { timeout: 15_000, maxWait: 15_000 })
  }

  /** Skip a due/overdue cycle: advances the schedule, records the skip, never touches the ledger. */
  async skip(userId: string, itemId: string, expectedDueDate: string, todayIso: string): Promise<RecurringResult> {
    return this.prisma.$transaction(async (tx): Promise<RecurringResult> => {
      const item = await this.lockItem(tx, userId, itemId)
      if (!item) return conflict(404, 'NOT_FOUND', 'Recurring item not found.')
      const existing = await tx.recurringOccurrence.findUnique({ where: { recurringItemId_dueDate: { recurringItemId: itemId, dueDate: new Date(`${expectedDueDate}T00:00:00Z`) } } })
      if (existing) {
        if (existing.status === 'confirmed' && await this.isReversed(tx, existing.transactionId)) return reversedPayment(expectedDueDate, await this.view(tx, userId, existing.transactionId))
        if (existing.status === 'confirmed') return conflict(409, 'RECURRING_ALREADY_CONFIRMED', `The ${expectedDueDate} cycle was already paid.`, { transaction: await this.view(tx, userId, existing.transactionId) })
        return { kind: 'ok', outcome: 'replayed', item, occurrence: existing, transaction: null }
      }
      const stale = await this.staleCycleResult(tx, item, userId, expectedDueDate)
      if (stale) return stale
      const bad = this.cycleConflict(item, expectedDueDate, todayIso)
      if (bad) return bad
      const occurrence = await tx.recurringOccurrence.create({ data: { recurringItemId: itemId, dueDate: new Date(`${expectedDueDate}T00:00:00Z`), status: 'skipped' } })
      const updated = await tx.recurringItem.update({ where: { id: itemId }, data: { nextDueDate: advanceDueDate(item.nextDueDate, item.frequency, item.anchorDay) } })
      return { kind: 'ok', outcome: 'skipped', item: updated, occurrence, transaction: null }
    }, { maxWait: 15_000 })
  }

  /** Attach a payment the user already recorded (e.g. via Quick Add) to the current cycle. No ledger posting. */
  async linkExisting(userId: string, itemId: string, expectedDueDate: string, transactionId: string, todayIso: string): Promise<RecurringResult> {
    return this.prisma.$transaction(async (tx): Promise<RecurringResult> => {
      const item = await this.lockItem(tx, userId, itemId)
      if (!item) return conflict(404, 'NOT_FOUND', 'Recurring item not found.')
      const existing = await tx.recurringOccurrence.findUnique({ where: { recurringItemId_dueDate: { recurringItemId: itemId, dueDate: new Date(`${expectedDueDate}T00:00:00Z`) } } })
      if (existing) {
        if (existing.status === 'confirmed' && await this.isReversed(tx, existing.transactionId)) return reversedPayment(expectedDueDate, await this.view(tx, userId, existing.transactionId))
        if (existing.status === 'confirmed' && existing.transactionId === transactionId) return { kind: 'ok', outcome: 'replayed', item, occurrence: existing, transaction: await this.view(tx, userId, transactionId) }
        return conflict(409, existing.status === 'skipped' ? 'RECURRING_CYCLE_SKIPPED' : 'RECURRING_ALREADY_CONFIRMED', `The ${expectedDueDate} cycle was already addressed. Nothing was changed.`)
      }
      const stale = await this.staleCycleResult(tx, item, userId, expectedDueDate)
      if (stale) return stale
      const bad = this.cycleConflict(item, expectedDueDate, todayIso)
      if (bad) return bad
      const target = await tx.transaction.findFirst({ where: { id: transactionId, userId }, include: { recurringOccurrence: true, reversingTransaction: true } })
      if (!target) return conflict(404, 'UNKNOWN_TRANSACTION', 'Transaction not found.', { field: 'transactionId' })
      if (target.type !== 'expense' || target.status !== 'cleared' || target.reversedTransactionId || target.reversingTransaction) return conflict(422, 'INVALID_TRANSACTION_KIND', 'Only a cleared, un-reversed expense can be linked to a bill.', { field: 'transactionId' })
      if (target.recurringOccurrence) return conflict(409, 'RECURRING_ALREADY_CONFIRMED', 'That payment is already linked to another bill cycle.', { field: 'transactionId' })
      const occurrence = await tx.recurringOccurrence.create({ data: { recurringItemId: itemId, dueDate: new Date(`${expectedDueDate}T00:00:00Z`), status: 'confirmed', transactionId, paidOn: target.occurredOn, amountMinor: target.amountMinor, accountId: target.fromAccountId } })
      const updated = await tx.recurringItem.update({ where: { id: itemId }, data: { nextDueDate: advanceDueDate(item.nextDueDate, item.frequency, item.anchorDay), lastPaidDate: target.occurredOn } })
      return { kind: 'ok', outcome: 'linked', item: updated, occurrence, transaction: await this.view(tx, userId, transactionId) }
    }, { maxWait: 15_000 })
  }
}
