import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CreditCard } from 'lucide-react'
import { cn } from 'cn'

import { MoneyText } from '@/components/MoneyText'
import type { ActivityItem } from '@/types'

/*
 * One two-line row: marker, title, "Category · Account" and the amount on the right.
 * Meaning never relies on colour: each kind has its own marker icon, its own sign
 * (+ income, − expense, none for a card payment) and a hidden word for screen readers.
 * The whole row is a button; on Overview it is a read-only preview that opens Activity.
 */
const kinds = {
  income: { Icon: ArrowDownLeft, word: 'Income' },
  expense: { Icon: ArrowUpRight, word: 'Expense' },
  payment: { Icon: ArrowRightLeft, word: 'Card payment' },
} as const

export function TransactionItem({
  item,
  onOpen,
  className,
}: {
  item: ActivityItem
  onOpen: (item: ActivityItem) => void
  className?: string
}) {
  const { Icon, word } = kinds[item.kind]
  const onCard = item.accountType === 'credit_card'

  return (
    <li className={cn('border-t border-rule first:border-t-0', className)}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="grid min-h-[68px] w-full cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-px py-3.5 text-left"
      >
        <Icon aria-hidden="true" className="col-start-1 row-span-2 size-4 self-center text-muted-foreground" />
        <span className="col-start-2 truncate text-base font-medium">
          <span className="sr-only">{word}: </span>
          {item.title}
        </span>
        <MoneyText
          centavos={item.amount}
          kind={item.kind}
          className="col-start-3 row-span-2 row-start-1 self-center text-base font-semibold"
        />
        <span className="col-start-2 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">
            {item.kind === 'payment' ? (
              `${item.accountName} → ${item.cardName}`
            ) : (
              <>
                {item.categoryName} ·{' '}
                {onCard && <CreditCard aria-hidden="true" className="mr-1 inline size-4 align-[-3px]" />}
                {item.accountName}
              </>
            )}
          </span>
          {item.kind === 'payment' && (
            <span className="hidden shrink-0 rounded-full bg-secondary px-2 text-xs font-semibold text-secondary-foreground md:inline">
              Payment
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
