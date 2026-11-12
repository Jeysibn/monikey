import type { DataSource } from '../dataSource.ts'
import type { ActivityItem } from '../types.ts'
import { monthOf } from './finance.ts'

/*
 * The few most recent entries of one account, for its details panel. It reuses the Activity read the Activity screen
 * uses (an entry matches if it uses the account; a card payment matches on either side), so there is no separate
 * endpoint and the same rules apply. The read is month-based, so it takes the current month first and, only when that
 * has fewer than `count` entries, tops up from the previous month. It never invents entries or balances.
 */
export const RECENT_ACCOUNT_ENTRIES = 5

const previousMonth = (month: string): string => {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year!, number! - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function loadRecentAccountActivity(
  source: Pick<DataSource, 'loadActivity'>,
  today: string,
  accountId: number,
  signal: AbortSignal,
  count = RECENT_ACCOUNT_ENTRIES,
): Promise<ActivityItem[]> {
  const month = monthOf(today)
  const current = (await source.loadActivity({ month, accountId, limit: count }, signal)).items.slice(0, count)
  if (current.length >= count) return current
  const earlier = (await source.loadActivity({ month: previousMonth(month), accountId, limit: count - current.length }, signal)).items.slice(0, count - current.length)
  return [...current, ...earlier]
}
