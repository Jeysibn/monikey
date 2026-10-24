import { Check } from 'lucide-react'
import { cn } from 'cn'

/*
 * A row of mutually exclusive choices built from native radio inputs (keyboard: arrows move, Tab leaves).
 * The chosen one has a check mark and a raised surface, so it is not told apart by colour alone.
 */
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string
  name: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-1 rounded-full bg-secondary p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label key={o.value} className="relative block">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold text-muted-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                value === o.value && 'bg-card text-foreground shadow-[0_0_0_1px_var(--rule)]',
              )}
            >
              {value === o.value && <Check aria-hidden="true" className="size-4" />}
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
