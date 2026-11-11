/*
 * Tests for category appearance (ADR-026): curated colors are readable, the TypeScript registries match
 * migration 009 and the API allowlists, and unknown or missing keys fall back safely.
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { CATEGORY_COLOR_OPTIONS, colorFor, DEFAULT_CATEGORY_COLOR, isCategoryColorKey } from '../src/lib/categoryColors.ts'
import { CATEGORY_ICON_OPTIONS, isCategoryIconKey } from '../src/lib/categoryIconRegistry.ts'

const luminance = (hex: string): number => {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const migration = readFileSync(new URL('../../database/009_category_colors.sql', import.meta.url), 'utf8')
const keysIn = (constraint: string): string[] => {
  const block = new RegExp(`${constraint} CHECK \\(([\\s\\S]*?)\\n  \\)`).exec(migration)?.[1] ?? ''
  return [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!)
}

describe('curated category colors', () => {
  it('every tint has text-grade contrast (4.5:1) for its icon and every swatch has graphics-grade contrast (3:1) on white', () => {
    for (const [key, color] of Object.entries(CATEGORY_COLOR_OPTIONS)) {
      assert.ok(contrast(color.fg, color.bg) >= 4.5, `${key}: ink on tint is ${contrast(color.fg, color.bg).toFixed(2)}:1`)
      assert.ok(contrast(color.solid, '#FFFFFF') >= 3, `${key}: swatch on white is ${contrast(color.solid, '#FFFFFF').toFixed(2)}:1`)
    }
  })
  it('only fixed #RRGGBB values live in the registry (nothing user-supplied can reach a style)', () => {
    for (const color of Object.values(CATEGORY_COLOR_OPTIONS)) {
      for (const value of [color.bg, color.fg, color.solid]) assert.match(value, /^#[0-9A-F]{6}$/)
    }
  })
  it('unknown, missing and look-alike keys resolve to the neutral color, never to the input', () => {
    for (const bad of [null, undefined, '', '#ff0000', 'red; x:y', 'GREEN', 'magenta', 7]) {
      assert.equal(isCategoryColorKey(bad), false)
      assert.equal(colorFor(bad as string), DEFAULT_CATEGORY_COLOR)
    }
    assert.equal(colorFor('green'), CATEGORY_COLOR_OPTIONS.green)
  })
})

describe('registries match migration 009 and the API', () => {
  it('the color keys are exactly the database allowlist', () => {
    assert.deepEqual([...keysIn('categories_color_key_allowed')].sort(), Object.keys(CATEGORY_COLOR_OPTIONS).sort())
  })
  it('the icon keys are exactly the database allowlist', () => {
    const database = keysIn('categories_icon_key_allowed')
    assert.deepEqual([...database].sort(), Object.keys(CATEGORY_ICON_OPTIONS).sort())
    for (const key of database) assert.equal(isCategoryIconKey(key), true)
  })
})
