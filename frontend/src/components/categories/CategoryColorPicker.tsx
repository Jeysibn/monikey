import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from 'cn'

import { CATEGORY_COLOR_OPTIONS, DEFAULT_CATEGORY_COLOR, colorFor, isCustomColor, normalizeHex, type CategoryColorKey, type CuratedColorKey } from '@/lib/categoryColors'

/*
 * The color choice for a category: Default (nothing stored), ten curated colors, and Custom. Native radio inputs
 * (arrow keys move, Tab leaves) drawn as swatches; the chosen one shows a check mark and its name is announced, so
 * the choice never depends on color alone. Custom reveals a native color picker and a hex field that stay in
 * step, with a live preview. Whatever is typed is validated to an exact #rrggbb before it is saved, and the
 * badge's tint and ink are derived with enforced contrast, so any color stays readable.
 */
const entries = Object.entries(CATEGORY_COLOR_OPTIONS) as [CuratedColorKey, (typeof CATEGORY_COLOR_OPTIONS)[CuratedColorKey]][]
const STARTING_CUSTOM = '#3a7bd5'

const swatch = 'grid size-11 cursor-pointer place-items-center rounded-full border-2 border-card text-white shadow-[0_0_0_1px_var(--input)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50'

export function CategoryColorPicker({ value, onChange, disabled }: { value: CategoryColorKey | null; onChange: (value: CategoryColorKey | null) => void; disabled?: boolean }) {
  const custom = isCustomColor(value)
  const [draft, setDraft] = useState<string>(custom ? value : STARTING_CUSTOM)
  const [lastCustom, setLastCustom] = useState<string>(custom ? value : STARTING_CUSTOM)
  const draftHex = normalizeHex(draft)
  const draftInvalid = draft.trim() !== '' && draftHex === null
  const preview = colorFor(custom ? value : lastCustom)

  const chooseCustom = (hex: string) => {
    setDraft(hex)
    setLastCustom(hex)
    onChange(hex as CategoryColorKey)
  }

  const options: { key: CuratedColorKey | null; label: string; solid: string }[] = [
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
          const checked = !custom && value === option.key
          return (
            <label key={option.label} className="relative block">
              <input type="radio" name="category-color" value={option.key ?? ''} checked={checked} onChange={() => onChange(option.key)} aria-label={option.label} className="peer sr-only" />
              <span title={option.label} style={{ backgroundColor: option.solid }} className={cn(swatch, option.key === null && 'border-dashed', checked && 'shadow-[0_0_0_2px_var(--primary)]')}>
                {checked && <Check aria-hidden="true" className="size-5" />}
              </span>
            </label>
          )
        })}
        <label className="relative block">
          <input type="radio" name="category-color" value="custom" checked={custom} onChange={() => chooseCustom(lastCustom)} aria-label="Custom color" className="peer sr-only" />
          <span
            title="Custom color"
            style={custom ? { backgroundColor: preview.solid } : { backgroundImage: 'conic-gradient(#e5484d, #f5a524, #46a758, #12a594, #3e63dd, #8e4ec6, #e5484d)' }}
            className={cn(swatch, custom && 'shadow-[0_0_0_2px_var(--primary)]')}
          >
            {custom && <Check aria-hidden="true" className="size-5" />}
          </span>
        </label>
      </div>

      {custom && (
        <div className="grid gap-2 rounded-control bg-secondary p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Pick a color
              <input
                type="color"
                value={draftHex ?? lastCustom}
                onChange={(e) => chooseCustom(e.target.value.toLowerCase())}
                className="h-11 w-16 cursor-pointer rounded-control border border-input bg-card p-1"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">
              Hex code
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={7}
                value={draft}
                aria-invalid={draftInvalid}
                aria-describedby="category-hex-help"
                onChange={(e) => {
                  setDraft(e.target.value)
                  const hex = normalizeHex(e.target.value)
                  if (hex) { setLastCustom(hex); onChange(hex as CategoryColorKey) }
                }}
                onBlur={() => setDraft(normalizeHex(draft) ?? lastCustom)}
                className="h-11 w-32 rounded-control border border-input bg-card px-3 font-mono text-base uppercase aria-[invalid=true]:border-destructive"
              />
            </label>
            <span aria-hidden="true" style={{ backgroundColor: preview.bg, color: preview.fg }} className="mb-0.5 inline-flex h-10 items-center rounded-control px-3 text-sm font-semibold">
              Preview Aa
            </span>
          </div>
          <p id="category-hex-help" className={cn('text-sm', draftInvalid ? 'text-destructive' : 'text-muted-foreground')}>
            {draftInvalid ? 'Use six digits, like #3A7BD5.' : 'The badge background is a soft tint of your color, and its text is darkened so it always reads clearly.'}
          </p>
        </div>
      )}
    </fieldset>
  )
}
