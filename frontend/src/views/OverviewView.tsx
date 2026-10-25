import { Plus, TriangleAlert } from 'lucide-react'
import { cn } from 'cn'

import { CreditCardSummary } from '@/components/CreditCardSummary'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock, UpdatingStamp } from '@/components/ErrorBlock'
import { MoneyText } from '@/components/MoneyText'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { TransactionItem } from '@/components/TransactionItem'
import { addBlocked, addLabel } from '@/components/addState'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { monthLabel, monthOptions } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot, ActivityItem, ActivityPage, AddState, FinancialSummary } from '@/types'

/*
 * Overview (docs/design/UI_UX_SPEC.md section 4). Question it answers: "After what I owe, how much do I
 * really have?" Blocks, in reading order: position card, this month, credit cards, recent activity.
 * Below 1024px they stack in that order; from 1024px the position card spans the top, recent activity sits
 * on the left (7 of 12 columns) and "this month" + "credit cards" on the right (5 of 12).
 * All totals come from lib/finance.ts, which stands in for the API during this milestone.
 */

/* A flat bar the size of the value it replaces; used while loading (no shimmer, no layout shift). */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block rounded-chip', className)} />
}

/* Shown behind the loading skeleton while the first figures are on their way (never read as numbers). */
const NO_SUMMARY: FinancialSummary = { liquidBalance: 0, outstandingDebt: 0, cardCredit: 0, netPosition: 0, monthIncome: 0, monthExpenses: 0 }

export function OverviewView({
  today,
  accounts: accountsRes,
  summary: summaryRes,
  recent: recentRes,
  month,
  loading: forcedLoading,
  addState,
  onMonthChange,
  onAdd,
  onAddAccount,
  onPayCard,
  onOpenActivity,
}: {
  today: string
  accounts: Resource<AccountsSnapshot> // the accounts' figures (not the categories, which only the forms need)
  summary: Resource<FinancialSummary>
  recent: Resource<ActivityPage>
  month: string
  loading: boolean // ?demo=loading: show the skeleton whatever has arrived
  addState: AddState
  onMonthChange: (month: string) => void
  onAdd: () => void
  onAddAccount: () => void
  onPayCard: (cardId: number) => void
  onOpenActivity: (month: string) => void
}) {
  const summary = summaryRes.data ?? NO_SUMMARY
  const snapshot = accountsRes.data
  const cards = snapshot?.cards ?? []
  const items = recentRes.data?.items ?? []
  const label = monthLabel(month)
  // Until the accounts have arrived the first-run question cannot be answered, so assume an account exists.
  const hasAccounts = snapshot ? snapshot.accounts.length > 0 : true
  const hasNegativeAccount = snapshot?.liquid.some((l) => l.balance < 0) ?? false
  const longHero = formatPeso(summary.netPosition).length > 12 // very large amounts step down one size
  const openActivity = (item?: ActivityItem) => onOpenActivity(item ? item.date.slice(0, 7) : month)

  // Each block loads, fails and recovers on its own (spec section 4): "Only the failed block shows".
  const summaryWaiting = forcedLoading || (!summaryRes.data && !summaryRes.error)
  const snapshotWaiting = forcedLoading || (!accountsRes.data && !accountsRes.error)
  const recentWaiting = forcedLoading || (!recentRes.data && !recentRes.error)
  const positionLoading = summaryWaiting || snapshotWaiting
  const anyLoading = positionLoading || recentWaiting
  const updating = useDelayedFlag(summaryRes.stale || recentRes.stale || accountsRes.stale, 400)

  return (
    <div aria-busy={anyLoading}>
      <p role="status" className="sr-only">
        {anyLoading ? 'Loading your overview' : ''}
      </p>
      <PageHeader title="Overview" onAdd={onAdd} addState={addState}>
        <UpdatingStamp show={updating} />
        <MonthSelect value={month} options={monthOptions(today)} onChange={onMonthChange} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 lg:items-start">
        {/* 1. Position card: the one flat deep-blue field of colour */}
        {summaryRes.error ? (
          <div className="order-1 min-w-0 lg:order-none lg:col-span-12">
            <ErrorBlock what="your summary" updatedAt={summaryRes.updatedAt} onRetry={summaryRes.retry} focusAfter="main h1" />
          </div>
        ) : !hasAccounts && !positionLoading ? (
          <Card className="order-1 text-center lg:order-none lg:col-span-12">
            <p className="text-lg font-semibold">
              Start by adding a cash, bank or <span className="whitespace-nowrap">e-wallet</span> account.
            </p>
            <Button className="mt-4" onClick={onAddAccount}>
              <Plus aria-hidden="true" />
              Add account
            </Button>
          </Card>
        ) : (
          <section
            aria-labelledby="net-position-label"
            className="order-1 min-w-0 rounded-card bg-hero lg:order-none p-5 text-white md:px-7 md:py-[26px] lg:col-span-12 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-x-10 lg:px-9 lg:py-8"
          >
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 lg:justify-start lg:gap-3.5">
                <h2 id="net-position-label" className="text-[0.9375rem] font-semibold text-hero-muted">
                  Net position
                </h2>
                <span className="text-[0.8125rem] text-hero-muted">As of today</span>
              </div>
              {positionLoading ? (
                <Bar className="my-2.5 h-9 w-52 bg-white/15 lg:h-11" />
              ) : (
                <MoneyText
                  wrap
                  centavos={summary.netPosition}
                  className={cn(
                    'my-2 block leading-[1.05] font-semibold tracking-[-0.03em]',
                    longHero ? 'text-3xl md:text-4xl lg:text-[2.5rem]' : 'text-4xl md:text-[2.5rem] lg:text-[2.75rem]',
                  )}
                />
              )}
              {positionLoading ? (
                <Bar className="h-12 w-full max-w-[44ch] bg-white/15" />
              ) : (
                <p className="max-w-[44ch] text-[0.9375rem] leading-normal text-hero-muted">
                  You have {formatPeso(summary.liquidBalance)} in cash, bank and{' '}
                  <span className="whitespace-nowrap">e-wallets</span> and owe {formatPeso(summary.outstandingDebt)} on
                  credit cards.
                </p>
              )}
            </div>

            {/* The equation, drawn inline: Money you have − Card debt */}
            <div
              role="group"
              aria-label={
                summary.cardCredit > 0
                  ? 'Money you have minus card debt plus card credit equals net position'
                  : 'Money you have minus card debt equals net position'
              }
              className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 border-t border-hero-line pt-[18px] lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
            >
              <div className="min-w-0">
                <div className="mb-0.5 text-[0.8125rem] font-medium text-hero-muted [overflow-wrap:anywhere]">Money you have</div>
                {positionLoading ? (
                  <Bar className="h-6 w-28 bg-white/15" />
                ) : (
                  <MoneyText wrap centavos={summary.liquidBalance} className="block text-[1.3125rem] leading-[1.2] max-[359px]:text-[1.125rem] font-semibold tracking-[-0.015em]" />
                )}
              </div>
              <span aria-hidden="true" className="pb-[3px] text-2xl leading-none text-hero-muted">
                {'−'}
              </span>
              <div className="min-w-0">
                <div className="mb-0.5 text-[0.8125rem] font-medium text-hero-muted">Card debt</div>
                {positionLoading ? (
                  <Bar className="h-6 w-28 bg-white/15" />
                ) : (
                  <MoneyText wrap centavos={summary.outstandingDebt} className="block text-[1.3125rem] leading-[1.2] max-[359px]:text-[1.125rem] font-semibold tracking-[-0.015em] text-hero-debt" />
                )}
              </div>
            </div>

            {!positionLoading && summary.cardCredit > 0 && (
              <p className="mt-3.5 text-[0.8125rem] text-hero-muted lg:col-span-2">
                Plus {formatPeso(summary.cardCredit)} card credit (overpaid), included in your net position.
              </p>
            )}
            {!positionLoading && hasNegativeAccount && (
              <p className="mt-3.5 flex items-center gap-1.5 text-[0.8125rem] text-hero-muted lg:col-span-2">
                <TriangleAlert aria-hidden="true" className="size-4" />
                An account is below zero.
              </p>
            )}
          </section>
        )}

        {/* 4. Recent activity: below the money cards on phones and tablets, on the left from 1024px */}
        <div className="order-3 min-w-0 lg:order-none lg:col-span-7">
          <Card aria-labelledby="recent-activity-title" role="region">
            <CardHeader>
              <CardTitle id="recent-activity-title" tabIndex={-1}>Recent activity</CardTitle>
              <Button variant="link" onClick={() => openActivity()}>
                View all
              </Button>
            </CardHeader>
            {recentRes.error ? (
              <ErrorBlock what="recent activity" updatedAt={recentRes.updatedAt} onRetry={recentRes.retry} focusAfter="#recent-activity-title" />
            ) : recentWaiting ? (
              <ul aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex min-h-[68px] items-center justify-between gap-4 border-t border-rule py-3.5 first:border-t-0">
                    <div className="grid gap-2">
                      <Bar className="h-4 w-36 bg-secondary" />
                      <Bar className="h-3.5 w-24 bg-secondary" />
                    </div>
                    <Bar className="h-4 w-20 bg-secondary" />
                  </li>
                ))}
              </ul>
            ) : items.length === 0 ? (
              <EmptyState
                message={`Nothing recorded in ${label} yet.`}
                action={
                  <Button onClick={onAdd} disabled={addBlocked(addState)}>
                    <Plus aria-hidden="true" />
                    {addLabel(addState)}
                  </Button>
                }
              />
            ) : (
              <ul>
                {items.map((item, i) => (
                  <TransactionItem
                    key={item.key}
                    item={item}
                    onOpen={openActivity}
                    className={i === 5 ? 'hidden lg:block' : undefined} // 5 rows below 1024px, 6 from 1024px
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="order-2 grid min-w-0 gap-4 md:gap-6 lg:order-none lg:col-span-5">
          {/* 2. This month. Income and expenses of the selected month; card payments are not counted. */}
          <Card role="region" aria-labelledby="this-month-title">
            <CardTitle id="this-month-title">This month</CardTitle>
            <CardDescription>{label} · card payments aren&rsquo;t counted as expenses</CardDescription>
            {summaryRes.error ? (
              <p className="text-muted-foreground">Not available until your summary loads.</p>
            ) : (
            <dl>
              <div className="flex items-baseline justify-between gap-3 pt-1.5 pb-3">
                <dt className="text-[0.9375rem] font-medium text-muted-foreground">Income</dt>
                <dd className="min-w-0 text-right">
                  {summaryWaiting ? <Bar className="h-6 w-32 bg-secondary" /> : <MoneyText wrap centavos={summary.monthIncome} kind="income" className="text-2xl font-semibold tracking-[-0.015em]" />}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-rule py-3">
                <dt className="text-[0.9375rem] font-medium text-muted-foreground">Expenses</dt>
                <dd className="min-w-0 text-right">
                  {summaryWaiting ? <Bar className="h-6 w-32 bg-secondary" /> : <MoneyText wrap centavos={summary.monthExpenses} className="text-2xl font-semibold tracking-[-0.015em]" />}
                </dd>
              </div>
            </dl>
            )}
          </Card>

          {/* 3. Credit cards. Balances are "as of today", so they do not change with the month. */}
          <Card role="region" aria-labelledby="credit-cards-title">
            <CardTitle id="credit-cards-title" tabIndex={-1}>Credit cards</CardTitle>
            <CardDescription>Available credit isn&rsquo;t cash.</CardDescription>
            {accountsRes.error ? (
              <ErrorBlock what="your credit cards" updatedAt={accountsRes.updatedAt} onRetry={accountsRes.retry} focusAfter="#credit-cards-title" />
            ) : snapshotWaiting ? (
              <div aria-hidden="true" className="grid gap-5">
                {[0, 1].map((i) => (
                  <div key={i} className="grid gap-3">
                    <div className="flex justify-between">
                      <Bar className="h-5 w-28 bg-secondary" />
                      <Bar className="h-6 w-24 bg-secondary" />
                    </div>
                    <Bar className="h-2.5 w-full rounded-full bg-secondary" />
                    <Bar className="h-4 w-40 bg-secondary" />
                  </div>
                ))}
              </div>
            ) : cards.length === 0 ? (
              <EmptyState message="No credit cards yet. Add one on the Accounts screen." />
            ) : (
              <div className="md:grid md:grid-cols-2 md:gap-x-6 lg:block">
                {cards.map((status) => (
                  <CreditCardSummary
                    key={status.account.id}
                    status={status}
                    onPay={onPayCard}
                    className="border-t border-rule first:border-t-0 md:max-lg:border-t-0 md:max-lg:pt-1.5"
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
