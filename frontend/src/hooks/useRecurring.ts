import { useCallback, useRef, useState } from 'react'
import type { AddRecurringItemInput, RecurringDueState, RecurringFrequency, RecurringItem } from '../domain/recurring'
import { addDaysToIso, isIsoDateBefore, isIsoDateWithinInclusive, isoFromLocalDate, localDateFromIso } from '../utils/date'

/**
 * Self-contained mock seed data for the Recurring & Bills page (see the
 * doc-comment on `RecurringItem` in `domain/recurring.ts`). `accountId`/
 * `categoryId` reference ids from the shared mock dataset in
 * `services/mockFinanceRepository.ts` (read only, never mutated here) so
 * `useFinance().accountLabel`/`categoryName`/`categoryColor` resolve them to
 * real labels — this file just keeps its own copy of those ids in sync by
 * hand, since this hook deliberately does not read that repository.
 *
 * Dates are written around the app's fixed demo clock (`DEMO_TODAY_ISO`,
 * `2026-08-29` — see `utils/clock.ts`) so the seeded mix of overdue/due-soon/
 * scheduled/paused items reads correctly whenever the demo is opened.
 */
const SEED_RECURRING_ITEMS: RecurringItem[] = [
  { id: 'rec-netflix', merchant: 'Netflix', amount: 15, frequency: 'monthly', nextDueDate: '2026-09-01', accountId: 'visa', categoryId: 'subscriptions', autopay: true, status: 'active' },
  { id: 'rec-spotify', merchant: 'Spotify', amount: 9.5, frequency: 'monthly', nextDueDate: '2026-09-12', accountId: 'mastercard', categoryId: 'subscriptions', autopay: true, status: 'active' },
  { id: 'rec-internet', merchant: 'PLDT Internet', amount: 45, frequency: 'monthly', nextDueDate: '2026-08-27', accountId: 'checking', categoryId: 'utilities', autopay: false, status: 'active' },
  { id: 'rec-electricity', merchant: 'Meralco', amount: 64.1, frequency: 'monthly', nextDueDate: '2026-09-04', accountId: 'savings', categoryId: 'utilities', autopay: false, status: 'active' },
  { id: 'rec-rent', merchant: 'Landlord — Unit 4B', amount: 850, frequency: 'monthly', nextDueDate: '2026-09-05', accountId: 'checking', categoryId: 'housing', autopay: false, status: 'active' },
  { id: 'rec-insurance', merchant: 'Sun Life Insurance', amount: 1200, frequency: 'yearly', nextDueDate: '2027-01-15', accountId: 'savings', categoryId: 'debt', autopay: false, status: 'active' },
  { id: 'rec-loan', merchant: 'Personal Loan Payment', amount: 220, frequency: 'monthly', nextDueDate: '2026-09-10', accountId: 'checking', categoryId: 'debt', autopay: true, status: 'active' },
  { id: 'rec-cc-payment', merchant: 'Visa Platinum Payment', amount: 75, frequency: 'monthly', nextDueDate: '2026-08-29', accountId: 'checking', categoryId: 'debt', autopay: false, status: 'paused' },
]

/**
 * Converts an item's per-occurrence amount into a monthly-equivalent figure
 * so weekly/monthly/yearly items can be summed into one "monthly recurring
 * spend" KPI: weekly is annualized (×52) then divided by 12, yearly is
 * divided by 12, monthly passes through unchanged.
 */
export function monthlyEquivalent(amount: number, frequency: RecurringFrequency): number {
  if (frequency === 'weekly') return (amount * 52) / 12
  if (frequency === 'yearly') return amount / 12
  return amount
}

/**
 * The due-date urgency shown on each item's status badge. A paused item
 * always reads `'paused'` regardless of its date — pausing intentionally
 * takes it out of the due-date conversation. Otherwise: `'overdue'` if
 * `nextDueDate` is strictly before `todayIso`, `'due_soon'` if it falls
 * within the next 7 days (inclusive of today and of day 7), else
 * `'scheduled'`.
 *
 * TR-001-style discipline: takes `todayIso` as a parameter rather than
 * reading a clock itself — callers always pass `useFinance().todayIso`.
 */
export function dueStateOf(item: RecurringItem, todayIso: string): RecurringDueState {
  if (item.status === 'paused') return 'paused'
  if (isIsoDateBefore(item.nextDueDate, todayIso)) return 'overdue'
  const dueSoonEnd = addDaysToIso(todayIso, 7)
  if (isIsoDateWithinInclusive(item.nextDueDate, todayIso, dueSoonEnd)) return 'due_soon'
  return 'scheduled'
}

/**
 * The next occurrence's due date after `iso`, per `frequency`. Built from
 * `utils/date.ts`'s `localDateFromIso`/`isoFromLocalDate` (the same
 * local-midnight round-trip `addDaysToIso` itself uses) rather than any new
 * date parsing, so leap years and month-length differences are handled by
 * the `Date` constructor exactly the way the rest of the app already relies
 * on.
 */
function advanceDueDate(iso: string, frequency: RecurringFrequency): string {
  if (frequency === 'weekly') return addDaysToIso(iso, 7)
  const date = localDateFromIso(iso)
  if (!date) throw new Error(`advanceDueDate received an invalid date: "${iso}".`)
  if (frequency === 'monthly') {
    return isoFromLocalDate(new Date(date.getFullYear(), date.getMonth() + 1, date.getDate()))
  }
  return isoFromLocalDate(new Date(date.getFullYear() + 1, date.getMonth(), date.getDate()))
}

/**
 * Owns the Recurring & Bills page's local, in-memory data slice: seed data
 * plus pause/resume/mark-as-paid/add mutations via `useState`. Deliberately
 * NOT wired into `FinanceProvider`/`mockFinanceRepository` — this hook is a
 * self-contained mock for this page only.
 */
export function useRecurring() {
  const [items, setItems] = useState<RecurringItem[]>(SEED_RECURRING_ITEMS)
  const nextSeq = useRef(1)

  const pauseItem = useCallback((id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'paused' } : item)))
  }, [])

  const resumeItem = useCallback((id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'active' } : item)))
  }, [])

  /** Records a payment and rolls `nextDueDate` forward to the next occurrence. */
  const markAsPaid = useCallback((id: string, todayIso: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, nextDueDate: advanceDueDate(item.nextDueDate, item.frequency), lastPaidDate: todayIso } : item,
      ),
    )
  }, [])

  const addItem = useCallback((input: AddRecurringItemInput): RecurringItem => {
    const item: RecurringItem = { id: `rec-new-${nextSeq.current++}`, status: 'active', ...input }
    setItems((prev) => [...prev, item])
    return item
  }, [])

  const editItem = useCallback((id: string, input: Partial<AddRecurringItemInput>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...input } : item)))
  }, [])

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  return { items, pauseItem, resumeItem, markAsPaid, addItem, editItem, deleteItem }
}
