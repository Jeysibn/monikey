import { colorFor } from '@/lib/categoryColors'
import { CategoryIcon } from '@/lib/categoryIcons'
import { cn } from 'cn'

/*
 * A category's tinted icon square (spec §5.5): the persisted icon on the persisted color, falling back to the
 * generic icon on neutral slate. Decorative (aria-hidden): the category name is always written next to it.
 * Colors come only from the closed registry in lib/categoryColors.ts, never from data.
 */
export function CategoryBadge({
  iconKey,
  colorKey,
  size = 'md',
  className,
}: {
  iconKey?: string | null
  colorKey?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const color = colorFor(colorKey)
  return (
    <span
      aria-hidden="true"
      data-category-badge=""
      style={{ backgroundColor: color.bg, color: color.fg }}
      className={cn('inline-grid shrink-0 place-items-center', size === 'sm' ? 'size-6 rounded-md' : size === 'md' ? 'size-9 rounded-control' : 'size-11 rounded-control', className)}
    >
      <CategoryIcon iconKey={iconKey} className={size === 'sm' ? 'size-3.5' : size === 'md' ? 'size-[1.125rem]' : 'size-5'} />
    </span>
  )
}
