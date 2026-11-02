import { useState } from 'react'
import { Check, CreditCard, Pencil, TriangleAlert } from 'lucide-react'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { MONIKEY_DEFAULT_ARTWORK_PATH } from '@/wallet/artworkCatalog'
import type { WalletCardVM } from '@/wallet/walletModel'

const accountTypeLabels = {
  cash: 'Cash',
  bank: 'Bank account',
  ewallet: 'E-wallet',
  credit_card: 'Credit card',
} as const

export function WalletCard({
  item,
  selected,
  onSelect,
  onEdit,
  onPayCard,
  className = '',
}: {
  item: WalletCardVM
  selected: boolean
  onSelect: (accountId: number) => void
  onEdit: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
  className?: string
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(item.artUrl)
  const [fallbackNote, setFallbackNote] = useState('')

  const imageFailed = () => {
    if (imageSrc !== MONIKEY_DEFAULT_ARTWORK_PATH) {
      setImageSrc(MONIKEY_DEFAULT_ARTWORK_PATH)
      setFallbackNote('Using MoniKey default artwork.')
      return
    }
    // If even the bundled fallback cannot load, use a neutral CSS surface instead of a broken image.
    setImageSrc(null)
    setFallbackNote('Artwork unavailable.')
  }

  const isCreditCard = item.accountType === 'credit_card'
  // The fallback is our own neutral card face, so account details can safely
  // be composed into it. Issuer artwork stays untouched when it is approved.
  const showFallbackDetails = imageSrc === MONIKEY_DEFAULT_ARTWORK_PATH || imageSrc === null
  const reason = item.primaryLabel === 'Card credit'
    ? 'No debt to pay'
    : item.primaryLabel === 'Nothing owed'
      ? 'Nothing to pay'
      : null
  const reasonId = `wallet-pay-reason-${item.accountId}`
  const primaryColor = item.primaryLabel === 'Owed'
    ? 'text-debt'
    : item.primaryLabel === 'Card credit'
      ? 'text-primary-ink'
      : ''

  return (
    <li className={`min-w-0 ${className}`}>
      <article className={`h-full overflow-hidden rounded-card border bg-card p-3 transition-colors duration-150 motion-reduce:transition-none ${selected ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border'}`}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(item.accountId)}
          className="block min-h-11 w-full rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="relative aspect-[1.586/1] overflow-hidden rounded-[18px] bg-background">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt=""
                onError={imageFailed}
                className="block size-full object-contain"
              />
            ) : (
              <div aria-hidden="true" className="flex size-full items-center justify-center bg-card text-muted-foreground">
                <span className="text-sm font-semibold">MoniKey</span>
              </div>
            )}
            {showFallbackDetails && (
              <div className="absolute inset-0 flex flex-col justify-between bg-card/95 p-3 text-foreground sm:p-4">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-primary-ink sm:text-xs">MoniKey · {accountTypeLabels[item.accountType]}</div>
                    <div className="mt-1 line-clamp-2 break-words text-sm leading-4 font-semibold sm:text-base sm:leading-5">{item.accountName}</div>
                  </div>
                  {isCreditCard && <CreditCard aria-hidden="true" className="size-4 shrink-0 text-primary-ink sm:size-5" />}
                </div>
                <div className="flex min-w-0 items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-muted-foreground sm:text-xs">{item.primaryLabel}</div>
                    <MoneyText
                      centavos={item.primaryAmountCentavos}
                      kind={item.primaryLabel === 'Owed' ? 'debt' : 'plain'}
                      wrap
                      className={`block text-sm leading-4 font-bold tracking-[-0.015em] sm:text-lg sm:leading-5 ${primaryColor}`}
                    />
                  </div>
                  {isCreditCard && (
                    <div className="max-w-[48%] text-right">
                      <div className="text-[10px] text-muted-foreground sm:text-xs">Available credit</div>
                      {item.availableCreditCentavos !== null && item.availableCreditCentavos > 0
                        ? <MoneyText centavos={item.availableCreditCentavos} wrap className="block text-xs leading-4 font-semibold sm:text-sm" />
                        : <span className="block text-xs leading-4 font-semibold sm:text-sm">None</span>}
                      {item.creditLimitCentavos !== null && (
                        <div className="mt-0.5 text-[10px] leading-3 text-muted-foreground sm:text-xs sm:leading-4">
                          Limit <MoneyText centavos={item.creditLimitCentavos} wrap />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!showFallbackDetails && <div className="mt-3 flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="break-words text-base leading-5 font-semibold">{item.accountName}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                {isCreditCard && <CreditCard aria-hidden="true" className="size-4 shrink-0" />}
                {accountTypeLabels[item.accountType]}
              </div>
            </div>
            {selected && (
              <span className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-chip bg-primary-soft px-2 text-xs font-semibold text-primary-ink">
                <Check aria-hidden="true" className="size-3.5" />
                Selected
              </span>
            )}
          </div>}

          {!showFallbackDetails && <div className="mt-3 border-t border-rule pt-3">
            <div className="flex items-start justify-between gap-2">
              <span className="pt-1 text-sm text-muted-foreground">{item.primaryLabel}</span>
              <MoneyText
                centavos={item.primaryAmountCentavos}
                kind={item.primaryLabel === 'Owed' ? 'debt' : 'plain'}
                wrap
                className={`text-xl leading-6 font-semibold tracking-[-0.015em] ${primaryColor}`}
              />
            </div>
            {item.accountType === 'cash' || item.accountType === 'bank' || item.accountType === 'ewallet' ? (
              item.primaryAmountCentavos < 0 && (
                <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  Below zero
                </div>
              )
            ) : (
              <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span>Available credit</span>
                  <span className="font-semibold text-foreground">
                    {item.availableCreditCentavos !== null && item.availableCreditCentavos > 0
                      ? <><MoneyText centavos={item.availableCreditCentavos} wrap /> available</>
                      : 'No credit available'}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span>Credit limit</span>
                  {item.creditLimitCentavos !== null && <MoneyText centavos={item.creditLimitCentavos} wrap />}
                </div>
                {item.availableCreditCentavos !== null && item.availableCreditCentavos <= 0 && item.primaryLabel === 'Owed' && (
                  <div className="inline-flex items-center gap-1.5 font-medium text-warning-ink">
                    <TriangleAlert aria-hidden="true" className="size-4" />
                    Over your limit
                  </div>
                )}
              </div>
            )}
            {fallbackNote && <span className="sr-only">{fallbackNote}</span>}
          </div>}
          {showFallbackDetails && (item.accountType === 'cash' || item.accountType === 'bank' || item.accountType === 'ewallet') && item.primaryAmountCentavos < 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink">
              <TriangleAlert aria-hidden="true" className="size-4" />
              Below zero
            </div>
          )}
        </button>

        {selected && (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-rule pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={(event) => onEdit(item.accountId, event.currentTarget)}
              aria-label={`Edit account, ${item.accountName}`}
              className="w-full min-w-0"
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit account
            </Button>
            {isCreditCard && (
              <>
                {reason && <span id={reasonId} className="sr-only">{reason}</span>}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onPayCard(item.accountId)}
                  disabled={reason !== null}
                  aria-describedby={reason ? reasonId : undefined}
                  aria-label={`Pay card, ${item.accountName}`}
                  className="w-full min-w-0"
                >
                  Pay card
                </Button>
              </>
            )}
          </div>
        )}
      </article>
    </li>
  )
}
