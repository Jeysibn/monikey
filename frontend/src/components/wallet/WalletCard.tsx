import { useRef, useState } from 'react'
import { MoreHorizontal, Pencil, TriangleAlert } from 'lucide-react'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { formatPeso } from '@/lib/money'
import { MONIKEY_DEFAULT_ARTWORK_PATH } from '@/wallet/artworkCatalog'
import { faceFigure, usedShare, type WalletCardVM } from '@/wallet/walletModel'
import { WalletCardDetailsContent } from './WalletCardDetailsDialog'

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
      className="absolute top-1 right-1 z-20"
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
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
      >
        {/* A small dark dot on the art; the whole 44px square is the target. */}
        <span className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white">
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </span>
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

/*
 * Accounts card face (the owner's reference design): the figure sits straight on the artwork, bottom-left.
 * Liquid accounts show their balance. Credit cards show the credit still available, a thin line filled by
 * the share of the limit in use, and that share as "28% used". Card networks print their logo bottom-right,
 * so the block keeps to the left ~58% of the card. Sizes follow the card's width (container query units),
 * so the face reads the same in a four-column grid and on a phone. White text carries a soft shadow for
 * contrast on any design; bright designs and the light MoniKey card use dark ink instead.
 */
function CardFace({ item, onLightArt }: { item: WalletCardVM; onLightArt: boolean }) {
  // An image that failed to load falls back to the light MoniKey card, which always needs dark ink.
  const dark = onLightArt || item.faceInk === 'dark'
  const figure = faceFigure(item)
  const used = usedShare(item)
  return (
    <span
      className={`absolute bottom-[8%] left-[7%] z-10 grid w-[58%] min-w-0 ${dark ? 'text-[#0f1b2d] [text-shadow:0_0_3px_rgba(255,255,255,0.85)]' : 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]'}`}
    >
      <span className="text-[max(0.625rem,3.5cqw)] leading-tight font-semibold tracking-[0.08em] uppercase">{figure.label}</span>
      <MoneyText centavos={figure.centavos} className="text-[max(1rem,7cqw)] leading-tight font-bold tracking-[-0.01em]" />
      {used && (
        <span aria-hidden="true" className={`mt-[2.4cqw] block h-[max(3px,1.3cqw)] overflow-hidden rounded-full ${dark ? 'bg-black/15' : 'bg-white/35'}`}>
          <span className={`block h-full rounded-full ${dark ? 'bg-[#0f1b2d]' : 'bg-white'}`} style={{ width: `${used.percent}%` }} />
        </span>
      )}
      {figure.note && (
        <span className="mt-[1.2cqw] text-[max(0.5625rem,2.9cqw)] leading-tight font-semibold tracking-[0.06em] uppercase">{figure.note}</span>
      )}
    </span>
  )
}

function faceLabel(item: WalletCardVM): string {
  const figure = faceFigure(item)
  const parts = [`View details for ${item.accountName}`, accountTypeLabels[item.accountType], `${figure.label} ${formatPeso(figure.centavos)}`]
  if (figure.note) parts.push(figure.note)
  if (item.accountType === 'credit_card' && item.creditLimitCentavos !== null) parts.push(`${formatPeso(item.creditLimitCentavos)} limit`)
  return parts.join(', ')
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

  const onLightArt = imageSrc === null || imageSrc === MONIKEY_DEFAULT_ARTWORK_PATH

  return (
    <Dialog open={isAccountsCard && detailsOpen} onOpenChange={setDetailsOpen}>
      <li className={`min-w-0 ${className}`}>
        <article
          className={isAccountsCard
            ? 'relative h-full'
            : `relative h-full overflow-hidden rounded-card border bg-card p-3 transition-colors duration-150 motion-reduce:transition-none ${selected ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-border'}`}
        >
          <div
            className={`relative aspect-[1.586/1] rounded-[18px] ${isAccountsCard
              ? '@container' // no selected ring here: clicking opens details; keyboard focus keeps its outline
              : 'overflow-hidden bg-background'}`}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt=""
                onError={imageFailed}
                className="absolute inset-0 size-full rounded-[18px] object-contain"
              />
            ) : (
              <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-[18px] border border-border bg-card text-muted-foreground">
                <span className="text-sm font-semibold">MoniKey</span>
              </div>
            )}
            {isAccountsCard ? (
              <DialogTrigger asChild>
                <button
                  type="button"
                  aria-label={faceLabel(item)}
                  className="absolute inset-0 z-10 cursor-pointer rounded-[18px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => onSelect(item.accountId)}
                >
                  {onLightArt && (
                    // The MoniKey card has no issuer name, so it carries the account name instead.
                    <span className="absolute top-[36%] left-[11.75%] z-10 max-w-[76%] truncate text-[max(0.875rem,4.4cqw)] font-semibold text-foreground">
                      {item.accountName}
                    </span>
                  )}
                  <CardFace item={item} onLightArt={onLightArt} />
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
            fallbackNote && <span className="sr-only">{fallbackNote}</span>
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
