import { Check } from 'lucide-react'
import { cn } from 'cn'

import { CATEGORY_COLOR_OPTIONS, DEFAULT_CATEGORY_COLOR, type CategoryColorKey } from '@/lib/categoryColors'

/*
 * The curated color choice for a category: native radio inputs (arrow keys move, Tab leaves) drawn as
 * swatches. "Default" is its own choice (no color stored, neutral slate). The chosen swatch shows a check mark
 * and its name is announced, so the choice never depends on color alone.
 */
const entries = Object.entries(CATEGORY_COLOR_OPTIONS) as [CategoryColorKey, (typeof CATEGORY_COLOR_OPTIONS)[CategoryColorKey]][]

export function CategoryColorPicker({ value, onChange, disabled }: { value: CategoryColorKey | null; onChange: (value: CategoryColorKey | null) => void; disabled?: boolean }) {
  const options: { key: CategoryColorKey | null; label: string; solid: string }[] = [
    { key: null, label: 'Default', solid: DEFAULT_CATEGORY_COLOR.solid },
    ...entries.map(([key, color]) => ({ key, label: color.label, solid: color.solid })),
  ]
  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1 text-sm font-medium">
        Category color <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const checked = value === option.key
          return (
            <label key={option.label} className="relative block">
              <input
                type="radio"
                name="category-color"
                value={option.key ?? ''}
                checked={checked}
                onChange={() => onChange(option.key)}
                aria-label={option.label}
                className="peer sr-only"
              />
              <span
                title={option.label}
                style={{ backgroundColor: option.solid }}
                className={cn(
                  'grid size-11 cursor-pointer place-items-center rounded-full border-2 border-card text-white shadow-[0_0_0_1px_var(--input)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
                  option.key === null && 'border-dashed',
                  checked && 'shadow-[0_0_0_2px_var(--primary)]',
                )}
              >
                {checked && <Check aria-hidden="true" className="size-5" />}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
