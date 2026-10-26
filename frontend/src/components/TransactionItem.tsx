import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CreditCard, Pencil, Trash2 } from 'lucide-react'
import { cn } from 'cn'

import { MoneyText } from '@/components/MoneyText'
import { Button } from '@/components/ui/button'
import { formatPeso } from '@/lib/money'
import type { ActivityItem } from '@/types'

/*
 * One two-line row: marker, title, "Category · Account" and the amount on the right.
 * Meaning never relies on colour: each kind has its own marker icon, its own sign
 * (+ income, − expense, none for a card payment) and a hidden word for screen readers.
 * On Overview the whole row is a button that opens Activity. On Activity (`onEdit` and `onDelete` given)
 * a phone row is a button that opens Edit, and from 768px the row is plain content with a visible
 * Edit and Delete icon button each, so there is one control per action and none nested in another.
 */
const kinds = {
  income: { Icon: ArrowDownLeft, word: 'Income' },
  expense: { Icon: ArrowUpRight, word: 'Expense' },
  payment: { Icon: ArrowRightLeft, word: 'Card payment' },
  transfer: { Icon: ArrowRightLeft, word: 'Transfer' },
} as const

export function TransactionItem({
  item,
  onOpen,
  onEdit,
  onDelete,
  className,
}: {
  item: ActivityItem
  onOpen: (item: ActivityItem) => void
  onEdit?: (item: ActivityItem, opener: HTMLElement) => void
  onDelete?: (item: ActivityItem, opener: HTMLElement) => void
  className?: string
}) {
  const { Icon, word } = kinds[item.kind]
  const onCard = item.accountType === 'credit_card'
  const withActions = onEdit !== undefined && onDelete !== undefined
  // Icon, text and amount in a row that wraps: the amount drops under the text only when there is not
  // enough room (a very narrow screen or a big text-size setting), instead of squeezing the title to nothing.
  const grid = 'flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-3.5 text-left'

  const content = (
    <>
      <Icon aria-hidden="true" className="mr-1 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-28">
        <span className="block truncate text-base font-medium">
          <span className="sr-only">{word}: </span>
          {item.title}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">
            {item.kind === 'payment' ? (
              `${item.accountName} → ${item.cardName}`
            ) : item.kind === 'transfer' ? (
              `${item.accountName} → ${item.destinationAccountName}`
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
          {item.kind === 'transfer' && (
            <span className="hidden shrink-0 rounded-full bg-secondary px-2 text-xs font-semibold text-secondary-foreground md:inline">
              Transfer
            </span>
          )}
        </span>
      </div>
      <MoneyText centavos={item.amount} kind={item.kind} className="ml-auto shrink-0 text-base font-semibold" />
    </>
  )

  if (!withActions) {
    return (
      <li className={cn('border-t border-rule first:border-t-0', className)}>
        <button
          type="button"
          onClick={() => onOpen(item)}
          className={cn(grid, 'min-h-[68px] cursor-pointer')}
        >
          {content}
        </button>
      </li>
    )
  }

  const name = `${item.title}, ${formatPeso(item.amount)}`
  return (
    <li className={cn('border-t border-rule first:border-t-0', className)}>
      <button
        type="button"
        data-row={item.key}
        onClick={(e) => onEdit(item, e.currentTarget)}
        className={cn(grid, 'min-h-[68px] cursor-pointer md:hidden')}
      >
        {content}
      </button>
      <div className={cn(grid, 'min-h-[68px] max-md:hidden')}>
        {content}
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            data-row={item.key}
            aria-label={`Edit ${name}`}
            onClick={(e) => onEdit(item, e.currentTarget)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${name}`}
            onClick={(e) => onDelete(item, e.currentTarget)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
    </li>
  )
}
