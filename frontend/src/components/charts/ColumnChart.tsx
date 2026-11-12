import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { Readout } from '@/components/charts/ChartFrame'
import { useChartWidth } from '@/components/charts/useChartWidth'
import { axisFormatter, barHeight, niceAxis, thinLabels } from '@/lib/chartMath'
import { formatPeso } from '@/lib/money'

/*
 * Vertical columns, grouped (side by side) or stacked, for monthly, daily and weekday figures (ADR-025). One
 * component, several charts. It draws in real pixels, thins the x labels to what fits, gives every non-zero
 * value at least a pixel, and draws a partial period (month to date) lighter and hatched.
 * Reading values: tap or hover a column, or focus the chart and use Left/Right/Home/End; the value appears in a
 * polite readout under the chart. The picture itself is aria-hidden; the frame's table has the same numbers.
 */
export interface ColumnSeries {
  key: string
  label: string
  color: string
  values: number[] // whole centavos, one per category
}

export function ColumnChart({
  labels,
  axisLabels,
  series,
  stacked = false,
  partial,
  ariaLabel,
  height = 220,
  hint = 'Tap a column or use the arrow keys to read its value.',
}: {
  labels: string[] // full label per category, for the readout ("Oct 12, 2026")
  axisLabels: string[] // short label per category, for the x axis ("12")
  series: ColumnSeries[]
  stacked?: boolean
  partial?: boolean[] // per category: true draws it lighter and hatched (a month to date)
  ariaLabel: string
  height?: number
  hint?: string
}) {
  const [ref, width] = useChartWidth()
  const [active, setActive] = useState<number | null>(null)
  const hatchId = useId()
  const count = labels.length

  const totals = labels.map((_, i) => (stacked ? series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0) : Math.max(...series.map((s) => s.values[i] ?? 0), 0)))
  const axis = niceAxis(Math.max(0, ...totals))
  const format = axisFormatter(axis)
  const left = Math.max(34, format(axis.max).length * 7 + 10)
  const plotWidth = Math.max(40, width - left - 4)
  const top = 8
  const bottom = 24
  const plotHeight = height - top - bottom
  const slot = plotWidth / Math.max(1, count)
  const groupWidth = Math.max(1, slot * (count > 40 ? 0.9 : 0.72))
  const barWidth = stacked ? groupWidth : Math.max(1, groupWidth / series.length - (series.length > 1 && groupWidth > 20 ? 2 : 0))
  const shown = new Set(thinLabels(count, Math.max(2, Math.floor(plotWidth / 54))))

  const pick = (clientX: number, element: Element, clearOutside = false) => {
    const rect = element.getBoundingClientRect()
    const index = Math.floor(((clientX - rect.left - left) / plotWidth) * count)
    if (index >= 0 && index < count) setActive(index)
    else if (clearOutside) setActive(null) // a mouse over the axis labels or margin is not on a column
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = count - 1
    const next =
      event.key === 'ArrowRight' ? Math.min(last, (active ?? -1) + 1)
      : event.key === 'ArrowLeft' ? Math.max(0, (active ?? 1) - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
  }
  const readout = active === null ? null : `${labels[active]}: ${series.map((s) => `${s.label} ${formatPeso(s.values[active] ?? 0)}`).join(' · ')}${partial?.[active] ? ' (month to date)' : ''}`

  return (
    <div>
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        aria-roledescription="chart"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => active === null && setActive(count - 1)}
        onBlur={() => setActive(null)}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e: PointerEvent<HTMLDivElement>) => e.pointerType === 'mouse' && pick(e.clientX, e.currentTarget, true)}
        // The highlight follows the mouse and goes when it leaves. A keyboard reader keeps theirs while the chart has focus, and a touch reading stays until the next tap.
        onPointerLeave={(e: PointerEvent<HTMLDivElement>) => e.pointerType === 'mouse' && !e.currentTarget.matches(':focus-visible') && setActive(null)}
        className="rounded-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ touchAction: 'pan-y' }}
      >
        <svg width={width} height={height} aria-hidden="true" focusable="false" className="block max-w-full overflow-visible">
          <defs>
            <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="5" fill="rgba(255,255,255,0.8)" />
            </pattern>
          </defs>
          {axis.ticks.map((tick) => {
            const y = top + plotHeight - (tick / axis.max) * plotHeight
            return (
              <g key={tick}>
                <line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="var(--rule)" strokeWidth={1} />
                <text x={left - 6} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{format(tick)}</text>
              </g>
            )
          })}
          {labels.map((_, i) => {
            const x0 = left + i * slot + (slot - groupWidth) / 2
            const isActive = active === i
            let stackTop = top + plotHeight
            return (
              <g key={i}>
                {isActive && <rect x={left + i * slot} y={top} width={slot} height={plotHeight} fill="var(--primary-soft)" opacity={0.28} />}
                {series.map((s, si) => {
                  const value = Math.max(0, s.values[i] ?? 0)
                  const h = barHeight(value, axis.max, plotHeight)
                  const x = stacked ? x0 : x0 + si * (barWidth + (series.length > 1 && groupWidth > 20 ? 2 : 0))
                  let y = top + plotHeight - h
                  if (stacked) {
                    stackTop -= h
                    y = stackTop
                  }
                  const light = partial?.[i]
                  return h === 0 ? null : (
                    <g key={s.key}>
                      <rect x={x} y={y} width={barWidth} height={h} fill={s.color} opacity={light ? 0.55 : 1} />
                      {light && <rect x={x} y={y} width={barWidth} height={h} fill={`url(#${hatchId})`} />}
                    </g>
                  )
                })}
                {shown.has(i) && <text x={left + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{axisLabels[i]}</text>}
              </g>
            )
          })}
          <line x1={left} x2={left + plotWidth} y1={top + plotHeight} y2={top + plotHeight} stroke="var(--input)" strokeWidth={1} />
        </svg>
      </div>
      <Readout text={readout} hint={hint} />
    </div>
  )
}
