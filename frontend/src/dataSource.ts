import type { AccountsSnapshot, ActivityPage, Category, EntryTarget, EntryValues, FinancialSummary } from './types.ts'
import type { AccountValues } from './lib/accountForm.ts'

/*
 * The seam between the screens and wherever the numbers come from (Milestone 4.8, "S1" in docs/design/API_CLIENT_PLAN.md).
 * Screens ask a DataSource for figures and send writes to it; they never read or calculate from stored rows.
 * The mock (src/mockSource.ts) and HTTP implementation (src/httpSource.ts) use the same methods and shapes,
 * so screens do not need to know which source is active.
 * Reads take an AbortSignal; a write resolves on success and rejects with an ApiError on failure.
 */
export interface ActivityQuery {
  month: string // "YYYY-MM"
  accountId: number | null // an entry matches if it uses the account (a card payment: either side)
  limit: number // rows to show; the source works out whether there are more
}

export interface DataSource {
  /** Today's calendar date, "YYYY-MM-DD", in the person's own time zone (the mock uses a fixed day). */
  readonly today: string
  loadAccounts(signal: AbortSignal): Promise<AccountsSnapshot>
  loadCategories(signal: AbortSignal): Promise<Category[]>
  loadSummary(month: string, signal: AbortSignal): Promise<FinancialSummary>
  loadActivity(query: ActivityQuery, signal: AbortSignal): Promise<ActivityPage>
  loadAccountForEdit(id: number, signal: AbortSignal): Promise<AccountValues>
  /** Create (no target) or replace (target) an expense, income or card payment. */
  saveEntry(values: EntryValues, target?: EntryTarget): Promise<void>
  deleteEntry(target: EntryTarget): Promise<void>
  addAccount(values: AccountValues): Promise<void>
  updateAccount(id: number, values: AccountValues): Promise<void>
}

/**
 * A failed request, in the API's own terms (docs/design/API_CLIENT_PLAN.md, N1): an HTTP status, a stable
 * `code`, a message that is safe to show, and the `field` it concerns when there is one.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string
  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

export const isNotFound = (err: unknown): boolean => err instanceof ApiError && err.status === 404

/** The messages the spec gives for failed writes. */
export const FAILED_SAVE = "Couldn't save. Check your connection and try again. Your entry is still here."
export const FAILED_DELETE = "Couldn't delete. Nothing was changed. Try again."
export const GONE_ON_EDIT = 'This entry was removed, maybe in another tab. Your changes are still here.'
