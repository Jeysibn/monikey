/* Native month picker (last 12 months). A native <select> gives the best phone picker for free. */
export function MonthSelect({
  value,
  options,
  onChange,
  id = 'month',
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (month: string) => void
  id?: string
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Month
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 cursor-pointer rounded-full border border-input bg-card pl-4 text-[15px] font-semibold text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}
