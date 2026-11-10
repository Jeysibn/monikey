import type {
  AccountsSnapshot,
  AnalyticsReport,
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
} from './types.ts'
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

export interface CategoryValues {
  name: string
  type: 'income' | 'expense'
  defaultEnvelope: KakeiboEnvelope | null
  iconKey?: string | null
}

export interface DataSource {
  /** Today's calendar date, "YYYY-MM-DD", in the person's own time zone (the mock uses a fixed day). */
  readonly today: string
  loadAccounts(signal: AbortSignal): Promise<AccountsSnapshot>
  loadCategories(signal: AbortSignal): Promise<Category[]>
  createCategory(values: CategoryValues): Promise<void>
  updateCategory(id: number, values: Pick<CategoryValues, 'name' | 'defaultEnvelope' | 'iconKey'>): Promise<void>
  setCategoryArchived(id: number, archived: boolean): Promise<void>
  deleteCategory(id: number): Promise<void>
  loadSummary(month: string, signal: AbortSignal): Promise<FinancialSummary>
  loadAnalytics(query: { startDate: string; endDate: string; accountId: number | null }, signal: AbortSignal): Promise<AnalyticsReport>
  loadActivity(query: ActivityQuery, signal: AbortSignal): Promise<ActivityPage>
  /** Current balance or signed card debt, never the original opening amount. */
  loadAccountForEdit(id: number, signal: AbortSignal): Promise<AccountValues>
  /** Create (no target) or replace (target) an expense, income, card payment or account transfer. */
  saveEntry(values: EntryValues, target?: EntryTarget): Promise<void>
  deleteEntry(target: EntryTarget): Promise<void>
  /**
   * Resolves with the new account's ID when the server reports one (null otherwise). `card` (ADR-020) is sent
   * only when given; pass it only to a server whose accounts carry `cardProductId`.
   */
  addAccount(values: AccountValues, card?: string | null): Promise<number | null>
  /** `card` undefined keeps the stored card; null clears it. */
  updateAccount(id: number, values: AccountValues, card?: string | null): Promise<void>

  /* Kakeibo (ADR-021). Months are "YYYY-MM". Plans are planning figures: saving one never changes the ledger. */
  /** The month's plan and its ledger actuals, every total worked out by the server (the dashboard). */
  loadKakeiboMonth(month: string, signal: AbortSignal): Promise<KakeiboMonth>
  /** The month's stored plan, read fresh for the plan form; null when the month has none. */
  loadKakeiboPlan(month: string, signal: AbortSignal): Promise<KakeiboPlan | null>
  /** Create or replace the month's plan. */
  saveKakeiboPlan(month: string, values: KakeiboPlanValues): Promise<void>
  /**
   * Save the month-end reflection. The server replaces every answer and takes a fresh snapshot of the month's
   * ledger totals; the browser never sends totals. On a month with no plan the server also stores the plan
   * amounts at ₱0.00.
   */
  saveKakeiboReview(month: string, values: KakeiboReviewValues): Promise<void>
  /** One Monday-to-Sunday week ("YYYY-MM-DD", a Monday): its totals and notes. */
  loadKakeiboWeek(weekStart: string, signal: AbortSignal): Promise<KakeiboWeek>
  /** Replace the week's three notes (all three are always sent; a blank note is saved as empty). */
  saveKakeiboWeek(weekStart: string, notes: KakeiboWeekNotes): Promise<void>
  /** Set or clear (null) one expense's envelope, and nothing else about it. Refused for income. */
  classifyExpense(transactionId: number, envelope: KakeiboEnvelope | null): Promise<void>
  /** Set or clear an expense category's suggested envelope. Saved expenses keep their envelopes. */
  setCategoryEnvelope(categoryId: number, envelope: KakeiboEnvelope | null): Promise<void>
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
