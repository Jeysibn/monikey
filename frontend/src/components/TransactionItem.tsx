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
  const grid = 'grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-px py-3.5 text-left'

  const content = (
    <>
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
      <div className={cn(grid, 'min-h-[68px] max-md:hidden md:grid-cols-[20px_minmax(0,1fr)_auto_auto]')}>
        {content}
        <div className="col-start-4 row-span-2 row-start-1 flex gap-1 self-center">
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
