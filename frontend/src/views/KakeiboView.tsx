import { useState } from 'react'
import { ListChecks, NotebookPen, Plus } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock, UpdatingStamp } from '@/components/ErrorBlock'
import { MoneyText } from '@/components/MoneyText'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { EnvelopeCard } from '@/components/kakeibo/EnvelopeCard'
import { MonthlyReviewCard } from '@/components/kakeibo/MonthlyReview'
import { WeeklyReviewCard } from '@/components/kakeibo/WeeklyReview'
import { NoPlanCard, PlanDetails } from '@/components/kakeibo/PlanDetails'
import { PlanHero } from '@/components/kakeibo/PlanHero'
import { Tabs } from '@/components/Tabs'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { isNotFound } from '@/dataSource'
import { monthLabel, monthOptions } from '@/lib/finance'
import { ENVELOPES } from '@/lib/kakeibo'
import { panelId, tabId } from '@/lib/tabIds'
import { formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { Resource } from '@/useResource'
import type { AddState, KakeiboMonth, KakeiboReviewValues, KakeiboWeek, KakeiboWeekNotes } from '@/types'

/*
 * Kakeibo (ADR-021): a simple monthly budget on top of the ledger, in two tabs (spec section 6).
 * "Plan & Progress" answers, in order: how much is set aside for the four envelopes, how much of each has been
 * spent and what is left, which expenses still have no envelope, and what the plan itself says (folded away).
 * "Reflections" holds the optional weekly check-in and the month-end reflection. Every figure comes from one
 * server report for the month; the only arithmetic in the browser is display-only (see `planProgress`).
 * Savings targets are goals, never money saved, and expenses with no envelope stay in the month's total.
 * The tabs only switch what is shown on this page. The month is shared with Overview and Activity.
 * Which envelope a category suggests is managed in Categories, so this page links there.
 */
type KakeiboTab = 'plan' | 'reflect'
const TABS: { id: KakeiboTab; label: string }[] = [
  { id: 'plan', label: 'Plan & Progress' },
  { id: 'reflect', label: 'Reflections' },
]
const TAB_PREFIX = 'kakeibo'

function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-chip bg-secondary ${className}`} />
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 lg:items-start">
      <div className="rounded-card bg-hero/90 p-5 lg:col-span-12">
        <span className="block h-4 w-40 rounded-chip bg-white/25" />
        <span className="mt-3 block h-9 w-56 rounded-chip bg-white/25" />
        <span className="mt-4 block h-2.5 w-full rounded-full bg-white/20" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-7 lg:grid-cols-1 xl:grid-cols-2">
        {ENVELOPES.map((envelope) => (
          <Card key={envelope} className="grid gap-4">
            <Bar className="h-10 w-36" />
            <Bar className="h-6 w-full" />
            <Bar className="h-2.5 w-full rounded-full" />
          </Card>
        ))}
      </div>
      <Card className="lg:col-span-5">
        <Bar className="h-6 w-48" />
        <div className="mt-5 grid gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <Bar className="h-4 w-32" />
              <Bar className="h-4 w-24" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Unclassified({ report, onClassify }: { report: KakeiboMonth; onClassify: () => void }) {
  const label = monthLabel(report.month)
  return (
    <Card role="region" aria-labelledby="kakeibo-unclassified-title" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <CardTitle id="kakeibo-unclassified-title">Not yet classified</CardTitle>
        <MoneyText centavos={report.unclassifiedExpenses} className="text-lg font-semibold" />
      </div>
      {report.totalExpenses === 0 ? (
        <CardDescription className="mb-0">No expenses recorded in {label} yet.</CardDescription>
      ) : (
        <>
          <CardDescription>
            {report.unclassifiedExpenses === 0
              ? `Every expense in ${label} has an envelope. You can still move one to a different envelope.`
              : `Expenses without an envelope. They’re still counted in this month’s total expenses of ${formatPeso(report.totalExpenses)}.`}
          </CardDescription>
          <Button variant="secondary" className="mt-1 h-auto min-h-11 max-w-full whitespace-normal py-2" onClick={onClassify}>
            <ListChecks aria-hidden="true" />
            Classify expenses
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
  weeks,
  weekStart,
  week,
  onWeekChange,
  onSaveWeek,
  onSaveReview,
  onClassify,
  onManageCategories,
  onDialogOpen,
  onDialogClosed,
}: {
  today: string
  month: string
  kakeibo: Resource<KakeiboMonth>
  loading: boolean // ?demo=loading
  addState: AddState
  onMonthChange: (month: string) => void
  onAdd: () => void
  onEditPlan: () => void
  weeks: string[]
  weekStart: string
  week: Resource<KakeiboWeek>
  onWeekChange: (weekStart: string) => void
  onSaveWeek: (weekStart: string, notes: KakeiboWeekNotes) => Promise<void>
  onSaveReview: (month: string, values: KakeiboReviewValues) => Promise<void>
  onClassify: () => void
  onManageCategories: () => void // open Categories, where each category's default envelope is set
  onDialogOpen: () => void // remember the control that opened a dialog
  onDialogClosed: (event: Event) => void // and return focus to it
}) {
  // While another month loads, keep showing the last report only if it is for the month asked for.
  const report = kakeibo.data?.month === month ? kakeibo.data : undefined
  const waiting = forcedLoading || (!report && !kakeibo.error)
  const updating = useDelayedFlag(kakeibo.stale && !!report, 400)
  const unavailable = kakeibo.error && isNotFound(kakeibo.error) // an API from before Kakeibo has no such route
  const hasPlan = report?.planStatus === 'saved'
  const confirmLegacyPlan = report?.planStatus === 'legacy_unknown'
  const label = monthLabel(month)
  const [tab, setTab] = useState<KakeiboTab>('plan')
  const ready = !unavailable && !kakeibo.error && !waiting && !!report

  return (
    <div aria-busy={waiting}>
      <p role="status" className="sr-only">
        {waiting ? 'Loading your Kakeibo plan' : ''}
      </p>
      <PageHeader title="Kakeibo" onAdd={onAdd} addState={addState}>
        <UpdatingStamp show={updating} />
        <MonthSelect value={month} options={monthOptions(today)} onChange={onMonthChange} id="kakeibo-month" />
        {!waiting && !kakeibo.error && report && (
          <Button variant="secondary" onClick={onEditPlan} aria-label={`${hasPlan ? 'Edit' : confirmLegacyPlan ? 'Confirm' : 'Create'} plan for ${label}`}>
            {hasPlan || confirmLegacyPlan ? <NotebookPen aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {hasPlan ? 'Edit plan' : confirmLegacyPlan ? 'Confirm plan' : 'Create plan'}
          </Button>
        )}
      </PageHeader>
      <p className="-mt-2 mb-[18px] max-w-[62ch] text-[0.9375rem] text-muted-foreground">
        Plan what comes in and what you&rsquo;ll save first, then give each kind of spending a limit. Card payments and
        transfers never count as spending.
      </p>

      <Tabs label="Kakeibo sections" idPrefix={TAB_PREFIX} tabs={TABS} value={tab} onChange={setTab} className="mb-4 w-full sm:w-auto" />

      <div
        role="tabpanel"
        id={panelId(TAB_PREFIX, 'plan')}
        aria-labelledby={tabId(TAB_PREFIX, 'plan')}
        hidden={tab !== 'plan'}
      >
        {unavailable ? (
          <EmptyState message="Kakeibo needs a newer version of the MoniKey server. Your accounts and activity are not affected." />
        ) : kakeibo.error ? (
          <ErrorBlock what="your Kakeibo plan" updatedAt={kakeibo.updatedAt} onRetry={kakeibo.retry} focusAfter="main h1" />
        ) : waiting || !report ? (
          <Skeleton />
        ) : (
          // Phone order: summary (or the no-plan card), envelopes, then unclassified and the plan details.
          // From 1024px the envelopes take the left 7 columns and unclassified + details the right 5.
          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 lg:items-start">
            <div className="min-w-0 lg:col-span-12">{hasPlan || confirmLegacyPlan ? <PlanHero report={report} /> : <NoPlanCard report={report} onEditPlan={onEditPlan} />}</div>
            <section aria-labelledby="kakeibo-envelopes-title" className="min-w-0 lg:col-span-7">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 id="kakeibo-envelopes-title" className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] md:text-xl">
                  Your four envelopes
                </h2>
                <p className="text-sm text-muted-foreground">
                  {report.totalExpenses === 0 ? `No expenses recorded in ${label} yet.` : 'Spent against each limit'}
                </p>
              </div>
              {/* One column on phones; two from 640px; one again from 1024px while the envelopes share the row with the side column; two from 1280px. Each card puts Spent and Remaining side by side, so it needs about 250px. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-1 xl:grid-cols-2">
                {ENVELOPES.map((envelope) => (
                  <EnvelopeCard key={envelope} envelope={envelope} report={report.envelopes[envelope]} />
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Each category suggests an envelope for new expenses.{' '}
                <Button variant="link" className="h-auto min-h-11 p-0 align-baseline font-semibold" onClick={onManageCategories}>
                  Manage category defaults
                </Button>
              </p>
            </section>
            <div className="grid min-w-0 gap-4 md:gap-6 lg:col-span-5">
              <Unclassified report={report} onClassify={onClassify} />
              {(hasPlan || confirmLegacyPlan) && <PlanDetails report={report} onEditPlan={onEditPlan} />}
            </div>
          </div>
        )}
      </div>

      <div
        role="tabpanel"
        id={panelId(TAB_PREFIX, 'reflect')}
        aria-labelledby={tabId(TAB_PREFIX, 'reflect')}
        hidden={tab !== 'reflect'}
      >
        <h2 className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] md:text-xl">Look back</h2>
        <p className="mb-3 text-sm text-muted-foreground">Optional check-ins. No reminders, and nothing here changes your money.</p>
        {ready && report ? (
          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0">
              <WeeklyReviewCard
                weeks={weeks}
                weekStart={weekStart}
                week={week}
                onWeekChange={onWeekChange}
                onSave={onSaveWeek}
                onOpen={onDialogOpen}
                onClosed={onDialogClosed}
              />
            </div>
            <div className="min-w-0">
              <MonthlyReviewCard report={report} onSave={onSaveReview} onOpen={onDialogOpen} onClosed={onDialogClosed} />
            </div>
          </div>
        ) : unavailable ? (
          <EmptyState message="Kakeibo needs a newer version of the MoniKey server. Your accounts and activity are not affected." />
        ) : kakeibo.error ? (
          <ErrorBlock what="your Kakeibo plan" updatedAt={kakeibo.updatedAt} onRetry={kakeibo.retry} focusAfter="main h1" />
        ) : (
          <Skeleton />
        )}
      </div>
    </div>
  )
}
