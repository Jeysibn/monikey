import { shiftDate } from '@/lib/accountPicker'
import { cn } from 'cn'

/*
 * "Today" and "Yesterday" for the Quick Add date. They set the same value as the native date input beside
 * them (a calendar date, "YYYY-MM-DD", with no time of day), so choosing a custom date simply leaves both
 * unselected. `today` is the data source's Manila calendar date, never the browser's, so a phone set to
 * another time zone cannot put an entry on the wrong day.
 */
export function DateShortcuts({ today, value, disabled, onPick }: { today: string; value: string; disabled?: boolean; onPick: (date: string) => void }) {
  const yesterday = shiftDate(today, -1)
  const options = [
    { label: 'Today', date: today },
    { label: 'Yesterday', date: yesterday },
  ]
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const pressed = value === o.date
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onPick(o.date)}
            className={cn(
              'h-11 cursor-pointer rounded-full border border-input bg-card px-4 text-[0.9375rem] font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
              pressed && 'border-primary bg-primary-soft font-semibold text-primary-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
