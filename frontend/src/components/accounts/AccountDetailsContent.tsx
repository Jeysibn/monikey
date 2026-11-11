import { useContext, useRef } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowRightLeft, ArrowUpRight, CreditCard, Pencil, TriangleAlert } from 'lucide-react'

import { AccountDetailsContext } from '@/components/accounts/accountDetailsContext'
import { InlineFailure } from '@/components/ErrorBlock'
import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDateShort } from '@/lib/dashboardRanges'
import { formatPeso } from '@/lib/money'
import { useResource } from '@/useResource'
import { usedShare, type WalletCardVM } from '@/wallet/walletModel'
import type { ActivityItem } from '@/types'

/*
 * Account details (spec 7.3), shown as a right-hand drawer on desktop and a near-full-height bottom sheet on phones.
 * A money account shows its current balance; a credit card shows what is owed (or card credit), its limit, how much
 * of the limit is in use, and its available credit, which is labelled as NOT cash. Actions are the ones that make sense
 * for the account: a card is paid, never funded or transferred from; a money account can take income and transfers.
 * Recent activity is the account's own latest entries (the Activity read, filtered to this account).
 */
const TYPE_LABEL = { cash: 'Cash', bank: 'Bank account', ewallet: 'E-wallet', credit_card: 'Credit card' } as const
const KIND = {
  income: { Icon: ArrowDownLeft, word: 'Income' },
  expense: { Icon: ArrowUpRight, word: 'Expense' },
  payment: { Icon: ArrowRightLeft, word: 'Card payment' },
  transfer: { Icon: ArrowRightLeft, word: 'Transfer' },
} as const

export function WalletCreditProgress({ item }: { item: WalletCardVM }) {
  const limit = item.creditLimitCentavos
  if (limit === null || limit <= 0) return null
  const owed = item.primaryLabel === 'Owed' ? item.primaryAmountCentavos : 0
  const available = item.availableCreditCentavos ?? 0
  const usedPercent = Math.max(0, Math.min(100, (owed / limit) * 100))
  const availablePercent = Math.max(0, Math.min(100 - usedPercent, (Math.max(0, available) / limit) * 100))
  const availableLabel = available > 0 ? `${formatPeso(available)} available` : 'No credit available'
  return (
    <div
      role="img"
      aria-label={`Credit limit progress: ${formatPeso(owed)} owed, ${availableLabel}, ${formatPeso(limit)} credit limit`}
      className="flex h-2.5 overflow-hidden rounded-full bg-secondary"
    >
      <span aria-hidden="true" className="h-full bg-debt" style={{ width: `${usedPercent}%` }} />
      <span aria-hidden="true" className="h-full bg-primary" style={{ width: `${availablePercent}%` }} />
    </div>
  )
}

function RecentRow({ item }: { item: ActivityItem }) {
  const { Icon, word } = KIND[item.kind]
  const detail = item.kind === 'payment' ? `${item.accountName} → ${item.cardName}` : item.kind === 'transfer' ? `${item.accountName} → ${item.destinationAccountName}` : item.categoryName
  return (
    <li className="flex items-center gap-3 border-t border-rule py-2.5 first:border-t-0">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium"><span className="sr-only">{word}: </span>{item.title}</p>
        <p className="truncate text-sm text-muted-foreground">{formatDateShort(item.date)}{detail ? ` · ${detail}` : ''}</p>
      </div>
      <MoneyText centavos={item.amount} kind={item.kind} className="shrink-0 font-semibold" />
    </li>
  )
}

export function AccountDetailsContent({
  item,
  imageSrc,
  onImageError,
  onClose,
  onClosed,
}: {
  item: WalletCardVM
  imageSrc: string | null
  onImageError: () => void
  onClose: () => void
  onClosed?: (event: Event) => void // runs after it closes, for returning focus to the control that opened it
}) {
  const services = useContext(AccountDetailsContext)
  const isCard = item.accountType === 'credit_card'
  const recent = useResource(services ? `account-recent:${item.accountId}` : null, (signal) => services!.loadRecent(item.accountId, signal), services?.version ?? 0)
  const used = usedShare(item)
  const overLimit = isCard && item.availableCreditCentavos !== null && item.availableCreditCentavos < 0 && item.primaryLabel === 'Owed'
  const payReason = item.primaryLabel === 'Card credit' ? 'No debt to pay' : item.primaryLabel === 'Nothing owed' ? 'Nothing to pay' : null
  const figureLabel = item.primaryLabel === 'Balance' ? 'Current balance' : item.primaryLabel === 'Owed' ? 'Amount owed' : item.primaryLabel
  const editRef = useRef<HTMLButtonElement>(null)

  // Closing first, then opening the next dialog, keeps one dialog on screen at a time.
  const then = (action: () => void) => () => {
    onClose()
    window.requestAnimationFrame(action)
  }

  return (
    <DialogContent size="drawer" aria-describedby="account-details-description" data-account-details="" onCloseAutoFocus={onClosed}>
      <DialogHeader>
        <DialogTitle>{item.accountName}</DialogTitle>
        <DialogDescription id="account-details-description">{TYPE_LABEL[item.accountType]} · Account details</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid auto-rows-max content-start gap-5">
        <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-card border border-border bg-background">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="block aspect-[1.586/1] w-full object-contain" onError={onImageError} />
          ) : (
            <div aria-hidden="true" className="flex aspect-[1.586/1] items-center justify-center text-sm font-semibold text-muted-foreground">MoniKey</div>
          )}
        </div>

        <section aria-label="Figures" className="grid gap-3">
          <div className="rounded-control bg-secondary px-4 py-3">
            <p className="text-sm text-muted-foreground">{figureLabel}</p>
            <p className="text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em]">
              <MoneyText wrap centavos={item.primaryAmountCentavos} kind={item.primaryLabel === 'Owed' ? 'debt' : 'plain'} />
            </p>
            {!isCard && item.primaryAmountCentavos < 0 && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink"><TriangleAlert aria-hidden="true" className="size-4" />Below zero</p>
            )}
          </div>
          {isCard && item.creditLimitCentavos !== null && (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-control border border-border px-3 py-2">
                  <dt className="text-muted-foreground">Credit limit</dt>
                  <dd className="font-semibold"><MoneyText wrap centavos={item.creditLimitCentavos} /></dd>
                </div>
                <div className="rounded-control border border-border px-3 py-2">
                  <dt className="text-muted-foreground">Limit in use</dt>
                  <dd className="font-semibold">{used ? used.text.replace(' used', '') : '0%'}</dd>
                </div>
                <div className="col-span-2 rounded-control border border-border px-3 py-2">
                  <dt className="text-muted-foreground">Available credit <span className="font-semibold text-foreground">(not cash)</span></dt>
                  <dd className="font-semibold">
                    {item.availableCreditCentavos !== null && item.availableCreditCentavos > 0 ? <MoneyText wrap centavos={item.availableCreditCentavos} /> : 'No credit available'}
                  </dd>
                </div>
              </dl>
              <WalletCreditProgress item={item} />
              {overLimit && <p className="inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink"><TriangleAlert aria-hidden="true" className="size-4" />Over your limit</p>}
              <p className="text-[0.8125rem] text-muted-foreground">Available credit is room to borrow, not money you have. It is never part of your cash or net position.</p>
            </>
          )}
        </section>

        {services && (
          <section aria-label="Actions" className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              {isCard ? (
                <>
                  <Button variant="secondary" className="min-h-11" onClick={then(() => services.onAddExpense(item.accountId))}><ArrowUpRight aria-hidden="true" />Add expense</Button>
                  <Button variant="secondary" className="min-h-11" disabled={payReason !== null} aria-describedby={payReason ? 'account-pay-reason' : undefined} onClick={then(() => services.onPayCard(item.accountId))}><CreditCard aria-hidden="true" />Pay card</Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" className="min-h-11" onClick={then(() => services.onAddExpense(item.accountId))}><ArrowUpRight aria-hidden="true" />Add expense</Button>
                  <Button variant="secondary" className="min-h-11" onClick={then(() => services.onAddIncome(item.accountId))}><ArrowDownLeft aria-hidden="true" />Add income</Button>
                  <Button variant="secondary" className="col-span-2 min-h-11" onClick={then(() => services.onTransfer(item.accountId))}><ArrowLeftRight aria-hidden="true" />Transfer</Button>
                </>
              )}
            </div>
            {payReason && <p id="account-pay-reason" className="text-sm text-muted-foreground">Pay card is off: {payReason.toLowerCase()}.</p>}
            {isCard && <p className="text-[0.8125rem] text-muted-foreground">A purchase counts as an expense and adds to what you owe. Paying the card is not another expense.</p>}
          </section>
        )}

        {services && (
          <section aria-labelledby="account-recent-title" className="grid gap-1">
            <div className="flex items-center justify-between gap-3">
              <h3 id="account-recent-title" className="text-base font-semibold">Recent activity</h3>
              <Button variant="ghost" size="sm" className="-mr-2 min-h-11 text-primary" onClick={then(() => services.onViewActivity(item.accountId))}>View all in Activity</Button>
            </div>
            {recent.error ? (
              <InlineFailure what="recent activity" onRetry={recent.retry} focusAfter="#account-recent-title" />
            ) : !recent.data ? (
              <p role="status" className="py-3 text-sm text-muted-foreground">Loading recent activity…</p>
            ) : recent.data.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No activity for this account yet.</p>
            ) : (
              <ul aria-label={`Recent activity for ${item.accountName}`} className="m-0 list-none p-0">
                {recent.data.map((entry) => <RecentRow key={entry.key} item={entry} />)}
              </ul>
            )}
          </section>
        )}
      </DialogBody>
      <DialogFooter>
        {services && (
          <Button ref={editRef} type="button" variant="secondary" className="min-h-11" onClick={() => { const from = editRef.current!; onClose(); window.requestAnimationFrame(() => services.onEdit(item.accountId, from)) }}>
            <Pencil aria-hidden="true" />Edit account
          </Button>
        )}
        <Button type="button" className="ml-auto min-h-11" onClick={onClose}>Done</Button>
      </DialogFooter>
    </DialogContent>
  )
}
