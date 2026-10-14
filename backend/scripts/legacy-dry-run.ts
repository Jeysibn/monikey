/**
 * Read-only legacy data compatibility dry-run (Stage 7A).
 * Runs inside a READ ONLY transaction: any write attempt fails at the database.
 * Point DATABASE_URL at an ISOLATED COPY only. Never normalizes anything.
 * The client-side offline outbox (IndexedDB) is not visible from SQL.
 */
import { PrismaClient } from '@prisma/client'

type Row = Record<string, unknown>
export type DryRunReport = Record<string, { count: number; sample: Row[] }>

const CHECKS: Record<string, string> = {
  favoriteRankAnomalies: `SELECT id, user_id, favorite_rank, archived_at FROM financial_accounts
    WHERE favorite_rank IS NOT NULL AND (favorite_rank NOT BETWEEN 1 AND 4 OR archived_at IS NOT NULL)`,
  archivedAccountsOnActiveBills: `SELECT r.id, r.merchant, r.account_id FROM recurring_items r
    JOIN financial_accounts a ON a.id = r.account_id
    WHERE r.status = 'active' AND a.archived_at IS NOT NULL`,
  archivedCategoriesOnActiveBills: `SELECT r.id, r.merchant, r.category_id FROM recurring_items r
    JOIN categories c ON c.id = r.category_id
    WHERE r.status = 'active' AND c.archived_at IS NOT NULL`,
  budgetPeriodsOddDateSemantics: `SELECT id, user_id, period_start, period_end FROM budget_periods
    WHERE period_end < period_start
       OR period_start <> date_trunc('month', period_start)::date
       OR period_end <> (date_trunc('month', period_start) + interval '1 month - 1 day')::date`,
  budgetPeriodsOverlapping: `SELECT a.id, b.id AS other_id, a.user_id FROM budget_periods a
    JOIN budget_periods b ON a.user_id = b.user_id AND a.id < b.id
    AND a.period_start <= b.period_end AND b.period_start <= a.period_end`,
  legacyAutoPostedWithoutOccurrence: `SELECT t.id, t.user_id, t.idempotency_key, t.occurred_on FROM transactions t
    WHERE t.source = 'recurring' AND NOT EXISTS (SELECT 1 FROM recurring_occurrences o WHERE o.transaction_id = t.id)`,
  driftedDueDates: `SELECT id, merchant, frequency, next_due_date FROM recurring_items
    WHERE anchor_day IS NULL AND frequency = 'monthly' AND extract(day from next_due_date) BETWEEN 28 AND 30`,
  staleDueDateVersusLegacyKeys: `SELECT r.id, r.merchant, r.next_due_date, max(t.occurred_on) AS last_posted FROM recurring_items r
    JOIN transactions t ON t.idempotency_key LIKE 'recurring:' || r.id::text || ':%'
    GROUP BY r.id HAVING max(t.occurred_on) >= r.next_due_date`,
  pausedBillsPossiblyAutoPaused: `SELECT id, merchant, status, updated_at FROM recurring_items WHERE status <> 'active'`,
  netWorthSnapshotGaps: `SELECT user_id, snapshot_date, lag(snapshot_date) OVER (PARTITION BY user_id ORDER BY snapshot_date) AS prev
    FROM daily_finance_snapshots`,
  netWorthSnapshotInconsistent: `SELECT user_id, snapshot_date FROM daily_finance_snapshots
    WHERE net_worth_minor <> asset_total_minor - liability_total_minor`,
}

export async function runLegacyDryRun(prisma: PrismaClient): Promise<DryRunReport> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      const report: DryRunReport = {}
      for (const [name, sql] of Object.entries(CHECKS)) {
        let rows = (await tx.$queryRawUnsafe(sql)) as Row[]
        if (name === 'netWorthSnapshotGaps') {
          rows = rows.filter((r) => r.prev && (new Date(r.snapshot_date as string).getTime() - new Date(r.prev as string).getTime()) > 86_400_000)
        }
        report[name] = { count: rows.length, sample: rows.slice(0, 5) }
      }
      return report
    },
    { isolationLevel: 'RepeatableRead' },
  )
}

if (process.argv[1]?.endsWith('legacy-dry-run.ts')) {
  const prisma = new PrismaClient()
  const report = await runLegacyDryRun(prisma)
  console.log(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
  await prisma.$disconnect()
}
