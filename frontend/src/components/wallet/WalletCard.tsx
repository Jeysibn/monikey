import { useRef, useState } from 'react'
import { MoreHorizontal, Pencil, TriangleAlert } from 'lucide-react'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { formatPeso } from '@/lib/money'
import { MONIKEY_DEFAULT_ARTWORK_PATH } from '@/wallet/artworkCatalog'
import type { WalletCardVM } from '@/wallet/walletModel'
import { WalletCardDetailsContent, WalletCreditProgress } from './WalletCardDetailsDialog'

const accountTypeLabels = {
  cash: 'Cash',
  bank: 'Bank account',
  ewallet: 'E-wallet',
  credit_card: 'Credit card',
} as const

function AccountCardActions({
  item,
  onEdit,
  onPayCard,
}: {
  item: WalletCardVM
  onEdit: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
}) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const triggerRef = useRef<HTMLElement>(null)
  const isCreditCard = item.accountType === 'credit_card'
  const reason = item.primaryLabel === 'Card credit' ? 'No debt to pay' : item.primaryLabel === 'Nothing owed' ? 'Nothing to pay' : null
  const reasonId = `wallet-menu-pay-reason-${item.accountId}`

  const closeMenu = () => {
    menuRef.current?.removeAttribute('open')
    triggerRef.current?.focus()
  }

  return (
    <details
      ref={menuRef}
      className="absolute top-2 right-2 z-20"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) menuRef.current?.removeAttribute('open')
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeMenu()
      }}
    >
      <summary
        ref={triggerRef}
        aria-label={`Card actions for ${item.accountName}`}
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-control border border-border bg-card text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </summary>
      <div className="absolute top-full right-0 mt-1 grid w-48 gap-1 rounded-card border border-border bg-card p-1">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            closeMenu()
            onEdit(item.accountId, triggerRef.current!)
          }}
        >
          <Pencil aria-hidden="true" className="size-4" />
          Edit account
        </Button>
        {isCreditCard && (
          <>
            {reason && <span id={reasonId} className="sr-only">{reason}</span>}
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={reason !== null}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => {
                closeMenu()
                onPayCard(item.accountId)
              }}
            >
              Pay card
            </Button>
          </>
        )}
      </div>
    </details>
  )
}

export function WalletCard({
  item,
  selected,
  onSelect,
  onEdit,
  onPayCard,
  className = '',
  variant = 'stack',
}: {
  item: WalletCardVM
  selected: boolean
  onSelect: (accountId: number) => void
  onEdit: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
  className?: string
  variant?: 'stack' | 'accounts'
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(item.artUrl)
  const [fallbackNote, setFallbackNote] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const isAccountsCard = variant === 'accounts'
  const isCreditCard = item.accountType === 'credit_card'
  const reason = item.primaryLabel === 'Card credit'
    ? 'No debt to pay'
    : item.primaryLabel === 'Nothing owed'
      ? 'Nothing to pay'
      : null
  const reasonId = `wallet-pay-reason-${item.accountId}`
  const formattedAmount = formatPeso(item.primaryAmountCentavos)

  const imageFailed = () => {
    if (imageSrc !== MONIKEY_DEFAULT_ARTWORK_PATH) {
      setImageSrc(MONIKEY_DEFAULT_ARTWORK_PATH)
      setFallbackNote('Using MoniKey default artwork.')
      return
    }
    setImageSrc(null)
    setFallbackNote('Artwork unavailable.')
  }

  const balanceOverlay = (
    <span className="absolute bottom-[6%] left-[6%] z-10 grid max-w-[72%] gap-0">
      <span className="text-xs leading-4 font-semibold uppercase tracking-[0.1em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {item.primaryLabel}
      </span>
      <MoneyText
        centavos={item.primaryAmountCentavos}
        wrap
        className="text-sm leading-5 font-semibold tracking-[-0.01em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:text-base sm:leading-5"
      />
    </span>
  )

  return (
    <Dialog open={isAccountsCard && detailsOpen} onOpenChange={setDetailsOpen}>
      <li className={`min-w-0 ${className}`}>
        <article className={`relative h-full rounded-card border bg-card p-3 transition-colors duration-150 motion-reduce:transition-none ${isAccountsCard ? 'overflow-visible' : 'overflow-hidden'} ${selected ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border'}`}>
          <div className="relative aspect-[1.586/1] overflow-hidden rounded-[18px] bg-background">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt=""
                onError={imageFailed}
                className="absolute inset-0 size-full object-contain"
              />
            ) : (
              <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-card text-muted-foreground">
                <span className="text-sm font-semibold">MoniKey</span>
              </div>
            )}
            {isAccountsCard ? (
              <DialogTrigger asChild>
                <button
                  type="button"
                  aria-label={`View details for ${item.accountName}, ${accountTypeLabels[item.accountType]}, ${item.primaryLabel} ${formattedAmount}`}
                  className="absolute inset-0 z-10 rounded-[18px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => onSelect(item.accountId)}
                >
                  {balanceOverlay}
                  {fallbackNote && <span className="sr-only">{fallbackNote}</span>}
                </button>
              </DialogTrigger>
            ) : (
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(item.accountId)}
                className="absolute inset-0 z-10 rounded-[18px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {balanceOverlay}
                {fallbackNote && <span className="sr-only">{fallbackNote}</span>}
              </button>
            )}
            {isAccountsCard && <AccountCardActions item={item} onEdit={onEdit} onPayCard={onPayCard} />}
          </div>

          {isAccountsCard ? (
            <>
              {isCreditCard && <WalletCreditProgress item={item} />}
              {isCreditCard && item.availableCreditCentavos !== null && item.availableCreditCentavos < 0 && item.primaryLabel === 'Owed' && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  Over your limit
                </div>
              )}
              {fallbackNote && <span className="sr-only">{fallbackNote}</span>}
            </>
          ) : (
            <>
              <div className="mt-3 flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words text-base leading-5 font-semibold">{item.accountName}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{accountTypeLabels[item.accountType]}</div>
                </div>
                {selected && <span className="inline-flex min-h-6 shrink-0 items-center rounded-chip bg-primary-soft px-2 text-xs font-semibold text-primary-ink">Selected</span>}
              </div>
              {isCreditCard && (
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
                  {item.availableCreditCentavos !== null && item.availableCreditCentavos < 0 && item.primaryLabel === 'Owed' && (
                    <div className="inline-flex items-center gap-1.5 font-medium text-warning-ink">
                      <TriangleAlert aria-hidden="true" className="size-4" />
                      Over your limit
                    </div>
                  )}
                </div>
              )}
              {fallbackNote && <span className="sr-only">{fallbackNote}</span>}
              {!isCreditCard && item.primaryAmountCentavos < 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-warning-ink">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  Below zero
                </div>
              )}

              {selected && (
                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-rule pt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={(event) => onEdit(item.accountId, event.currentTarget)}
                    aria-label={`Edit account, ${item.accountName}`}
                    className="w-full min-w-0"
                  >
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
            </>
          )}
        </article>
      </li>
      {isAccountsCard && (
        <WalletCardDetailsContent item={item} imageSrc={imageSrc} onImageError={imageFailed} />
      )}
    </Dialog>
  )
}
