import { useSyncExternalStore } from 'react'
import { ChartNoAxesCombined, Plus, TriangleAlert } from 'lucide-react'
import { cn } from 'cn'

import { CreditCardSummary } from '@/components/CreditCardSummary'
import { EmptyState } from '@/components/EmptyState'
import { Moki } from '@/components/Moki'
import { ErrorBlock, UpdatingStamp } from '@/components/ErrorBlock'
import { MoneyText } from '@/components/MoneyText'
import { MonthSelect } from '@/components/MonthSelect'
import { PageHeader } from '@/components/PageHeader'
import { TransactionItem } from '@/components/TransactionItem'
import { WalletStack } from '@/components/wallet/WalletStack'
import { addBlocked, addLabel } from '@/components/addState'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { monthLabel, monthOptions } from '@/lib/finance'
import { formatPeso } from '@/lib/money'
import { useDelayedFlag } from '@/useDelayedFlag'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot, ActivityItem, ActivityPage, AddState, FinancialSummary } from '@/types'
import type { WalletPreferencesV1 } from '@/wallet/walletPreferences'

/*
 * Overview (docs/design/UI_UX_SPEC.md section 4). Question it answers: "After what I owe, how much do I
 * really have?" Phone order: position, this month, credit cards, account wallet, recent activity. From 1024px,
 * the position spans the top, then this month as a strip, wallets beside credit cards, then recent activity.
 * All totals come from lib/finance.ts, which stands in for the API during this milestone.
 */

/* A flat bar the size of the value it replaces; used while loading (no shimmer, no layout shift). */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block rounded-chip', className)} />
}

/* Shown behind the loading skeleton while the first figures are on their way (never read as numbers). */
const NO_SUMMARY: FinancialSummary = { liquidBalance: 0, outstandingDebt: 0, cardCredit: 0, netPosition: 0, monthIncome: 0, monthExpenses: 0 }
const DESKTOP_LAYOUT_QUERY = '(min-width: 64rem)'

function subscribeToDesktopLayout(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_LAYOUT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getDesktopLayout() {
  return window.matchMedia(DESKTOP_LAYOUT_QUERY).matches
}

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
  onEditAccount,
  onTransfer,
  onAddExpense,
  onOpenAccounts,
  walletPreferences,
  onOpenActivity,
  onOpenDashboard,
}: {
  today: string
  accounts: Resource<AccountsSnapshot> // the accounts' figures (not the categories, which only the forms need)
  summary: Resource<FinancialSummary>
  recent: Resource<ActivityPage>
  month: string
  loading: boolean // ?demo=loading: show the skeleton whatever has arrived
  addState: AddState
  onMonthChange: (month: string) => void
  onAdd: () => void // Add expense
  onAddAccount: () => void
  onPayCard: (cardId: number) => void
  onEditAccount: (accountId: number, from: HTMLElement) => void
  onTransfer: (fromAccountId: number) => void // the wallet's Transfer, from the selected account
  onAddExpense: (accountId: number) => void
  onOpenAccounts: () => void
  walletPreferences: WalletPreferencesV1
  onOpenActivity: (month: string) => void
  onOpenDashboard: () => void
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
  const showWelcome =
    Boolean(snapshot?.accounts.length) &&
    !anyLoading &&
    !accountsRes.error &&
    !summaryRes.error &&
    !recentRes.error &&
    !accountsRes.stale &&
    !summaryRes.stale &&
    !recentRes.stale
  const updating = useDelayedFlag(summaryRes.stale || recentRes.stale || accountsRes.stale, 400)
  // DOM order follows the visual reading order at each responsive layout.
  const desktopLayout = useSyncExternalStore(subscribeToDesktopLayout, getDesktopLayout, () => false)

  const positionSection = summaryRes.error ? (
    <div key="position" className="min-w-0 lg:col-span-12">
      <ErrorBlock what="your summary" updatedAt={summaryRes.updatedAt} onRetry={summaryRes.retry} focusAfter="main h1" />
    </div>
  ) : !hasAccounts && !positionLoading ? (
    <Card key="position" className="lg:col-span-12">
      <div className="mx-auto grid max-w-2xl items-center gap-3 text-center sm:grid-cols-[112px_minmax(0,1fr)] sm:text-left">
        <Moki pose="welcome" size="medium" className="mx-auto" loading="eager" />
        <div>
          <p className="text-lg font-semibold">
            Start by adding a cash, bank or <span className="whitespace-nowrap">e-wallet</span> account.
          </p>
          <Button className="mt-4" onClick={onAddAccount}>
            <Plus aria-hidden="true" />
            Add account
          </Button>
        </div>
      </div>
    </Card>
  ) : (
    <section
      key="position"
      aria-labelledby="net-position-label"
      className="min-w-0 rounded-card bg-hero p-5 text-white md:px-7 md:py-[26px] lg:col-span-12 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-x-10 lg:px-9 lg:py-8"
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
  )

  const walletSection = (
    <div key="wallet" className="h-full min-w-0 [&>[data-slot=card]]:h-full">
      <WalletStack
        accounts={accountsRes}
        loading={forcedLoading}
        preferences={walletPreferences}
        onEditAccount={onEditAccount}
        onPayCard={onPayCard}
        onTransfer={onTransfer}
        onAddExpense={onAddExpense}
        onOpenAccounts={onOpenAccounts}
      />
    </div>
  )

  const recentActivitySection = (
    <div key="recent" className="h-full min-w-0 [&>[data-slot=card]]:h-full">
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
  )

  const monthSection = (
    <Card key="month" role="region" aria-labelledby="this-month-title" className="min-w-0 lg:col-span-12">
      {/* This month. Income and expenses of the selected month; card payments are not counted. */}
      <CardTitle id="this-month-title">This month</CardTitle>
      <CardDescription>{label} · card payments aren&rsquo;t counted as expenses</CardDescription>
      {summaryRes.error ? (
        <p className="text-muted-foreground">Not available until your summary loads.</p>
      ) : (
        <dl className="lg:grid lg:grid-cols-2 lg:gap-x-10">
          <div className="flex items-baseline justify-between gap-3 pt-1.5 pb-3">
            <dt className="text-[0.9375rem] font-medium text-muted-foreground">Income</dt>
            <dd className="min-w-0 text-right">
              {summaryWaiting ? <Bar className="h-6 w-32 bg-secondary" /> : <MoneyText wrap centavos={summary.monthIncome} kind="income" className="text-2xl font-semibold tracking-[-0.015em]" />}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-rule py-3 lg:border-t-0 lg:pt-1.5 lg:pb-3">
            <dt className="text-[0.9375rem] font-medium text-muted-foreground">Expenses</dt>
            <dd className="min-w-0 text-right">
              {summaryWaiting ? <Bar className="h-6 w-32 bg-secondary" /> : <MoneyText wrap centavos={summary.monthExpenses} className="text-2xl font-semibold tracking-[-0.015em]" />}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  )

  const creditCardsSection = (
    <Card key="credit-cards" role="region" aria-labelledby="credit-cards-title" className="min-w-0">
      {/* Credit-card balances are as of today and don't change with the selected month. */}
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
  )

  // The welcome sits BELOW the net position so it never displaces it. Its slot is reserved (same height whether the
  // panel is showing or briefly hidden while data refreshes), so nothing below it jumps. It only exists when the
  // person has accounts (or might: until the accounts load we assume they do, so the space is held from the start).
  const welcomeSlot = hasAccounts ? (
    <div key="welcome" className="min-h-[6.5rem] max-[359px]:min-h-[7.75rem] md:min-h-[6.625rem] min-w-0 lg:col-span-12" data-welcome-slot="">
      {showWelcome && (
        <Card className="flex h-full items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 md:!py-3">
          <Moki pose="welcome" size="small" loading="eager" />
          <div className="min-w-0">
            <p className="font-semibold">Welcome back!</p>
            <p className="text-sm leading-snug text-muted-foreground">
              Here&rsquo;s your money overview. Keep an eye on spending and stay on top of your budget.
            </p>
          </div>
        </Card>
      )}
    </div>
  ) : null

  // From 1024px: this month as a full-width strip, wallets beside credit cards at equal height, then recent activity. Below that, one column in the order the spec reads: this month and credit context
  // first, then wallets and recent activity.
  const layoutSections = desktopLayout
    ? [
        positionSection,
        welcomeSlot,
        // This month is a full-width strip; wallets and credit cards share the next row at equal height so their edges
        // line up; recent activity runs full width beneath.
        monthSection,
        <div key="row-left" className="flex min-w-0 lg:col-span-6 xl:col-span-7 [&>*]:min-w-0 [&>*]:flex-1">{walletSection}</div>,
        <div key="row-right" className="flex min-w-0 lg:col-span-6 xl:col-span-5 [&>*]:min-w-0 [&>*]:flex-1">{creditCardsSection}</div>,
        <div key="recent-row" className="min-w-0 lg:col-span-12">{recentActivitySection}</div>,
      ]
    : [positionSection, welcomeSlot, monthSection, creditCardsSection, walletSection, recentActivitySection]

  return (
    <div aria-busy={anyLoading}>
      <p role="status" className="sr-only">
        {anyLoading ? 'Loading your overview' : ''}
      </p>
      <PageHeader title="Overview" onAdd={onAdd} addState={addState}>
        <Button variant="secondary" size="sm" onClick={onOpenDashboard}>
          <ChartNoAxesCombined aria-hidden="true" />
          View analytics
        </Button>
        <UpdatingStamp show={updating} className="sr-only md:not-sr-only md:inline-block md:min-w-[5.5rem]" />
        <MonthSelect value={month} options={monthOptions(today)} onChange={onMonthChange} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12 lg:items-stretch">
        {layoutSections}
      </div>
    </div>
  )
}
