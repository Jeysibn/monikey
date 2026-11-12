import { useRef, useState } from 'react'
import { MoreHorizontal, Pencil } from 'lucide-react'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { MONIKEY_DEFAULT_ARTWORK_PATH } from '@/wallet/artworkCatalog'
import { faceFigure, usedShare, type WalletCardVM } from '@/wallet/walletModel'
import { AccountDetailsContent } from '@/components/accounts/AccountDetailsContent'

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
      <span className="text-[max(0.6875rem,3.9cqw)] leading-tight font-semibold tracking-[0.08em] uppercase">{figure.label}</span>
      <MoneyText centavos={figure.centavos} className="mt-[0.6cqw] text-[max(1.125rem,8cqw)] leading-tight font-bold tracking-[-0.01em]" />
      {used && (
        <span aria-hidden="true" className={`mt-[2.8cqw] block h-[max(4px,1.6cqw)] overflow-hidden rounded-full ${dark ? 'bg-black/15' : 'bg-white/35'}`}>
          <span className={`block h-full rounded-full ${dark ? 'bg-[#0f1b2d]' : 'bg-white'}`} style={{ width: `${used.percent}%` }} />
        </span>
      )}
      {figure.note && (
        <span className="mt-[1.6cqw] text-[max(0.625rem,3.3cqw)] leading-tight font-semibold tracking-[0.06em] uppercase">{figure.note}</span>
      )}
    </span>
  )
}

/*
 * One account's card: its artwork with the figure printed bottom-left, the details dialog opened by
 * clicking the face, and the upper-right three-dot menu (Edit, Pay card). Used by the Accounts grid and,
 * as the front card, by the Overview wallet deck, which can also open the details itself ("Open").
 */
export function WalletCard({
  item,
  onSelect,
  onEdit,
  onPayCard,
  className = '',
  detailsOpen: controlledOpen,
  onDetailsOpenChange,
}: {
  item: WalletCardVM
  onSelect?: (accountId: number) => void
  onEdit: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
  className?: string
  detailsOpen?: boolean
  onDetailsOpenChange?: (open: boolean) => void
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(item.artUrl)
  const [fallbackNote, setFallbackNote] = useState('')
  const [ownOpen, setOwnOpen] = useState(false)
  const detailsOpen = controlledOpen ?? ownOpen
  const setDetailsOpen = onDetailsOpenChange ?? setOwnOpen

  const imageFailed = () => {
    if (imageSrc !== MONIKEY_DEFAULT_ARTWORK_PATH) {
      setImageSrc(MONIKEY_DEFAULT_ARTWORK_PATH)
      setFallbackNote('Using MoniKey default artwork.')
      return
    }
    setImageSrc(null)
    setFallbackNote('Artwork unavailable.')
  }

  const onLightArt = imageSrc === null || imageSrc === MONIKEY_DEFAULT_ARTWORK_PATH

  return (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <li className={`min-w-0 ${className}`}>
        <article className="relative h-full">
          {/* No selected ring: clicking opens details; keyboard focus keeps its outline. */}
          <div className="@container relative aspect-[1.586/1] rounded-[18px]">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt=""
                onError={imageFailed}
                className="absolute inset-0 size-full rounded-[18px] object-cover"
              />
            ) : (
              <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-[18px] border border-border bg-card text-muted-foreground">
                <span className="text-sm font-semibold">MoniKey</span>
              </div>
            )}
            <DialogTrigger asChild>
              <button
                type="button"
                data-card-face=""
                className="absolute inset-0 z-10 cursor-pointer rounded-[18px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => onSelect?.(item.accountId)}
              >
                {/* Real card artwork already carries the issuer's look, so the face shows no name or type; they are in the details window. A generic MoniKey card has no identity of its own, so its name stays visible. */}
                {onLightArt ? (
                  <span className="absolute top-[29%] left-[11.75%] z-10 grid max-w-[77%] gap-[0.4cqw] text-[#0f1b2d]">
                    <span className="truncate text-[max(0.875rem,4.4cqw)] font-semibold">{item.accountName}</span>
                  </span>
                ) : (
                  <span className="sr-only">
                    {item.accountName}
                    {item.productLabel ? `, ${item.productLabel}` : ''}
                  </span>
                )}
                <CardFace item={item} onLightArt={onLightArt} />
                <span className="sr-only">View details</span>
                {fallbackNote && <span className="sr-only">{fallbackNote}</span>}
              </button>
            </DialogTrigger>
            <AccountCardActions item={item} onEdit={onEdit} onPayCard={onPayCard} />
          </div>
        </article>
      </li>
      <AccountDetailsContent item={item} imageSrc={imageSrc} onImageError={imageFailed} onClose={() => setDetailsOpen(false)} />
    </Dialog>
  )
}
