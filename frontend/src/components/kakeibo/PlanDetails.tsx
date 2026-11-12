import { useState, type ReactNode } from 'react'
import { ChevronDown, NotebookPen, Plus, Quote } from 'lucide-react'
import { cn } from 'cn'

import { InlineNotice } from '@/components/InlineNotice'
import { Moki } from '@/components/Moki'
import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { monthLabel } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import type { KakeiboMonth } from '@/types'

/*
 * The month's plan details (spec section 6.2, secondary): what the person intends (planned income, starting
 * funds, savings set aside first, debt reserve) and the server's "available to allocate" and "unallocated",
 * kept visibly apart from "Recorded so far", which lists ledger figures from Activity. It folds away so the
 * envelopes stay the focus; it opens by default on wide screens. A savings target is a goal, never money
 * already saved, and the card says so. Every figure is the server's: nothing here is recomputed from the
 * envelope cards. `NoPlanCard` is the same place for a month that has no plan yet.
 */
function Row({ term, sign, help, children, strong = false }: { term: string; sign?: '+' | '−'; help?: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-2', strong && 'border-t border-rule pt-3')}>
      <dt className="min-w-0">
        <span className={cn('text-[0.9375rem]', strong ? 'font-semibold' : 'font-medium text-muted-foreground')}>
          {sign && <span aria-hidden="true" className="mr-1.5 inline-block w-3 text-center">{sign}</span>}
          {sign && <span className="sr-only">{sign === '+' ? 'plus ' : 'minus '}</span>}
          {term}
        </span>
        {help && <span className={cn('block text-[0.8125rem] text-muted-foreground', sign && 'pl-[1.125rem]')}>{help}</span>}
      </dt>
      <dd className="min-w-0 shrink-0 text-right">{children}</dd>
    </div>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">{children}</span>
}

function Recorded({ report }: { report: KakeiboMonth }) {
  const figure = 'text-base font-semibold'
  return (
    <section aria-labelledby="kakeibo-recorded-title" className="mt-5 rounded-control bg-surface-raised px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="kakeibo-recorded-title" className="text-[0.9375rem] font-semibold">Recorded so far</h3>
        <Tag>From your activity</Tag>
      </div>
      <dl className="mt-1">
        <Row term="Income">
          <MoneyText wrap centavos={report.actualIncome} kind="income" className={figure} />
        </Row>
        <Row term="Total expenses" help="All envelopes, plus anything not yet classified">
          <MoneyText wrap centavos={report.totalExpenses} className={figure} />
        </Row>
      </dl>
    </section>
  )
}

/** A month with no plan: say so, offer to create one, and still show what was recorded. */
export function NoPlanCard({ report, onEditPlan }: { report: KakeiboMonth; onEditPlan: () => void }) {
  const label = monthLabel(report.month)
  return (
    <Card role="region" aria-labelledby="kakeibo-plan-title" className="min-w-0">
      <CardTitle id="kakeibo-plan-title" tabIndex={-1}>No plan for {label} yet</CardTitle>
      <div className="mt-3 flex items-start gap-3">
        <CardDescription className="min-w-0 flex-1">
          A plan says how much you expect to earn, what you&rsquo;ll set aside first, and a limit for each envelope.
          Use <span className="font-semibold text-foreground">Create plan</span> to start. You can skip it and keep tracking as usual.
        </CardDescription>
        <Moki pose="planning" size="small" />
      </div>
      <Button className="mt-3 min-h-11" onClick={onEditPlan}>
        <Plus aria-hidden="true" />
        Create plan
      </Button>
      <Recorded report={report} />
    </Card>
  )
}

export function PlanDetails({ report, onEditPlan }: { report: KakeiboMonth; onEditPlan: () => void }) {
  const { plan } = report
  const figure = 'text-base font-semibold'
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches === true)
  if (!plan || report.availableToAllocate === null || report.unallocated === null) return null

  const over = report.unallocated < 0
  const legacy = report.planStatus === 'legacy_unknown'
  return (
    <Card role="region" aria-labelledby="kakeibo-plan-title" className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="kakeibo-plan-details"
        onClick={() => setOpen((o) => !o)}
        className="-m-1 flex min-h-11 w-[calc(100%+0.5rem)] cursor-pointer items-center justify-between gap-3 rounded-control p-1 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          <CardTitle id="kakeibo-plan-title" tabIndex={-1} className="mb-0">Monthly plan details</CardTitle>
          <span className="block text-sm text-muted-foreground">
            {over ? 'Over-allocated: limits exceed what is available' : legacy ? 'Needs your confirmation' : 'Planning amounts, not extra transactions'}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </button>

      <div id="kakeibo-plan-details" hidden={!open}>
        {legacy && (
          <InlineNotice tone="warning" className="mt-3">
            This month predates plan tracking. These saved amounts are preserved, but their original intent is unknown. Review and save the plan to confirm it.
          </InlineNotice>
        )}
        {plan.monthlyIntention && (
          <p className="mt-3 flex gap-2 text-[0.9375rem] text-foreground">
            <Quote aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span><span className="sr-only">Monthly intention: </span>{plan.monthlyIntention}</span>
          </p>
        )}

        <dl className="mt-3">
          <Row term="Planned income">
            <MoneyText wrap centavos={plan.plannedIncome} className={figure} />
          </Row>
          <Row term="Starting funds" sign="+" help="Money you already had, used this month">
            <MoneyText wrap centavos={plan.allocatedStartingFunds} className={figure} />
          </Row>
          <Row term="Savings target" sign="−" help="Set aside first. A goal, not money already saved">
            <MoneyText wrap centavos={plan.savingsTarget} className={figure} />
          </Row>
          <Row term="Debt reserve" sign="−" help="For card balances from earlier months">
            <MoneyText wrap centavos={plan.priorPeriodDebtReserve} className={figure} />
          </Row>
          <Row term="Available to allocate" strong>
            <MoneyText wrap centavos={report.availableToAllocate} className="text-lg font-semibold tracking-[-0.01em]" />
          </Row>
          <Row term={over ? 'Over-allocated' : 'Unallocated'} help={over ? 'Envelope limits are more than is available' : 'Not given to any envelope yet'}>
            <MoneyText wrap centavos={report.unallocated} className={cn(figure, over && 'text-debt')} />
          </Row>
        </dl>
        {over && (
          <InlineNotice tone="warning" className="mt-2">
            Your envelope limits add up to {formatPeso(-report.unallocated)} more than you have available. Lower a limit or
            change the plan when you&rsquo;re ready; nothing is changed for you.
          </InlineNotice>
        )}

        <Recorded report={report} />

        <Button variant="secondary" className="mt-4 min-h-11" onClick={onEditPlan}>
          <NotebookPen aria-hidden="true" />
          {legacy ? 'Confirm plan' : 'Edit plan'}
        </Button>
      </div>
    </Card>
  )
}
