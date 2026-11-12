import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowLeftRight, ArrowRight, ArrowUpRight, CirclePlus, CreditCard } from 'lucide-react'

import { ErrorBlock } from '@/components/ErrorBlock'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { WalletCard } from '@/components/wallet/WalletCard'
import { buildWalletGalleryModel, type WalletCardVM } from '@/wallet/walletModel'
import type { WalletPreferencesV1 } from '@/wallet/walletPreferences'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot } from '@/types'

/*
 * Overview "Wallets" (the owner's reference design): a deck of account cards. The selected card sits in
 * front at full size, with its figure, details and three-dot menu; up to two earlier cards peek out on the
 * left and two later ones on the right. Click a peeking card, swipe, or press the arrow keys to bring
 * another card forward. Under the deck: which card is selected, then Open (its details), Expense (Quick
 * Add on this account) and Transfer, or Pay card for a credit card.
 *
 * Every visible card keeps the same positioned wrapper (keyed by account) as it moves between slots, so
 * the deck slides instead of jumping; motion is off when reduced motion is preferred.
 */
const PEEK = 2 // cards shown on each side of the front card; --front + 2 × --step = 50% + --front / 2 keeps the deck inside its box

function slotStyle(offset: number): CSSProperties {
  const distance = Math.abs(offset)
  return {
    left: `calc(50% - var(--front) / 2 + ${offset} * var(--step))`,
    width: 'var(--front)',
    transform: `scale(${1 - distance * 0.07})`,
    zIndex: 10 - distance,
  }
}

function PeekCard({ item, onSelect }: { item: WalletCardVM; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Show ${item.accountName}`}
      onClick={onSelect}
      className="block aspect-[1.586/1] w-full cursor-pointer overflow-hidden rounded-[18px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <img src={item.artUrl} alt="" draggable={false} className="size-full object-cover" onError={(event) => { event.currentTarget.hidden = true }} />
    </button>
  )
}

function SkeletonDeck() {
  return (
    <div aria-hidden="true" className="mt-3 grid gap-3">
      <span className="mx-auto block aspect-[1.586/1] w-[66%] rounded-[18px] bg-secondary md:w-[58%]" />
      <span className="mx-auto block h-4 w-40 rounded-chip bg-secondary" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <span key={i} className="block h-11 rounded-control bg-secondary" />)}
      </div>
    </div>
  )
}

export function WalletStack({
  accounts,
  loading = false,
  preferences,
  onEditAccount,
  onPayCard,
  onTransfer,
  onAddExpense,
  onOpenAccounts,
}: {
  accounts: Resource<AccountsSnapshot>
  loading?: boolean
  preferences: WalletPreferencesV1
  onEditAccount: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
  onTransfer: (fromAccountId: number) => void
  onAddExpense: (accountId: number) => void
  onOpenAccounts: () => void
}) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const swipe = useRef<number | null>(null)
  const swiped = useRef(false) // a swipe ends with a click on whatever was under it; ignore that click
  const deckRef = useRef<HTMLDivElement>(null)
  // A chosen peeking card turns into the front card, so the button that had focus disappears. Move focus
  // to the new front card, so the arrow keys keep working.
  const focusFront = useRef(false)
  useEffect(() => {
    if (!focusFront.current) return
    focusFront.current = false
    deckRef.current?.querySelector<HTMLElement>('ul [data-card-face]')?.focus()
  }, [selectedAccountId])
  const snapshot = accounts.data
  const wallet = snapshot ? buildWalletGalleryModel(snapshot, preferences) : null
  const items = wallet ? [...wallet.liquid, ...wallet.cards] : []

  if (!loading && snapshot && items.length === 0 && !accounts.error) return null

  const found = items.findIndex((item) => item.accountId === selectedAccountId)
  const selectedIndex = found === -1 ? 0 : found
  const selected = items[selectedIndex]
  const select = (index: number, moveFocus = false) => {
    const item = items[Math.max(0, Math.min(items.length - 1, index))]
    if (!item) return
    focusFront.current = moveFocus && deckRef.current?.contains(document.activeElement) === true
    setSelectedAccountId(item.accountId)
  }
  const visible = items
    .map((item, index) => ({ item, offset: index - selectedIndex }))
    .filter(({ offset }) => Math.abs(offset) <= PEEK)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); select(selectedIndex - 1, true) }
    if (event.key === 'ArrowRight') { event.preventDefault(); select(selectedIndex + 1, true) }
  }
  const onPointerDown = (event: PointerEvent) => { swipe.current = event.clientX }
  const onPointerUp = (event: PointerEvent) => {
    if (swipe.current === null) return
    const moved = event.clientX - swipe.current
    swipe.current = null
    swiped.current = Math.abs(moved) > 40
    if (swiped.current) select(selectedIndex + (moved < 0 ? 1 : -1))
  }

  const isCard = selected?.accountType === 'credit_card'
  const nothingToPay = selected?.primaryLabel === 'Card credit' || selected?.primaryLabel === 'Nothing owed'

  return (
    <Card role="region" aria-labelledby="wallet-stack-title" className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <CardTitle id="wallet-stack-title">Wallets</CardTitle>
          {selected && !loading && !accounts.error && (
            <span className="text-sm text-muted-foreground">{selectedIndex + 1} of {items.length}</span>
          )}
        </div>
        {snapshot && !loading && !accounts.error && (
          <Button type="button" variant="secondary" className="shrink-0 rounded-full" onClick={onOpenAccounts} aria-label={`View all ${items.length} accounts`}>
            All ({items.length})
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>

      {accounts.error ? (
        <ErrorBlock what="your accounts" updatedAt={accounts.updatedAt} onRetry={accounts.retry} focusAfter="#wallet-stack-title" className="mt-3" />
      ) : loading || !snapshot || !selected ? (
        <SkeletonDeck />
      ) : (
        <>
          <div
            ref={deckRef}
            role="group"
            aria-roledescription="card deck"
            aria-label="Accounts. Use the left and right arrow keys to move between cards."
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { swipe.current = null }}
            onClickCapture={(event) => {
              if (!swiped.current) return
              swiped.current = false
              event.preventDefault()
              event.stopPropagation()
            }}
            className="relative mt-3 touch-pan-y select-none [--front:66%] [--step:8.5%] md:[--front:58%] md:[--step:10.5%]"
            style={{ paddingBottom: 'calc(var(--front) / 1.586)' }}
          >
            {visible.map(({ item, offset }) => (
              <div
                key={item.accountId}
                className="absolute top-0 origin-center transition-[left,transform] duration-200 ease-out motion-reduce:transition-none"
                style={slotStyle(offset)}
              >
                {offset === 0 ? (
                  <ul className="m-0 list-none p-0">
                    <WalletCard
                      key={`${item.accountId}:${item.artUrl}`}
                      item={item}
                      onEdit={onEditAccount}
                      onPayCard={onPayCard}
                      detailsOpen={detailsOpen}
                      onDetailsOpenChange={setDetailsOpen}
                    />
                  </ul>
                ) : (
                  <PeekCard item={item} onSelect={() => select(items.indexOf(item), true)} />
                )}
              </div>
            ))}
          </div>

          <p aria-live="polite" className="mt-3 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-chip bg-secondary px-1.5 text-xs font-semibold text-foreground tabular-nums">
              {String(selectedIndex + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 truncate">
              Selected · <span className="font-semibold text-foreground">{selected.accountName}</span>
              {selected.productLabel && selected.productLabel !== selected.accountName ? ` · ${selected.productLabel}` : ''}
            </span>
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button type="button" variant="secondary" className="min-w-0" onClick={() => setDetailsOpen(true)} aria-label={`Open ${selected.accountName}`}>
              <ArrowUpRight aria-hidden="true" className="size-4" />
              Open
            </Button>
            <Button type="button" variant="secondary" className="min-w-0" onClick={() => onAddExpense(selected.accountId)} aria-label={`Add an expense on ${selected.accountName}`}>
              <CirclePlus aria-hidden="true" className="size-4" />
              Expense
            </Button>
            {isCard ? (
              <Button
                type="button"
                variant="secondary"
                className="min-w-0"
                disabled={nothingToPay}
                onClick={() => onPayCard(selected.accountId)}
                aria-label={nothingToPay ? `Pay card, ${selected.accountName}: nothing to pay` : `Pay card, ${selected.accountName}`}
              >
                <CreditCard aria-hidden="true" className="size-4" />
                Pay card
              </Button>
            ) : (
              <Button type="button" variant="secondary" className="min-w-0" onClick={() => onTransfer(selected.accountId)} aria-label={`Transfer from ${selected.accountName}`}>
                <ArrowLeftRight aria-hidden="true" className="size-4" />
                Transfer
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
