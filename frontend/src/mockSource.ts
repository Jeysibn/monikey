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

export interface MockOptions {
  scenario?: DemoScenario | null
  failNextWrite?: boolean
}

export function createMockSource({ scenario = null, failNextWrite = false }: MockOptions = {}): DataSource {
  let data: MockData = getMockData(scenario)
  let failing = failNextWrite

  // Answers arrive on a later turn, like a network reply would, so screens must handle "not loaded yet".
  const later = async <T>(value: () => T): Promise<T> => {
    await Promise.resolve()
    return value()
  }
  const failOnce = (message: string) => {
    if (!failing) return
    failing = false
    throw new ApiError(500, 'internal_error', message)
  }

  return {
    today: data.today,

    loadAccounts: (): Promise<AccountsSnapshot> =>
      later(() => {
        const { accounts, liquid, cards } = buildSnapshot(data)
        return { accounts, liquid, cards }
      }),

    loadCategories: (): Promise<Category[]> => later(() => data.categories),

    loadSummary: (month: string): Promise<FinancialSummary> => later(() => summarize(data, month)),

    loadActivity: ({ month, accountId, limit }: ActivityQuery): Promise<ActivityPage> =>
      later(() => activityPage(data, month, accountId, limit)),

    saveEntry: async (values: EntryValues, target?: EntryTarget): Promise<void> => {
      await Promise.resolve()
      failOnce(FAILED_SAVE)
      if (target && !entryExists(data, target)) throw new ApiError(404, 'not_found', GONE_ON_EDIT)
      data = ledgerReducer(data, target ? toUpdateAction(values, target) : toAction(values, nowIso()))
    },

    deleteEntry: async (target: EntryTarget): Promise<void> => {
      await Promise.resolve()
      failOnce(FAILED_DELETE)
      if (!entryExists(data, target)) throw new ApiError(404, 'not_found', 'It was already deleted.')
      data = ledgerReducer(data, toDeleteAction(target))
    },

    addAccount: async (values: AccountValues): Promise<void> => {
      await Promise.resolve()
      failOnce(FAILED_SAVE)
      // The API answers 409 for a duplicate name; the mock re-checks so a second tab could not slip one through.
      const taken = validateAccount(values, buildSnapshot(data)).name
      if (taken) throw new ApiError(409, 'duplicate_account_name', taken, 'name')
      data = ledgerReducer(data, toAccountAction(values))
    },
  }
}
