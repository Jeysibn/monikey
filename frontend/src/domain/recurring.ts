// Domain types for the Recurring & Bills page. Mirrors the doc-comment style
// of `domain/finance.ts` — types only, no mock values and no calculation
// logic. Mock seed data and mutation logic live in `hooks/useRecurring.ts`.
//
// This slice is deliberately self-contained (see `useRecurring.ts`): a
// `RecurringItem` references an existing `Account`/`CreditCard` id and
// `Category` id from the shared finance domain (`domain/finance.ts`) by id
// only — resolved to a display label through `useFinance()`, read-only,
// exactly like a `Transaction` does — but this slice is NOT wired into
// `FinanceState`/`FinanceProvider`. Another engineer owns that integration.

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

/**
 * Explicit, user-controlled state (paused via the Pause/Resume action).
 * Separate from `RecurringDueState`, which is derived from `nextDueDate` and
 * the app clock rather than stored.
 */
export type RecurringStatus = 'active' | 'paused'

/**
 * A due-date urgency derived from an item's `nextDueDate`, its `status`, and
 * the injected clock's `todayIso` — never stored, and never computed with
 * `new Date()`. See `dueStateOf` in `hooks/useRecurring.ts`.
 */
export type RecurringDueState = 'overdue' | 'due_soon' | 'scheduled' | 'paused'

export interface RecurringItem {
  id: string
  /** Payee/merchant name, e.g. "Netflix" or "Meralco". */
  merchant: string
  /** The amount charged each occurrence, at the item's own `frequency` (not normalized to monthly). */
  amount: number
  frequency: RecurringFrequency
  /** The next date this item is due, `YYYY-MM-DD`. */
  nextDueDate: string
  /** References an Account or CreditCard id — resolved to a display label via `useFinance().accountLabel`, never duplicated as text. */
  accountId: string
  /** References a Category id — resolved via `useFinance().categoryName`/`categoryColor`, never duplicated as text. */
  categoryId: string
  /** Whether this bill is charged automatically rather than paid manually. */
  autopay: boolean
  status: RecurringStatus
  /** Set by "Mark as paid" to the `todayIso` at the time it was recorded. */
  lastPaidDate?: string
}

export interface AddRecurringItemInput {
  merchant: string
  amount: number
  frequency: RecurringFrequency
  nextDueDate: string
  accountId: string
  categoryId: string
  autopay: boolean
}
