import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { getSelectableWalletArtworks, MONIKEY_DEFAULT_ARTWORK_ID } from '@/wallet/artworkCatalog'
import type { AccountType } from '@/types'

export function WalletDesignPicker({
  accountId,
  accountType,
  selectedArtworkId,
  savedArtworkId,
  disabled = false,
  onSave,
}: {
  accountId: number
  accountType: AccountType
  selectedArtworkId: string
  savedArtworkId: string | null
  disabled?: boolean
  onSave: (artworkId: string) => boolean
}) {
  const [selection, setSelection] = useState(selectedArtworkId)
  const [message, setMessage] = useState('')
  const artworks = getSelectableWalletArtworks(accountType)
  const hasIssuerArtwork = artworks.some((artwork) => artwork.kind !== 'fallback')

  const save = () => {
    const saved = onSave(selection)
    setMessage(saved
      ? 'Appearance saved on this device. It does not change your account balance.'
      : 'Couldn’t save appearance on this device. Your account data was not changed.')
  }

  return (
    <section aria-labelledby={`wallet-appearance-title-${accountId}`} className="grid gap-3 rounded-card border border-border p-4">
      <div className="grid gap-1">
        <h3 id={`wallet-appearance-title-${accountId}`} className="text-base font-semibold">Card appearance</h3>
        {!hasIssuerArtwork && (
          <p className="text-sm text-muted-foreground">Official design unavailable — using MoniKey default.</p>
        )}
        <p className="text-sm text-muted-foreground">This preference stays in this browser and does not sync to other devices.</p>
      </div>

      <fieldset disabled={disabled} className="m-0 grid gap-2 border-0 p-0">
        <legend className="sr-only">Choose an appearance for this account</legend>
        {artworks.map((artwork) => (
          <label
            key={artwork.id}
            className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-control border p-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${selection === artwork.id ? 'border-primary bg-primary-soft/40' : 'border-border bg-card'}`}
          >
            <input
              type="radio"
              name={`wallet-appearance-${accountId}`}
              value={artwork.id}
              checked={selection === artwork.id}
              onChange={() => {
                setSelection(artwork.id)
                setMessage('')
              }}
              className="size-4 shrink-0 accent-primary"
            />
            <img src={artwork.localAssetPath ?? ''} alt="" className="h-12 w-[76px] shrink-0 rounded-control object-contain" />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm font-semibold">
                {artwork.id === MONIKEY_DEFAULT_ARTWORK_ID ? 'MoniKey default' : `${artwork.issuer} ${artwork.product}`}
              </span>
              <span className="truncate text-xs text-muted-foreground">{artwork.variant}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {message && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}
      <Button type="button" variant="secondary" className="w-full" disabled={disabled || selection === savedArtworkId} onClick={save}>
        Save appearance
      </Button>
    </section>
  )
}
