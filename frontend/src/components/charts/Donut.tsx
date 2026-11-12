import { arcPath, donutSlices } from '@/lib/chartMath'
import { formatPeso } from '@/lib/money'

/*
 * A ring of shares (spending by category). The ring is decoration over numbers that are also in the list beside
 * it and in the data table, so it is aria-hidden. Slices with no value are not drawn. A single slice is a whole ring.
 */
export function Donut({ values, colors, centerLabel, total, size = 168 }: { values: number[]; colors: string[]; centerLabel: string; total: number; size?: number }) {
  const slices = donutSlices(values)
  const thickness = Math.round(size * 0.17)
  const r = size / 2 - thickness / 2 - 2
  const c = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" className="mx-auto block shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--secondary)" strokeWidth={thickness} />
      {slices.map((slice, i) => (slice.value > 0 ? <path key={i} d={arcPath(c, c, r, slice.start, slice.end)} fill="none" stroke={colors[i]} strokeWidth={thickness} strokeLinecap="butt" /> : null))}
      <text x={c} y={c - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">{centerLabel}</text>
      <text x={c} y={c + 14} textAnchor="middle" className="fill-foreground text-[15px] font-semibold">{formatPeso(total)}</text>
    </svg>
  )
}
