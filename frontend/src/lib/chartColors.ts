import { CATEGORY_COLOR_OPTIONS, colorFor, isCategoryColorKey } from './categoryColors.ts'
import { ENVELOPE_ACCENT } from './kakeibo.ts'
import type { KakeiboEnvelope } from '../types.ts'

/*
 * Colors for Dashboard marks (ADR-025). They come only from the design tokens and the closed registries (category
 * colors, envelope accents), never from data. Color is never the only cue: every chart also has a legend with
 * names and figures, a readout and a data table, and partial periods are hatched as well as lighter.
 */
export const INCOME_COLOR = '#1F8A56' // = the "green" category solid, the app's income green
export const EXPENSE_COLOR = '#2D6BD8' // = the "blue" category solid, the app's primary
export const UNCLASSIFIED_COLOR = '#5E6B7D' // slate
export const envelopeColor = (envelope: KakeiboEnvelope): string => ENVELOPE_ACCENT[envelope].solid

const PALETTE = Object.values(CATEGORY_COLOR_OPTIONS).map((c) => c.solid)

/**
 * A category's mark color: its own saved color when it has one, otherwise the next palette color by position, so a
 * donut of categories that were never given a color still has distinguishable slices. (The name is always listed.)
 */
export function categoryMarkColor(colorKey: string | null | undefined, index: number): string {
  return isCategoryColorKey(colorKey) ? colorFor(colorKey).solid : PALETTE[index % PALETTE.length]!
}
