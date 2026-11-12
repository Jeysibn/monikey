import { CategoryBadge } from '@/components/CategoryBadge'
import { Button } from '@/components/ui/button'
import { usageText } from '@/lib/categoryList'
import { envelopeLabel } from '@/lib/kakeibo'
import type { Category } from '@/types'

/*
 * One category in the list: its appearance, name, what it is (type, default envelope, how much it is used)
 * and its actions. Edit opens the dialog (where Delete lives); Archive asks first, Restore does not need to.
 * Every control has a 44px touch target and a name that includes the category, for screen readers.
 */
export function CategoryRow({
  category,
  disabled,
  onEdit,
  onArchive,
  onRestore,
}: {
  category: Category
  disabled: boolean
  onEdit: (category: Category, opener: HTMLElement) => void
  onArchive: (category: Category, opener: HTMLElement) => void
  onRestore: (category: Category) => void
}) {
  const parts = [
    category.type === 'expense' ? (category.defaultEnvelope ? `Default: ${envelopeLabel(category.defaultEnvelope)}` : 'No default envelope') : 'Income',
    usageText(category),
  ].filter(Boolean)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3" data-category-row="">
      <CategoryBadge iconKey={category.iconKey} colorKey={category.colorKey} size="lg" />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate font-semibold">
          {category.name}
          {category.archived && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">Archived</span>}
        </p>
        <p className="text-sm text-muted-foreground">{parts.join(' · ')}</p>
      </div>
      <div className="flex w-full justify-end gap-2 sm:w-auto">
        <Button aria-label={`Edit ${category.name}`} variant="secondary" className="min-h-11" disabled={disabled} onClick={(e) => onEdit(category, e.currentTarget)}>
          Edit
        </Button>
        {category.archived ? (
          <Button aria-label={`Restore ${category.name}`} variant="secondary" className="min-h-11" disabled={disabled} onClick={() => onRestore(category)}>
            Restore
          </Button>
        ) : (
          <Button aria-label={`Archive ${category.name}`} variant="secondary" className="min-h-11" disabled={disabled} onClick={(e) => onArchive(category, e.currentTarget)}>
            Archive
          </Button>
        )}
      </div>
    </li>
  )
}
