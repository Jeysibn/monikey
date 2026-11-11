import type { ReactNode } from 'react'
import { Quote } from 'lucide-react'
import { cn } from 'cn'

import { InlineNotice } from '@/components/InlineNotice'
import { Moki } from '@/components/Moki'
import { MoneyText } from '@/components/MoneyText'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { monthLabel } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import type { KakeiboMonth } from '@/types'

/*
 * The month's plan next to what actually happened, kept visibly apart: "Your plan" lists what the person
 * intends (planned income, starting funds, savings set aside first, debt reserve) and the server's
 * "available to allocate" and "unallocated"; "Recorded so far" lists ledger figures from Activity. A savings
 * target is a goal, never money already saved, and the card says so. Every figure is the server's.
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

export function PlanSummary({ report }: { report: KakeiboMonth }) {
  const { plan } = report
  const label = monthLabel(report.month)
  const figure = 'text-base font-semibold'

  const recorded = (
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

  if (!plan || report.availableToAllocate === null || report.unallocated === null) {
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
        {recorded}
      </Card>
    )
  }

  const over = report.unallocated < 0
  return (
    <Card role="region" aria-labelledby="kakeibo-plan-title" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="kakeibo-plan-title" tabIndex={-1}>Your {label} plan</CardTitle>
        <Tag>Plan</Tag>
      </div>
      {report.planStatus === 'legacy_unknown' && (
        <InlineNotice tone="warning" className="mt-3">
          This month predates plan tracking. These saved amounts are preserved, but their original intent is unknown. Review and save the plan to confirm it.
        </InlineNotice>
      )}
      {plan.monthlyIntention && (
        <p className="mt-2 flex gap-2 text-[0.9375rem] text-foreground">
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

      {recorded}
    </Card>
  )
}
