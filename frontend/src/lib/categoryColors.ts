/*
 * Category colors (ADR-026, amended 2026-11-12). The database and API store either a curated KEY (`green`) or a
 * custom lower-case `#rrggbb`, and nothing else, so nothing a person or an API client sends can carry CSS into a
 * style attribute: a custom value is validated to that exact shape, and its tint and ink are DERIVED here with
 * the same contrast guarantees as the curated ones. Each curated key maps to:
 *   - `bg` / `fg`: a light tint and a dark ink for a tinted icon badge (text-grade contrast, checked in tests),
 *   - `solid`: the swatch shown in the color picker and chart marks (graphics-grade contrast against white).
 * Color is decoration only: category names, and where it matters the icon, always appear as text too, and
 * changing a color never changes an amount, a classification or a Kakeibo envelope.
 */
export const CATEGORY_COLOR_OPTIONS = {
  blue: { label: 'Blue', bg: '#E3EDFD', fg: '#1B4DB0', solid: '#2D6BD8' },
  green: { label: 'Green', bg: '#E1F5E9', fg: '#14633B', solid: '#1F8A56' },
  teal: { label: 'Teal', bg: '#DDF4F2', fg: '#0F5F5A', solid: '#14857F' },
  amber: { label: 'Amber', bg: '#FEF1D2', fg: '#7A4A06', solid: '#A8690C' },
  orange: { label: 'Orange', bg: '#FEE9DB', fg: '#8A3706', solid: '#C2531A' },
  red: { label: 'Red', bg: '#FDE4E3', fg: '#8F1D22', solid: '#CB3535' },
  pink: { label: 'Pink', bg: '#FCE5F0', fg: '#8C1F57', solid: '#BE357D' },
  purple: { label: 'Purple', bg: '#EEE6FB', fg: '#512A98', solid: '#7449CE' },
  indigo: { label: 'Indigo', bg: '#E6E8FB', fg: '#3338A0', solid: '#4C52D0' },
  slate: { label: 'Slate', bg: '#E9EDF2', fg: '#3A4553', solid: '#5E6B7D' },
} as const satisfies Record<string, { label: string; bg: string; fg: string; solid: string }>

export type CuratedColorKey = keyof typeof CATEGORY_COLOR_OPTIONS
/** A curated name, or a custom color saved as a lower-case six-digit hex such as `#3a7bd5`. */
export type CategoryColorKey = CuratedColorKey | `#${string}`

export interface CategoryColor { label: string; bg: string; fg: string; solid: string }

const HEX = /^#[0-9a-f]{6}$/

/** Accepts `#abc`, `abc`, `#AABBCC` and returns `#aabbcc`, or null when it is not a color. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '').toLowerCase()
  const full = /^[0-9a-f]{3}$/.test(raw) ? [...raw].map((c) => c + c).join('') : raw
  return /^[0-9a-f]{6}$/.test(full) ? `#${full}` : null
}

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const toHex = (c: number[]): string => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: string, b: string, weightOfB: number): string => {
  const [x, y] = [channels(a), channels(b)]
  return toHex(x.map((v, i) => v * (1 - weightOfB) + y[i]! * weightOfB))
}
const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrastRatio = (a: string, b: string): number => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05) }

/** Darkens `hex` toward black until it reaches `target`:1 against `against` (it never lightens). */
function darkenUntil(hex: string, against: string, target: number): string {
  let out = hex
  for (let step = 0; step < 40 && contrastRatio(out, against) < target; step++) out = mix(out, '#000000', 0.08)
  return out
}

/**
 * The look of a custom color: a pale tint of it as the badge background, an ink darkened until it reads on that
 * tint at 4.5:1 (text grade), and a swatch/chart mark darkened only as far as needed for 3:1 on white. Any
 * six-digit color therefore yields a readable badge, however light or saturated it is.
 */
export function deriveCustomColor(hex: string): CategoryColor {
  const bg = mix(hex, '#FFFFFF', 0.86)
  return { label: 'Custom', bg: bg.toUpperCase(), fg: darkenUntil(hex, bg, 4.5).toUpperCase(), solid: darkenUntil(hex, '#FFFFFF', 3).toUpperCase() }
}

/** What an uncolored (or unknown-key) category looks like: the neutral slate tint. */
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_OPTIONS.slate

export const isCuratedColorKey = (value: unknown): value is CuratedColorKey => typeof value === 'string' && Object.hasOwn(CATEGORY_COLOR_OPTIONS, value)
export const isCustomColor = (value: unknown): value is `#${string}` => typeof value === 'string' && HEX.test(value)
export const isCategoryColorKey = (value: unknown): value is CategoryColorKey => isCuratedColorKey(value) || isCustomColor(value)

export function colorFor(key: string | null | undefined): CategoryColor {
  if (isCuratedColorKey(key)) return CATEGORY_COLOR_OPTIONS[key]
  if (isCustomColor(key)) return deriveCustomColor(key)
  return DEFAULT_CATEGORY_COLOR
}
