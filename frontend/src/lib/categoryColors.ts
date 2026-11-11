/*
 * The curated category colors (ADR-026). The database and API store only a KEY (`green`), never CSS or hex,
 * so nothing a person or an API client sends can reach a style attribute. Each key maps here to:
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

export type CategoryColorKey = keyof typeof CATEGORY_COLOR_OPTIONS

/** What an uncolored (or unknown-key) category looks like: the neutral slate tint. */
export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_OPTIONS.slate

export function isCategoryColorKey(value: unknown): value is CategoryColorKey {
  return typeof value === 'string' && Object.hasOwn(CATEGORY_COLOR_OPTIONS, value)
}

export const colorFor = (key: string | null | undefined) => (isCategoryColorKey(key) ? CATEGORY_COLOR_OPTIONS[key] : DEFAULT_CATEGORY_COLOR)
