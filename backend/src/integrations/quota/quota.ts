/**
 * Atomic quota enforcement for external APIs using the Phase 6 pattern.
 * See Phase 6 quotes.ts for the original implementation and detailed comments.
 */

export interface QuotaTrackingClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

/**
 * Atomically increments `external_api_usage.call_count` for
 * (provider, period, operation) unless it is already at `maxCalls`. Two
 * statements: first ensure the row exists (starting at 0, `DO NOTHING` if
 * already present — this must NOT bump the counter, or the very first call
 * of a period would bypass a `maxCalls: 0` cap since the insert branch of a
 * plain upsert has no WHERE guard), then a conditional `UPDATE ...
 * WHERE call_count < maxCalls RETURNING` performs the actual claim. Returns
 * whether the call was allowed (and thus counted).
 */
export async function tryConsumeApiQuota(
  prisma: QuotaTrackingClient,
  provider: string,
  period: string,
  operation: string,
  maxCalls: number,
): Promise<boolean> {
  await prisma.$queryRawUnsafe(
    `INSERT INTO external_api_usage (id, provider, period, operation, call_count, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 0, now())
     ON CONFLICT (provider, period, operation) DO NOTHING`,
    provider,
    period,
    operation,
  )
  const rows = await prisma.$queryRawUnsafe<Array<{ call_count: number }>>(
    `UPDATE external_api_usage
     SET call_count = call_count + 1, updated_at = now()
     WHERE provider = $1 AND period = $2 AND operation = $3 AND call_count < $4
     RETURNING call_count`,
    provider,
    period,
    operation,
    maxCalls,
  )
  return rows.length > 0
}

/**
 * Daily period key (UTC) for providers with per-day caps.
 */
export function dailyPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}
