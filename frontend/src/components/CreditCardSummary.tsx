import { CreditCard } from 'lucide-react'
import { cn } from 'cn'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/money'
import type { CardStatus } from '@/types'

/*
 * One credit card: what it owes (orange, with the word "owed"), a track showing how much of the limit
 * is used, and what is still available. Available credit is NOT cash: it is plain text in the muted
 * colour and is never added to any total. An overpaid card shows "card credit"; a card with nothing
 * to pay has its Pay card button disabled and says why.
 */
export function CreditCardSummary({
  status,
  onPay,
  className,
}: {
  status: CardStatus
  onPay: (cardId: number) => void
  className?: string
}) {
  const { account, owed, credit, creditLimit, availableCredit } = status
  const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((owed * 100) / creditLimit)) : 0
  const reason = credit > 0 ? 'No debt to pay' : owed === 0 ? 'Nothing to pay' : null
  const overLimit = owed > 0 && availableCredit <= 0

  return (
    <div className={cn('py-4 first:pt-1.5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-base font-semibold whitespace-nowrap">
          <CreditCard aria-hidden="true" className="size-4 text-muted-foreground" />
          {account.name}
        </div>
        <div className="text-right">
          {credit > 0 ? (
            <>
              <MoneyText centavos={credit} className="block text-[22px] leading-[1.15] font-semibold tracking-[-0.015em] text-primary-ink" />
              <div className="text-[13px] font-medium text-muted-foreground">card credit</div>
            </>
          ) : owed === 0 ? (
            <>
              <MoneyText centavos={0} className="block text-[22px] leading-[1.15] font-semibold tracking-[-0.015em]" />
              <div className="text-[13px] font-medium text-muted-foreground">nothing owed</div>
            </>
          ) : (
            <>
              <MoneyText centavos={owed} kind="debt" className="block text-[22px] leading-[1.15] font-semibold tracking-[-0.015em]" />
              <div className="text-[13px] font-medium text-debt">owed</div>
            </>
          )}
        </div>
      </div>

      <div
        role="img"
        aria-label={`${formatPeso(owed)} of ${formatPeso(creditLimit)} limit used`}
        className="mt-3 mb-2 h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <div className="h-full rounded-full bg-debt" style={{ width: `${usedPercent}%` }} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 text-sm leading-[1.45] text-muted-foreground">
          <div className="font-semibold text-foreground">
            {availableCredit > 0 ? `${formatPeso(availableCredit)} available` : 'No credit available'}
          </div>
          <div>
            Limit {formatPeso(creditLimit)}
            {reason && ` · ${reason}`}
            {overLimit && ' · Over your limit'}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={reason !== null}
          onClick={() => onPay(account.id)}
          aria-label={`Pay card, ${account.name}`}
        >
          Pay card
        </Button>
      </div>
    </div>
  )
}
