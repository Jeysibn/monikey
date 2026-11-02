import { TriangleAlert } from 'lucide-react'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogContent, DialogDescription, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatPeso } from '@/lib/money'
import type { WalletCardVM } from '@/wallet/walletModel'

const accountTypeLabels = {
  cash: 'Cash',
  bank: 'Bank account',
  ewallet: 'E-wallet',
  credit_card: 'Credit card',
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
    <div className="mt-3 grid gap-1.5">
      <div
        role="img"
        aria-label={`Credit limit progress: ${formatPeso(owed)} owed, ${availableLabel}, ${formatPeso(limit)} credit limit`}
        className="flex h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <span aria-hidden="true" className="h-full bg-debt" style={{ width: `${usedPercent}%` }} />
        <span aria-hidden="true" className="h-full bg-primary" style={{ width: `${availablePercent}%` }} />
      </div>
      <dl className="flex items-start justify-between gap-3 text-xs leading-4">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Owed</dt>
          <dd className="font-semibold text-debt"><MoneyText centavos={owed} /></dd>
        </div>
        <div className="grid gap-0.5 text-right">
          <dt className="text-muted-foreground">Available</dt>
          <dd className="font-semibold text-foreground">
            {available > 0 ? <MoneyText centavos={available} /> : 'No credit'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function WalletCardDetailsContent({
  item,
  imageSrc,
  onImageError,
}: {
  item: WalletCardVM
  imageSrc: string | null
  onImageError: () => void
}) {
  const isCreditCard = item.accountType === 'credit_card'
  const amountLabel = item.primaryLabel === 'Balance' ? 'Current balance' : item.primaryLabel
  const isOverLimit = isCreditCard && item.availableCreditCentavos !== null && item.availableCreditCentavos < 0 && item.primaryLabel === 'Owed'

  return (
    <DialogContent aria-describedby="wallet-card-details-description">
      <DialogHeader>
        <DialogTitle>{item.accountName}</DialogTitle>
        <DialogDescription id="wallet-card-details-description">{accountTypeLabels[item.accountType]}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="overflow-hidden rounded-card border border-border bg-background">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="block aspect-[1.586/1] w-full object-contain" onError={onImageError} />
          ) : (
            <div aria-hidden="true" className="flex aspect-[1.586/1] items-center justify-center text-sm font-semibold text-muted-foreground">MoniKey</div>
          )}
        </div>

        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{amountLabel}</dt>
            <dd className="text-right text-lg leading-6 font-semibold"><MoneyText centavos={item.primaryAmountCentavos} kind={item.primaryLabel === 'Owed' ? 'debt' : 'plain'} wrap /></dd>
          </div>
          {isCreditCard && item.creditLimitCentavos !== null && (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Credit limit</dt>
                <dd className="text-right font-semibold"><MoneyText centavos={item.creditLimitCentavos} wrap /></dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Available credit</dt>
                <dd className="text-right font-semibold">
                  {item.availableCreditCentavos !== null && item.availableCreditCentavos > 0
                    ? <><MoneyText centavos={item.availableCreditCentavos} wrap /> available</>
                    : 'No credit available'}
                </dd>
              </div>
            </>
          )}
        </dl>

        {isCreditCard && <WalletCreditProgress item={item} />}
        {isOverLimit && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink">
            <TriangleAlert aria-hidden="true" className="size-4" />
            Over your limit
          </p>
        )}
        {!isCreditCard && item.primaryAmountCentavos < 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink">
            <TriangleAlert aria-hidden="true" className="size-4" />
            Below zero
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary" className="ml-auto">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}
