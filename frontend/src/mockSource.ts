import { ApiError, FAILED_DELETE, FAILED_SAVE, GONE_ON_EDIT, type ActivityQuery, type CategoryValues, type DataSource } from './dataSource.ts'
import { toAccountAction, entryExists, ledgerReducer, toAction, toDeleteAction, toUpdateAction } from './lib/ledger.ts'
import { parseAccountMoney, validateAccount, type AccountValues } from './lib/accountForm.ts'
import { amountText } from './lib/money.ts'
import { activityPage, buildSnapshot, kakeiboMonth, kakeiboMonthSnapshot, kakeiboWeek, summarize, liquidBalance, cardStatus, mockAnalytics } from './lib/finance.ts'
import { isMonday, parsePlanAmount, parseSavedDeclared, validatePlan, validateReview, validateWeekNotes } from './lib/kakeibo.ts'
import { getMockData, type DemoScenario } from './mockData.ts'
import type {
  AccountsSnapshot,
  ActivityPage,
  Category,
  EntryTarget,
  EntryValues,
  FinancialSummary,
  KakeiboEnvelope,
  KakeiboMonth,
  KakeiboPlan,
  KakeiboPlanValues,
  KakeiboReviewValues,
  KakeiboWeek,
  KakeiboWeekNotes,
  MockData,
} from './types.ts'

/*
 * The mock behind the DataSource seam. It keeps the fictional ledger in memory, applies writes with the same
 * reducer as before, and answers every read with the shapes the API will use (balances, owed, credit and
 * available credit already worked out). A reload restores the starting data.
 * `failNextWrite` makes the first save, delete or account write fail once, to show the error paths
 * (the `?demo=save-error` hook).
 */
/** The moment a new entry is stored: a full ISO 8601 timestamp in UTC with its offset ("…Z"), as the API sends (B3). */
export const nowIso = (): string => new Date().toISOString()

/** How reads fail in a demo: each distinct request once (its first answer), the second answer of each kind once, or every read. */
export type ReadFailures = 'once' | 'second' | 'always'

export interface MockOptions {
  scenario?: DemoScenario | null
  failNextWrite?: boolean // the first save, delete or new account fails once (?demo=save-error)
  invalidNextWrite?: boolean // the first save or new account is refused with a 422 and a field (?demo=invalid)
  readFailures?: ReadFailures | null // ?demo=load-error (once), ?demo=flaky (second), ?demo=offline (always)
  readFailureKinds?: string[] | null // only these kinds of read fail (accounts, categories, analytics, summary, activity, kakeibo, kakeibo-plan); all if omitted (?failing=summary)
  writeFailures?: 'always' | null // ?demo=offline: no write goes through
  readDelayMs?: number // ?demo=slow: every read takes this long
  writeDelayMs?: number // ?demo=slow: every write takes this long (long enough to show the "taking longer" notice)
  failClassifyEvery?: number // ?demo=partial: every n-th expense classification fails, to show a partly failed batch
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The API's ADR-020 checks on a card choice: a catalog-shaped ID, and never on a cash account. */
function checkCard(type: AccountValues['type'], card: string | null | undefined) {
  if (card === undefined || card === null) return
  if (card.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(card)) throw new ApiError(422, 'invalid_field', 'Choose a card from the list.', 'card_product_id')
  if (type === 'cash') throw new ApiError(422, 'invalid_field', "Cash accounts don't have a card.", 'card_product_id')
}

export function createMockSource({
  scenario = null,
  failNextWrite = false,
  invalidNextWrite = false,
  readFailures = null,
  readFailureKinds = null,
  writeFailures = null,
  readDelayMs = 0,
  writeDelayMs = 0,
  failClassifyEvery = 0,
}: MockOptions = {}): DataSource {
  let classifications = 0
  let data: MockData = getMockData(scenario)
  let failing = failNextWrite
  let invalid = invalidNextWrite
  const reads = new Map<string, number>() // answers given so far, per kind of read
  const seen = new Set<string>() // requests (kind and parameters) that have been answered or refused once

  // Answers arrive on a later turn (or later still in a demo), like a network reply would, so screens
  // must handle "not loaded yet". A read can be made to fail to show the error states.
  // Only a request that is still wanted when its answer is due counts: React's development double-mount, or a
  // quick change of month, abandons a request (its AbortSignal fires) and nobody reads that answer.
  // 'once' fails each distinct request the first time it is answered; 'second' fails the second answer of each kind.
  const read = async <T>(kind: string, request: string, signal: AbortSignal | undefined, value: () => T): Promise<T> => {
    if (readDelayMs > 0) await pause(readDelayMs)
    else await Promise.resolve()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const call = (reads.get(kind) ?? 0) + 1
    reads.set(kind, call)
    const first = !seen.has(request)
    seen.add(request)
    if (readFailureKinds && !readFailureKinds.includes(kind)) return value()
    if (readFailures === 'always' || (readFailures === 'once' && first) || (readFailures === 'second' && call === 2)) {
      throw new ApiError(500, 'internal_error', 'The mock was told to fail this read.')
    }
    return value()
  }
  const beginWrite = async (failMessage: string, invalidField: string) => {
    if (writeDelayMs > 0) await pause(writeDelayMs)
    else await Promise.resolve()
    if (writeFailures === 'always') throw new ApiError(500, 'internal_error', failMessage)
    if (failing) {
      failing = false
      throw new ApiError(500, 'internal_error', failMessage)
    }
    if (invalid && invalidField) {
      invalid = false
      throw new ApiError(422, 'invalid_field', `${invalidField}: the mock was told to refuse this.`, invalidField)
    }
  }

  return {
    today: data.today,

    loadAccounts: (signal): Promise<AccountsSnapshot> =>
      read('accounts', 'accounts', signal, () => {
        const { accounts, liquid, cards } = buildSnapshot(data)
        return { accounts, liquid, cards }
      }),

    // Like the API, each category carries its all-time transaction count (one pass over the transactions, no per-row lookups).
    loadCategories: (signal): Promise<Category[]> => read('categories', 'categories', signal, () => {
      const used = new Map<number, number>()
      for (const t of data.transactions) used.set(t.categoryId, (used.get(t.categoryId) ?? 0) + 1)
      return data.categories.map((c) => ({ ...c, usageCount: used.get(c.id) ?? 0 }))
    }),

    createCategory: async (values: CategoryValues): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'name')
      const name = values.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new ApiError(422, 'invalid_field', 'Category name cannot be empty.', 'name')
      if (data.categories.some((c) => c.type === values.type && c.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'duplicate_category_name', 'A category with this name and type already exists.', 'name')
      if (values.type === 'income' && values.defaultEnvelope) throw new ApiError(422, 'invalid_field', 'Only expense categories can have a Kakeibo default.', 'defaultEnvelope')
      const id = Math.max(0, ...data.categories.map((c) => c.id)) + 1
      data = { ...data, categories: [...data.categories, { id, name, type: values.type, defaultEnvelope: values.defaultEnvelope, iconKey: values.iconKey, colorKey: values.colorKey, archived: false }] }
    },

    updateCategory: async (id, values): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'name')
      const current = data.categories.find((c) => c.id === id)
      if (!current) throw new ApiError(404, 'not_found', 'Category not found.')
      const name = values.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new ApiError(422, 'invalid_field', 'Category name cannot be empty.', 'name')
      if (data.categories.some((c) => c.id !== id && c.type === current.type && c.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'duplicate_category_name', 'A category with this name and type already exists.', 'name')
      if (current.type === 'income' && values.defaultEnvelope) throw new ApiError(422, 'invalid_field', 'Only expense categories can have a Kakeibo default.', 'defaultEnvelope')
      data = { ...data, categories: data.categories.map((c) => c.id === id ? { ...c, name, defaultEnvelope: values.defaultEnvelope, iconKey: values.iconKey === undefined ? c.iconKey : values.iconKey, colorKey: values.colorKey === undefined ? c.colorKey : values.colorKey } : c) }
    },

    setCategoryArchived: async (id, archived): Promise<void> => {
      await beginWrite(FAILED_SAVE, '')
      if (!data.categories.some((c) => c.id === id)) throw new ApiError(404, 'not_found', 'Category not found.')
      data = { ...data, categories: data.categories.map((c) => c.id === id ? { ...c, archived } : c) }
    },

    deleteCategory: async (id): Promise<void> => {
      await beginWrite(FAILED_DELETE, '')
      if (data.transactions.some((t) => t.categoryId === id)) throw new ApiError(409, 'category_in_use', 'This category has transactions. Archive it instead.')
      if (!data.categories.some((c) => c.id === id)) throw new ApiError(404, 'not_found', 'Category not found.')
      data = { ...data, categories: data.categories.filter((c) => c.id !== id) }
    },

    loadSummary: (month: string, signal): Promise<FinancialSummary> => read('summary', `summary:${month}`, signal, () => summarize(data, month)),

    loadAnalytics: (query, signal) => read('analytics', `analytics:${query.startDate}:${query.endDate}:${query.accountId}`, signal, () => mockAnalytics(data, query)),

    loadActivity: ({ month, accountId, limit }: ActivityQuery, signal): Promise<ActivityPage> =>
      read('activity', `activity:${month}:${accountId}:${limit}`, signal, () => activityPage(data, month, accountId, limit)),

    loadAccountForEdit: async (id: number, signal: AbortSignal): Promise<AccountValues> =>
      read('account-edit', `account-edit:${id}`, signal, () => {
        const account = data.accounts.find((item) => item.id === id)
        if (!account) throw new ApiError(404, 'not_found', 'Account not found.')
        return {
          type: account.type,
          name: account.name,
          balance: amountText(account.type === 'credit_card' ? 0 : liquidBalance(account, data)),
          limit: account.creditLimit === null ? '' : amountText(account.creditLimit),
          owed: amountText(account.type === 'credit_card' ? cardStatus(account, data).signedDebt : 0),
        }
      }),

    saveEntry: async (values: EntryValues, target?: EntryTarget): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'amount')
      if (target && !entryExists(data, target)) throw new ApiError(404, 'not_found', GONE_ON_EDIT)
      // The API's ADR-021 check: only an expense may carry an envelope.
      const category = data.categories.find((c) => c.id === values.categoryId)
      const original = target?.table === 'transaction' ? data.transactions.find((t) => t.id === target.id) : undefined
      if (category?.archived && original?.categoryId !== category.id) throw new ApiError(422, 'invalid_field', 'Archived categories cannot be used for new transactions.', 'categoryId')
      if (values.envelope && category?.type !== 'expense') throw new ApiError(422, 'invalid_field', 'Income transactions cannot have a Kakeibo envelope.', 'envelope')
      data = ledgerReducer(data, target ? toUpdateAction(values, target) : toAction(values, nowIso()))
    },

    deleteEntry: async (target: EntryTarget): Promise<void> => {
      await beginWrite(FAILED_DELETE, '')
      if (!entryExists(data, target)) throw new ApiError(404, 'not_found', 'It was already deleted.')
      data = ledgerReducer(data, toDeleteAction(target))
    },

    addAccount: async (values: AccountValues, card?: string | null): Promise<number | null> => {
      await beginWrite(FAILED_SAVE, 'name')
      // The API answers 409 for a duplicate name; the mock re-checks so a second tab could not slip one through.
      const taken = validateAccount(values, buildSnapshot(data)).name
      if (taken) throw new ApiError(409, 'duplicate_account_name', taken, 'name')
      checkCard(values.type, card)
      data = ledgerReducer(data, toAccountAction(values))
      const created = data.accounts.at(-1)!
      // Like the API (ADR-020): the card choice is stored with the account.
      data = { ...data, accounts: data.accounts.map((account) => account.id === created.id ? { ...account, cardProductId: card ?? null } : account) }
      return created.id
    },

    updateAccount: async (id: number, values: AccountValues, card?: string | null): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'name')
      const existing = data.accounts.find((account) => account.id === id)
      if (!existing) throw new ApiError(404, 'not_found', 'Account not found.')
      if (existing.type !== values.type) throw new ApiError(400, 'invalid_account_type_combination', 'Account type cannot be changed after creation.', 'type')
      const taken = validateAccount(values, buildSnapshot(data), id).name
      if (taken) throw new ApiError(409, 'duplicate_account_name', taken, 'name')
      const balance = values.type === 'credit_card' ? null : parseAccountMoney(values.balance, 'balance', true)
      const owed = values.type === 'credit_card' ? parseAccountMoney(values.owed, 'owed', true) : null
      const limit = values.type === 'credit_card' ? parseAccountMoney(values.limit, 'limit') : null
      if (balance && !balance.ok) throw new ApiError(422, 'invalid_field', balance.error, 'balance')
      if (owed && !owed.ok) throw new ApiError(422, 'invalid_field', owed.error, 'owed')
      if (limit && !limit.ok) throw new ApiError(422, 'invalid_field', limit.error, 'limit')
      const updated = {
        ...existing,
        name: values.name.trim(),
        openingBalance: balance?.ok ? existing.openingBalance + balance.centavos - liquidBalance(existing, data) : 0,
        openingDebt: owed?.ok ? existing.openingDebt + owed.centavos - cardStatus(existing, data).signedDebt : 0,
        creditLimit: limit?.ok ? limit.centavos : null,
        cardProductId: card === undefined ? existing.cardProductId ?? null : card, // omitted keeps the stored card
      }
      checkCard(values.type, updated.cardProductId)
      if (Math.max(Math.abs(updated.openingBalance), Math.abs(updated.openingDebt)) > 999_999_999_999) {
        throw new ApiError(422, 'invalid_field', 'This correction exceeds the supported account range.', values.type === 'credit_card' ? 'owed' : 'balance')
      }
      data = { ...data, accounts: data.accounts.map((account) => account.id === id ? updated : account) }
    },

    loadKakeiboMonth: (month: string, signal: AbortSignal): Promise<KakeiboMonth> =>
      read('kakeibo', `kakeibo:${month}`, signal, () => kakeiboMonth(data, month)),

    loadKakeiboPlan: (month: string, signal: AbortSignal): Promise<KakeiboPlan | null> =>
      read('kakeibo-plan', `kakeibo-plan:${month}`, signal, () => kakeiboMonth(data, month).plan),

    saveKakeiboPlan: async (month: string, values: KakeiboPlanValues): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'plannedIncome')
      // The API refuses a negative amount or more than two decimal places with a 422 on that field.
      const invalid = Object.keys(validatePlan(values))[0]
      if (invalid) throw new ApiError(422, 'invalid_field', 'The request could not be validated.', invalid)
      const money = (text: string) => {
        const parsed = parsePlanAmount(text)
        return parsed.ok ? parsed.centavos : 0
      }
      const plan: KakeiboPlan = {
        month,
        plannedIncome: money(values.plannedIncome),
        allocatedStartingFunds: money(values.allocatedStartingFunds),
        savingsTarget: money(values.savingsTarget),
        priorPeriodDebtReserve: money(values.priorPeriodDebtReserve),
        limits: { needs: money(values.needsLimit), wants: money(values.wantsLimit), culture: money(values.cultureLimit), unexpected: money(values.unexpectedLimit) },
        monthlyIntention: values.monthlyIntention.trim() || null,
      }
      data = { ...data, kakeiboPlans: [...(data.kakeiboPlans ?? []).filter((p) => p.month !== month), plan] }
    },

    saveKakeiboReview: async (month: string, values: KakeiboReviewValues): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'savedDeclared')
      const invalid = Object.keys(validateReview(values))[0]
      if (invalid) throw new ApiError(422, 'invalid_field', 'The request could not be validated.', invalid)
      const saved = parseSavedDeclared(values.savedDeclared)
      const text = (value: string) => value.trim() || null
      const review = {
        month,
        savedDeclared: saved.ok ? saved.centavos : null,
        available: text(values.available),
        savings: text(values.savings),
        change: text(values.change),
        appreciated: text(values.appreciated),
        surprise: text(values.surprise),
        lesson: text(values.lesson),
        reviewedAt: nowIso(),
        snapshot: kakeiboMonthSnapshot(data, month), // taken by the "server", never sent by the screen
      }
      data = { ...data, kakeiboReviews: [...(data.kakeiboReviews ?? []).filter((r) => r.month !== month), review] }
    },

    loadKakeiboWeek: (weekStart: string, signal: AbortSignal): Promise<KakeiboWeek> =>
      read('kakeibo-week', `kakeibo-week:${weekStart}`, signal, () => {
        if (!isMonday(weekStart)) throw new ApiError(422, 'invalid_field', 'Week start must be a Monday.', 'weekStart')
        return kakeiboWeek(data, weekStart)
      }),

    saveKakeiboWeek: async (weekStart: string, notes: KakeiboWeekNotes): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'surprise')
      if (!isMonday(weekStart)) throw new ApiError(422, 'invalid_field', 'Week start must be a Monday.', 'weekStart')
      const invalid = Object.keys(validateWeekNotes(notes))[0]
      if (invalid) throw new ApiError(422, 'invalid_field', 'The request could not be validated.', invalid)
      // Like the API, the whole set is replaced: a note left blank is cleared.
      const stored = { weekStart, surprise: notes.surprise.trim(), worthwhile: notes.worthwhile.trim(), nextWeek: notes.nextWeek.trim(), updatedAt: nowIso() }
      data = { ...data, kakeiboWeekReviews: [...(data.kakeiboWeekReviews ?? []).filter((r) => r.weekStart !== weekStart), stored] }
    },

    classifyExpense: async (transactionId: number, envelope: KakeiboEnvelope | null): Promise<void> => {
      await beginWrite(FAILED_SAVE, '')
      classifications += 1
      if (failClassifyEvery > 0 && classifications % failClassifyEvery === 0) throw new ApiError(500, 'internal_error', 'The mock was told to fail this classification.')
      const row = data.transactions.find((t) => t.id === transactionId)
      if (!row) throw new ApiError(404, 'not_found', 'Transaction not found.')
      if (data.categories.find((c) => c.id === row.categoryId)?.type !== 'expense') {
        throw new ApiError(422, 'invalid_field', 'Only expense transactions can use this endpoint.', 'envelope')
      }
      // Only the envelope changes: amount, account, category, date and note stay exactly as they were.
      data = { ...data, transactions: data.transactions.map((t) => (t.id === transactionId ? { ...t, envelope } : t)) }
    },

    setCategoryEnvelope: async (categoryId: number, envelope: KakeiboEnvelope | null): Promise<void> => {
      await beginWrite(FAILED_SAVE, '')
      const category = data.categories.find((c) => c.id === categoryId)
      if (!category) throw new ApiError(404, 'not_found', 'Category not found.')
      if (category.type !== 'expense' && envelope !== null) throw new ApiError(422, 'invalid_field', 'Only expense categories can have a Kakeibo default.', 'envelope')
      // A suggestion only: saved expenses keep their envelopes.
      data = { ...data, categories: data.categories.map((c) => (c.id === categoryId ? { ...c, defaultEnvelope: envelope } : c)) }
    },
  }
}
