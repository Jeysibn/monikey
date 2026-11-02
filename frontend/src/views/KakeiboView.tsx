import { NotebookPen, Plus } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock, UpdatingStamp } from '@/components/ErrorBlock'
import { MoneyText } from '@/components/MoneyText'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { EnvelopeCard } from '@/components/kakeibo/EnvelopeCard'
import { PlanSummary } from '@/components/kakeibo/PlanSummary'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { isNotFound } from '@/dataSource'
import { monthLabel, monthOptions } from '@/lib/finance'
import { ENVELOPES } from '@/lib/kakeibo'
import { formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { Resource } from '@/useResource'
import type { AddState, KakeiboMonth } from '@/types'

/*
 * Kakeibo (ADR-021): a simple monthly budget on top of the ledger. It answers, in order: how much do I plan
 * to earn, how much will I save first, how much can I give to spending, how much have I spent in each of the
 * four envelopes, and how much is left in each. Every figure comes from one server report for the month, so
 * nothing here is added up in the browser. Phone order: plan, envelopes, not yet classified. From 1024px the
 * plan and the unclassified card share the left column and the envelopes sit on the right.
 * The month is shared with Overview and Activity, so switching views keeps it.
 */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-chip bg-secondary ${className}`} />
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 lg:items-start">
      <Card className="lg:col-span-5">
        <Bar className="h-6 w-48" />
        <div className="mt-5 grid gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between">
              <Bar className="h-4 w-32" />
              <Bar className="h-4 w-24" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
        {ENVELOPES.map((envelope) => (
          <Card key={envelope} className="grid gap-4">
            <Bar className="h-10 w-36" />
            <Bar className="h-6 w-full" />
            <Bar className="h-2.5 w-full rounded-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}

function Unclassified({ report, onOpenActivity }: { report: KakeiboMonth; onOpenActivity: () => void }) {
  const label = monthLabel(report.month)
  return (
    <Card role="region" aria-labelledby="kakeibo-unclassified-title" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <CardTitle id="kakeibo-unclassified-title">Not yet classified</CardTitle>
        <MoneyText centavos={report.unclassifiedExpenses} className="text-lg font-semibold" />
      </div>
      {report.totalExpenses === 0 ? (
        <CardDescription className="mb-0">No expenses recorded in {label} yet.</CardDescription>
      ) : report.unclassifiedExpenses === 0 ? (
        <CardDescription className="mb-0">Every expense in {label} has an envelope.</CardDescription>
      ) : (
        <>
          <CardDescription>
            Expenses without an envelope. They&rsquo;re still counted in this month&rsquo;s total expenses of{' '}
            {formatPeso(report.totalExpenses)}.
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            To classify one now, edit it in Activity. Sorting many earlier expenses at once is planned for a later update.
          </p>
          <Button variant="secondary" className="mt-3" onClick={onOpenActivity}>
            Open {label} activity
          </Button>
        </>
      )}
    </Card>
  )
}

export function KakeiboView({
  today,
  month,
  kakeibo,
  loading: forcedLoading,
  addState,
  onMonthChange,
  onAdd,
  onEditPlan,
  onOpenActivity,
}: {
  today: string
  month: string
  kakeibo: Resource<KakeiboMonth>
  loading: boolean // ?demo=loading
  addState: AddState
  onMonthChange: (month: string) => void
  onAdd: () => void
  onEditPlan: () => void
  onOpenActivity: (month: string) => void
}) {
  // While another month loads, keep showing the last report only if it is for the month asked for.
  const report = kakeibo.data?.month === month ? kakeibo.data : undefined
  const waiting = forcedLoading || (!report && !kakeibo.error)
  const updating = useDelayedFlag(kakeibo.stale && !!report, 400)
  const unavailable = kakeibo.error && isNotFound(kakeibo.error) // an API from before Kakeibo has no such route
  const hasPlan = report?.plan != null
  const label = monthLabel(month)

  return (
    <div aria-busy={waiting}>
      <p role="status" className="sr-only">
        {waiting ? 'Loading your Kakeibo plan' : ''}
      </p>
      <PageHeader title="Kakeibo" onAdd={onAdd} addState={addState}>
        <UpdatingStamp show={updating} />
        <MonthSelect value={month} options={monthOptions(today)} onChange={onMonthChange} id="kakeibo-month" />
        {!waiting && !kakeibo.error && report && (
          <Button variant="secondary" onClick={onEditPlan} aria-label={`${hasPlan ? 'Edit' : 'Create'} the ${label} plan`}>
            {hasPlan ? <NotebookPen aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {hasPlan ? 'Edit plan' : 'Create plan'}
          </Button>
        )}
      </PageHeader>
      <p className="-mt-2 mb-[18px] max-w-[62ch] text-[0.9375rem] text-muted-foreground">
        Plan what comes in and what you&rsquo;ll save first, then give each kind of spending a limit. Card payments and
        transfers never count as spending.
      </p>

      {unavailable ? (
        <EmptyState message="Kakeibo needs a newer version of the MoniKey server. Your accounts and activity are not affected." />
      ) : kakeibo.error ? (
        <ErrorBlock what="your Kakeibo plan" updatedAt={kakeibo.updatedAt} onRetry={kakeibo.retry} focusAfter="main h1" />
      ) : waiting || !report ? (
        <Skeleton />
      ) : (
        // One DOM order for every width (plan, envelopes, unclassified); from 1024px the grid places the
        // unclassified card under the plan, and the second row takes any extra height so no gap opens up.
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start">
          <div className="min-w-0 lg:col-span-5 lg:row-start-1">
            <PlanSummary report={report} />
          </div>
          <section aria-labelledby="kakeibo-envelopes-title" className="min-w-0 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id="kakeibo-envelopes-title" className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] md:text-xl">
                Envelopes
              </h2>
              <p className="text-sm text-muted-foreground">
                {report.totalExpenses === 0 ? `No expenses recorded in ${label} yet.` : 'Spending this month, by envelope'}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {ENVELOPES.map((envelope) => (
                <EnvelopeCard key={envelope} envelope={envelope} report={report.envelopes[envelope]} />
              ))}
            </div>
          </section>
          <div className="min-w-0 lg:col-span-5 lg:row-start-2">
            <Unclassified report={report} onOpenActivity={() => onOpenActivity(month)} />
          </div>
        </div>
      )}
    </div>
  )
}
