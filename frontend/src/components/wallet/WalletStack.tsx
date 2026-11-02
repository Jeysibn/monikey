import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { ErrorBlock } from '@/components/ErrorBlock'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { WalletCard } from '@/components/wallet/WalletCard'
import { buildWalletGalleryModel } from '@/wallet/walletModel'
import type { WalletPreferencesV1 } from '@/wallet/walletPreferences'
import type { Resource } from '@/useResource'
import type { AccountsSnapshot } from '@/types'

function SkeletonCard() {
  return (
    <div aria-hidden="true" className="grid gap-3">
      <span className="block aspect-[1.586/1] rounded-card bg-secondary" />
      <span className="block h-5 w-40 rounded-chip bg-secondary" />
      <span className="block h-6 w-32 rounded-chip bg-secondary" />
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
  onOpenAccounts,
}: {
  accounts: Resource<AccountsSnapshot>
  loading?: boolean
  preferences: WalletPreferencesV1
  onEditAccount: (accountId: number, from: HTMLElement) => void
  onPayCard: (cardId: number) => void
  onTransfer: () => void
  onOpenAccounts: () => void
}) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const snapshot = accounts.data
  const wallet = snapshot ? buildWalletGalleryModel(snapshot, preferences) : null
  const items = wallet ? [...wallet.liquid, ...wallet.cards] : []

  if (!loading && snapshot && items.length === 0 && !accounts.error) return null

  const selectedIndex = Math.max(0, items.findIndex((item) => item.accountId === selectedAccountId))
  const selected = items[selectedIndex]
  const selectIndex = (index: number) => {
    const item = items[(index + items.length) % items.length]
    if (item) setSelectedAccountId(item.accountId)
  }
  const adjacentItems = items.length > 1
    ? [items[(selectedIndex + items.length - 1) % items.length], items[(selectedIndex + 1) % items.length]]
    : []

  return (
    <Card role="region" aria-labelledby="wallet-stack-title" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardTitle id="wallet-stack-title">Your accounts</CardTitle>
        {snapshot && !loading && !accounts.error && <span className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? 'account' : 'accounts'}</span>}
      </div>
      <CardDescription>Choose an account to see its current balance or card debt.</CardDescription>

      {accounts.error ? (
        <ErrorBlock what="your accounts" updatedAt={accounts.updatedAt} onRetry={accounts.retry} focusAfter="#wallet-stack-title" className="mt-3" />
      ) : loading || !snapshot ? (
        <div className="mt-3" aria-hidden="true"><SkeletonCard /></div>
      ) : (
        <>
          <ul className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-1 px-1 pb-3 md:hidden">
            {items.map((item) => (
              <WalletCard
                key={`${item.accountId}:${item.artworkId}`}
                item={item}
                selected={(selected?.accountId ?? items[0]?.accountId) === item.accountId}
                onSelect={setSelectedAccountId}
                onEdit={onEditAccount}
                onPayCard={onPayCard}
                className="w-[86%] max-w-sm shrink-0 snap-center"
              />
            ))}
          </ul>

          {selected && (
            <div className="hidden min-w-0 items-center gap-5 md:grid md:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto]">
              <ul className="relative mx-auto mt-3 grid w-full max-w-sm grid-cols-1 list-none px-1 pt-8">
                {adjacentItems.map((item, index) => (
                  <li
                    key={`preview:${item.accountId}:${index}`}
                    aria-hidden="true"
                    className={`absolute aspect-[1.586/1] overflow-hidden rounded-card border border-border bg-background ${index === 0 ? 'inset-x-7 top-0 z-0' : 'inset-x-3 top-4 z-10'}`}
                  >
                    <img src={item.artUrl} alt="" onError={(event) => { event.currentTarget.hidden = true }} className="size-full object-contain" />
                  </li>
                ))}
                <WalletCard
                  key={`${selected.accountId}:${selected.artworkId}:selected`}
                  item={selected}
                  selected
                  onSelect={setSelectedAccountId}
                  onEdit={onEditAccount}
                  onPayCard={onPayCard}
                  className="relative z-20"
                />
              </ul>
              {items.length > 1 && (
                <div className="grid justify-items-center gap-2">
                  <p aria-live="polite" className="max-w-40 text-center text-sm text-muted-foreground">
                    {selectedIndex + 1} of {items.length}: {selected.accountName}
                  </p>
                  <Button type="button" variant="secondary" onClick={() => selectIndex(selectedIndex - 1)}>
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    Previous
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => selectIndex(selectedIndex + 1)}>
                    Next
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
            {selected?.accountType !== 'credit_card' && selected && (
              <Button type="button" variant="secondary" onClick={onTransfer}>Transfer</Button>
            )}
            <Button type="button" variant="link" className="ml-auto" onClick={onOpenAccounts}>View all accounts</Button>
          </div>
        </>
      )}
    </Card>
  )
}
