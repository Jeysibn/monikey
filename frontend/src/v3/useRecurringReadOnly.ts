import { useAsyncFinanceOptional } from '../state/asyncFinanceContext'
import { useRecurring } from '../hooks/useRecurring'
import type { RecurringItem } from '../domain/recurring'

/**
 * Read-only recurring items for display. Backend mode reads what the provider loaded from GET /recurring; demo mode reads the
 * local seed. Nothing here exposes mark-paid, status changes or any write, so opening Planning can never record a payment.
 */
export function useAsyncRecurringItems(): RecurringItem[] {
  const asyncFinance = useAsyncFinanceOptional()
  const local = useRecurring()
  return asyncFinance ? asyncFinance.recurringItems : local.items
}
