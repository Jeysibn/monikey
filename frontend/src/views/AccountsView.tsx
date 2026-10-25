import { Plus } from 'lucide-react'
import { cn } from 'cn'

import { AccountRow } from '@/components/AccountRow'
import { CreditCardSummary } from '@/components/CreditCardSummary'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBlock, InlineFailure } from '@/components/ErrorBlock'
import { MoneyText } from '@/components/MoneyText'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot, AddState, FinancialSummary } from '@/types'

/*
 * Accounts (docs/design/UI_UX_SPEC.md section 6). Question: "What do I have, and what do I owe, account
 * by account?" Two always-named sections, never mixed:
 *   Money you have  - cash, bank and e-wallet balances (ink)
 *   Money you owe   - credit cards: owed amount in the debt colour with the word "owed", a limit track,
 *                     and available credit, which is NOT cash and is never part of "money you have".
 * Below 1024px the sections stack; from 1024px they sit in two equal columns, each top-aligned (they are
 * not stretched to the same height). Balances are "as of today", so there is no month select here.
 * Account names and starting values can be edited from their rows; account types stay fixed. Add account opens the shared dialog in App.
 */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('block rounded-chip bg-secondary', className)} />
}

/* Shown behind the loading skeleton while the first figures are on their way (never read as numbers). */
const NO_SUMMARY: FinancialSummary = { liquidBalance: 0, outstandingDebt: 0, cardCredit: 0, netPosition: 0, monthIncome: 0, monthExpenses: 0 }

export function AccountsView({
  accounts: accountsRes,
  summary: summaryRes,
  loading: forcedLoading,
  addState,
  onAdd,
  onAddAccount,
  onEditAccount,
  onPayCard,
}: {
  accounts: Resource<AccountsSnapshot> // the rows and cards
  summary: Resource<FinancialSummary> // the two totals
  loading: boolean // ?demo=loading: show the skeleton whatever has arrived
  addState: AddState
  onAdd: () => void
  onAddAccount: (kind: 'account' | 'credit card') => void
  onEditAccount: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
}) {
  const snapshot = accountsRes.data
  // Until the accounts have arrived the first-run question cannot be answered, so assume an account exists.
  const hasAccounts = snapshot ? snapshot.accounts.length > 0 : true
  const summary = summaryRes.data ?? NO_SUMMARY
  const rows = snapshot?.liquid ?? []
  const cards = snapshot?.cards ?? []
  // Two requests feed this screen, and each failure is shown for what it affects and with its own time: the accounts
  // (the rows and cards) fail both sections; the summary (the two totals) fails only the totals, next to rows that loaded.
  const accountsFailed = accountsRes.error !== null
  const summaryFailed = summaryRes.error !== null
  const rowsLoading = forcedLoading || (!accountsFailed && !accountsRes.data)
  const totalsLoading = forcedLoading || (!summaryFailed && !summaryRes.data)
  const loading = rowsLoading || totalsLoading
  // With no accounts yet, Add account is the single primary action and Add transaction is disabled.
  const addAccountVariant = hasAccounts ? 'secondary' : 'default'

  return (
    <div aria-busy={loading}>
      <p role="status" className="sr-only">
        {loading ? 'Loading your accounts' : ''}
      </p>
      <PageHeader title="Accounts" onAdd={onAdd} addState={addState}>
        <Button variant={addAccountVariant} className="hidden md:inline-flex" onClick={() => onAddAccount('account')}>
          Add account
        </Button>
      </PageHeader>
      {/* Phones: Add account sits on its own row under the title (the header is too tight for two buttons). */}
      <div className="-mt-1.5 mb-4 flex justify-end md:hidden">
        <Button variant={addAccountVariant} onClick={() => onAddAccount('account')}>
          Add account
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2 lg:items-start">
        {/* Money you have */}
        {accountsFailed ? (
          <Card role="region" aria-labelledby="money-you-have-title">
            <CardTitle id="money-you-have-title" tabIndex={-1}>Money you have</CardTitle>
            <ErrorBlock what="accounts" updatedAt={accountsRes.updatedAt} onRetry={accountsRes.retry} focusAfter="#money-you-have-title" className="mt-3" />
          </Card>
        ) : (
        <Card role="region" aria-labelledby="money-you-have-title">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <CardTitle id="money-you-have-title" tabIndex={-1}>
              Money you have
            </CardTitle>
            {totalsLoading ? (
              <Bar className="h-6 w-28" />
            ) : summaryFailed ? (
              <InlineFailure what="the totals" onRetry={summaryRes.retry} focusAfter="#money-you-have-title" live />
            ) : (
              <MoneyText wrap centavos={summary.liquidBalance} className="text-[1.375rem] font-semibold tracking-[-0.015em] md:text-2xl" />
            )}
          </div>
          <CardDescription>Cash, bank and e-wallet balances</CardDescription>
          {rowsLoading ? (
            <ul aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex min-h-[68px] items-center justify-between gap-4 border-t border-rule py-2.5 first:border-t-0">
                  <div className="grid gap-2">
                    <Bar className="h-4 w-32" />
                    <Bar className="h-3.5 w-20" />
                  </div>
                  <Bar className="h-5 w-24" />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <EmptyState
              message="Add your first cash, bank or e-wallet account."
              action={<Button variant="secondary" onClick={() => onAddAccount('account')}>Add account</Button>}
            />
          ) : (
            <ul>
                {rows.map((item) => (
                <AccountRow key={item.account.id} item={item} onEdit={onEditAccount} />
              ))}
            </ul>
          )}
        </Card>
        )}

        {/* Money you owe */}
        {accountsFailed ? (
          <section aria-labelledby="money-you-owe-title" className="grid min-w-0 gap-4 md:gap-6">
            <Card>
              <CardTitle id="money-you-owe-title" tabIndex={-1}>Money you owe</CardTitle>
              {/* The same failure as in the other section: only one of the two is announced. */}
              <ErrorBlock what="accounts" updatedAt={accountsRes.updatedAt} onRetry={accountsRes.retry} focusAfter="#money-you-owe-title" live={false} className="mt-3" />
            </Card>
          </section>
        ) : (
        <section aria-labelledby="money-you-owe-title" className="grid min-w-0 gap-4 md:gap-6">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <CardTitle id="money-you-owe-title" tabIndex={-1}>
                Money you owe
              </CardTitle>
              {totalsLoading ? (
                <Bar className="h-6 w-28" />
              ) : summaryFailed ? (
                <InlineFailure what="the totals" onRetry={summaryRes.retry} focusAfter="#money-you-owe-title" />
              ) : (
                <span>
                  <MoneyText wrap centavos={summary.outstandingDebt} kind="debt" className="text-[1.375rem] font-semibold tracking-[-0.015em] md:text-2xl" />
                  {' '}
                  <span className="text-sm font-medium text-debt">owed</span>
                </span>
              )}
            </div>
            <CardDescription className="mb-0">
              Owed on credit cards. Available credit isn&rsquo;t cash and isn&rsquo;t part of your total money.
            </CardDescription>
          </Card>

          {rowsLoading ? (
            [0, 1].map((i) => (
              <Card key={i} aria-hidden="true">
                <div className="grid gap-3">
                  <div className="flex justify-between">
                    <Bar className="h-5 w-28" />
                    <Bar className="h-6 w-24" />
                  </div>
                  <Bar className="h-2.5 w-full rounded-full" />
                  <Bar className="h-4 w-40" />
                </div>
              </Card>
            ))
          ) : (
            <>
              {cards.length === 0 && (
                <EmptyState
                  className="rounded-card"
                  message="No credit cards yet."
                  action={<Button variant="secondary" onClick={() => onAddAccount('credit card')}>Add credit card</Button>}
                />
              )}
              {cards.map((status) => (
                <Card key={status.account.id}>
                  <CreditCardSummary status={status} onPay={onPayCard} onEdit={onEditAccount} fullWidthPay className="py-0 first:pt-0" />
                </Card>
              ))}
              {cards.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAddAccount('credit card')}
                  className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-input p-4 text-[0.9375rem] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-card motion-reduce:transition-none"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add credit card
                </button>
              )}
            </>
          )}
        </section>
        )}
      </div>
    </div>
  )
}
