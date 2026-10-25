import { ApiError, FAILED_DELETE, FAILED_SAVE, GONE_ON_EDIT, type ActivityQuery, type DataSource } from './dataSource.ts'
import { toAccountAction, entryExists, ledgerReducer, toAction, toDeleteAction, toUpdateAction } from './lib/ledger.ts'
import { validateAccount, type AccountValues } from './lib/accountForm.ts'
import { activityPage, buildSnapshot, summarize } from './lib/finance.ts'
import { getMockData, type DemoScenario } from './mockData.ts'
import type { AccountsSnapshot, ActivityPage, Category, EntryTarget, EntryValues, FinancialSummary, MockData } from './types.ts'

/*
 * The mock behind the DataSource seam. It keeps the fictional ledger in memory, applies writes with the same
 * reducer as before, and answers every read with the shapes the API will use (balances, owed, credit and
 * available credit already worked out). A reload restores the starting data.
 * `failNextWrite` makes the first save, delete or new account fail once, to show the error paths
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
  readFailureKinds?: string[] | null // only these kinds of read fail (accounts, categories, summary, activity); all if omitted (?failing=summary)
  writeFailures?: 'always' | null // ?demo=offline: no write goes through
  readDelayMs?: number // ?demo=slow: every read takes this long
  writeDelayMs?: number // ?demo=slow: every write takes this long (long enough to show the "taking longer" notice)
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createMockSource({
  scenario = null,
  failNextWrite = false,
  invalidNextWrite = false,
  readFailures = null,
  readFailureKinds = null,
  writeFailures = null,
  readDelayMs = 0,
  writeDelayMs = 0,
}: MockOptions = {}): DataSource {
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

    loadCategories: (signal): Promise<Category[]> => read('categories', 'categories', signal, () => data.categories),

    loadSummary: (month: string, signal): Promise<FinancialSummary> => read('summary', `summary:${month}`, signal, () => summarize(data, month)),

    loadActivity: ({ month, accountId, limit }: ActivityQuery, signal): Promise<ActivityPage> =>
      read('activity', `activity:${month}:${accountId}:${limit}`, signal, () => activityPage(data, month, accountId, limit)),

    saveEntry: async (values: EntryValues, target?: EntryTarget): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'amount')
      if (target && !entryExists(data, target)) throw new ApiError(404, 'not_found', GONE_ON_EDIT)
      data = ledgerReducer(data, target ? toUpdateAction(values, target) : toAction(values, nowIso()))
    },

    deleteEntry: async (target: EntryTarget): Promise<void> => {
      await beginWrite(FAILED_DELETE, '')
      if (!entryExists(data, target)) throw new ApiError(404, 'not_found', 'It was already deleted.')
      data = ledgerReducer(data, toDeleteAction(target))
    },

    addAccount: async (values: AccountValues): Promise<void> => {
      await beginWrite(FAILED_SAVE, 'name')
      // The API answers 409 for a duplicate name; the mock re-checks so a second tab could not slip one through.
      const taken = validateAccount(values, buildSnapshot(data)).name
      if (taken) throw new ApiError(409, 'duplicate_account_name', taken, 'name')
      data = ledgerReducer(data, toAccountAction(values))
    },
  }
}
