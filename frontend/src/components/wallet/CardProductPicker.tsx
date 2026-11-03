import { Check } from 'lucide-react'
import { cn } from 'cn'

import { MONIKEY_DEFAULT_ARTWORK_PATH } from '@/wallet/artworkCatalog'
import { cardIssuers, cardProductsFor, type CardAccountType, type CardProduct } from '@/wallet/cardProducts'

/*
 * Add account, step two: pick the bank or provider, then the exact card. Every card is drawn with the neutral MoniKey design; the name is only a label.
 * "Other" keeps the neutral MoniKey card. Used by Add account and Edit account; the card can be changed anytime.
 * Both steps are native radio groups: arrow keys move between options, Tab leaves the group.
 */
export const OTHER_ISSUER = 'Other'

const ISSUER_LEGEND: Record<CardAccountType, string> = {
  bank: 'Bank',
  ewallet: 'E-wallet provider',
  credit_card: 'Card issuer',
}

function productLegend(accountType: CardAccountType, issuer: string): string {
  return accountType === 'credit_card' ? `Which ${issuer} credit card?` : `Which ${issuer} card?`
}

export function CardProductPicker({
  accountType,
  issuer,
  productId,
  onIssuerChange,
  onProductChange,
}: {
  accountType: CardAccountType
  issuer: string | null
  productId: string | null
  onIssuerChange: (issuer: string) => void
  onProductChange: (product: CardProduct) => void
}) {
  const issuers = [...cardIssuers(accountType), OTHER_ISSUER]
  const products = issuer && issuer !== OTHER_ISSUER ? cardProductsFor(accountType, issuer) : []

  return (
    <div className="grid min-w-0 gap-4">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">{ISSUER_LEGEND[accountType]}</legend>
        <div className="flex flex-wrap gap-2">
          {issuers.map((name) => (
            <label key={name} className="relative">
              <input
                type="radio"
                name="aa-issuer"
                value={name}
                checked={issuer === name}
                onChange={() => onIssuerChange(name)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-[0.9375rem] font-semibold',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                  issuer === name ? 'border-primary bg-primary-soft text-primary-ink' : 'border-input bg-card text-foreground',
                )}
              >
                {issuer === name && <Check aria-hidden="true" className="size-4" />}
                {name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {issuer === OTHER_ISSUER && (
        <p className="text-sm text-muted-foreground">This account uses the MoniKey card design.</p>
      )}

      {products.length > 0 && issuer && (
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1.5 text-sm font-medium">{productLegend(accountType, issuer)}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {products.map((product) => {
              const checked = productId === product.id
              return (
                <label key={product.id} className="relative block min-w-0">
                  <input
                    type="radio"
                    name="aa-card-product"
                    value={product.id}
                    checked={checked}
                    onChange={() => onProductChange(product)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'grid cursor-pointer gap-2 rounded-control border p-2',
                      'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                      checked ? 'border-primary bg-primary-soft' : 'border-input bg-card',
                    )}
                  >
                    <img src={MONIKEY_DEFAULT_ARTWORK_PATH} alt="" className="block aspect-[1.586/1] w-full rounded-[8px] object-cover" />
                    <span className="flex min-w-0 items-start gap-1">
                      {checked && <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-ink" />}
                      <span className="grid min-w-0">
                        <span className="text-sm leading-5 font-semibold break-words">{product.name}</span>
                      </span>
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Cards use MoniKey&rsquo;s own design. The name is a label; it isn&rsquo;t the issuer&rsquo;s official card design.</p>
        </fieldset>
      )}

      {issuer && (
        <p className="text-xs text-muted-foreground">You can change the card anytime in Edit account. It doesn&rsquo;t affect your balance.</p>
      )}
    </div>
  )
}
