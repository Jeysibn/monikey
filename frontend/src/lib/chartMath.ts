import type { Centavos } from '../types.ts'

/*
 * The geometry and number formatting behind the Dashboard's native SVG charts (ADR-025), kept free of React so
 * it can be tested. Nothing here decides what a figure is: amounts arrive as whole centavos from the server and
 * only get scaled, rounded for an axis, or turned into shapes. Exact amounts are always shown with `formatPeso`.
 */

export interface Axis {
  max: Centavos // the top of the axis, a "nice" number at or above the data
  step: Centavos
  ticks: Centavos[] // 0 .. max inclusive, evenly spaced
}

/** A 1, 2, 2.5, 5 or 10 times a power of ten (in pesos), so axis labels read like ₱0, ₱500, ₱1K, ₱1.5K. */
export function niceAxis(maxCentavos: Centavos, desiredTicks = 4): Axis {
  if (!(maxCentavos > 0)) return { max: 10_000, step: 2_500, ticks: [0, 2_500, 5_000, 7_500, 10_000] } // nothing to show: ₱0 to ₱100
  const raw = maxCentavos / 100 / desiredTicks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const residual = raw / magnitude
  const nice = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10) * magnitude
  const stepCentavos = Math.max(1, Math.round(nice * 100))
  const count = Math.ceil(maxCentavos / stepCentavos)
  const max = count * stepCentavos
  return { max, step: stepCentavos, ticks: Array.from({ length: count + 1 }, (_, i) => i * stepCentavos) }
}

/** ₱0, ₱500, ₱1K, ₱2.5K, ₱1.5M: one unit for the whole axis; a value that is not a whole unit shows one decimal, never a rounded lie. */
export function axisFormatter(axis: Axis): (centavos: Centavos) => string {
  const pesos = axis.max / 100
  const [unit, suffix] = pesos >= 1_000_000 ? [1_000_000, 'M'] : pesos >= 1_000 ? [1_000, 'K'] : [1, '']
  return (centavos) => {
    if (centavos === 0) return '₱0'
    const value = centavos / 100 / unit
    const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
    return `₱${text}${suffix}`
  }
}

/** Which of `count` labels to show so at most `max` appear: always the first and last, evenly spaced between. */
export function thinLabels(count: number, max: number): number[] {
  if (count <= 0) return []
  if (count <= max || max < 2) return count <= max ? Array.from({ length: count }, (_, i) => i) : [0]
  const picked = new Set<number>()
  for (let i = 0; i < max; i += 1) picked.add(Math.round((i * (count - 1)) / (max - 1)))
  return [...picked].sort((a, b) => a - b)
}

/** Height in pixels of a bar for `value` on an axis that is `plotHeight` tall; a non-zero value is always at least 1px. */
export function barHeight(value: Centavos, axisMax: Centavos, plotHeight: number): number {
  if (value <= 0 || axisMax <= 0) return 0
  return Math.max(1, Math.round((value / axisMax) * plotHeight))
}

export interface DonutSlice {
  value: Centavos
  fraction: number // 0..1 of the total
  start: number // radians, starting at 12 o'clock and running clockwise
  end: number
}

/** Slices for the positive values, in order. An empty or all-zero list has no slices (there is nothing to draw). */
export function donutSlices(values: Centavos[]): DonutSlice[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (total <= 0) return []
  let angle = -Math.PI / 2
  const slices: DonutSlice[] = []
  for (const value of values) {
    const fraction = Math.max(0, value) / total
    const end = angle + fraction * Math.PI * 2
    slices.push({ value, fraction, start: angle, end })
    angle = end
  }
  return slices
}

const point = (cx: number, cy: number, r: number, angle: number) => `${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`

/** An SVG arc path along a circle of radius r (stroke it to draw a ring). A full circle needs two arcs, so it is split. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= Math.PI * 2 - 1e-6) {
    const middle = start + Math.PI
    return `M ${point(cx, cy, r, start)} A ${r} ${r} 0 1 1 ${point(cx, cy, r, middle)} A ${r} ${r} 0 1 1 ${point(cx, cy, r, start)}`
  }
  const large = end - start > Math.PI ? 1 : 0
  return `M ${point(cx, cy, r, start)} A ${r} ${r} 0 ${large} 1 ${point(cx, cy, r, end)}`
}

/** "12.5%" style share for legends, one decimal, never "0%" for a slice that exists ("<0.1%"). */
export function formatShare(fraction: number): string {
  if (fraction <= 0) return '0%'
  const percent = fraction * 100
  if (percent < 0.1) return '<0.1%'
  return `${percent >= 99.95 ? '100' : percent.toFixed(1).replace(/\.0$/, '')}%`
}
