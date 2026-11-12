import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { hasRealApi } from './fixtures'

/*
 * Release-readiness sweep: all six pages and the shared dialogs at 320, 360, 390, 768, 1024 and 1440 px.
 * For each it checks: no horizontal page scroll, no control pushed past the right edge, no WCAG A/AA axe
 * violation, a primary action that stays on screen in a dialog, the keyboard staying inside an open dialog,
 * Escape closing it and focus returning to where it started. Works on either source; the state sweep at the end
 * uses the mock source's ?demo= scenarios and is skipped against the real API. Saves nothing.
 */
const WIDTHS = [320, 360, 390, 768, 1024, 1440]
const PAGES = ['Overview', 'Dashboard', 'Activity', 'Accounts', 'Kakeibo', 'Categories'] as const
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// Reduced motion keeps axe from sampling a half-faded button (a 150 ms fade is not a contrast defect).
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }) })

async function open(page: Page, name: (typeof PAGES)[number], url = '/') {
  await page.goto(url)
  const main = page.getByRole('navigation', { name: 'Main' })
  const direct = main.locator('button:visible').filter({ hasText: name }).first()
  if (await direct.count()) await direct.click()
  else {
    await main.getByRole('button', { name: 'More', exact: true }).first().click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name, exact: true }).click()
  }
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

/** Controls whose box runs past the viewport's right edge, ignoring anything inside a horizontal scroller. */
async function clipped(page: Page, scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const limit = window.innerWidth + 1
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true
      }
      return false
    }
    return Array.from(root.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], [role="button"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden], [aria-hidden="true"]') && !el.classList.contains('sr-only') && !inScroller(el)
      })
      .filter((el) => { const r = el.getBoundingClientRect(); return r.right > limit || r.left < -1 })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`)
  })
}

async function noSideways(page: Page, label: string) {
  const d = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
  expect(d.scroll, `${label}: horizontal scroll at ${d.width}px`).toBeLessThanOrEqual(d.width)
}

async function axe(page: Page, label: string, include = 'main') {
  const results = await new AxeBuilder({ page }).include(include).withTags(TAGS).analyze()
  expect(results.violations.map(({ id, impact, nodes }) => ({ id, impact, target: nodes[0]?.target })), `${label}: axe`).toEqual([])
}

for (const name of PAGES) {
  test(`${name}: no sideways scroll, no clipped control and no axe violation at every width`, async ({ page }) => {
    test.setTimeout(120_000)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 800 })
      await open(page, name)
      await page.waitForLoadState('networkidle')
      const label = `${name} @${width}`
      await noSideways(page, label)
      expect(await clipped(page, page.locator('body')), `${label}: clipped controls`).toEqual([])
      await axe(page, label)
    }
  })
}

/** Dialogs reached from a page. `submit` is the primary action that must stay reachable. */
const DIALOGS: { name: string; page: (typeof PAGES)[number]; trigger: (p: Page) => Locator; dialog: string | RegExp; submit?: RegExp; type?: string }[] = [
  { name: 'Add transaction', page: 'Overview', trigger: (p) => p.getByRole('button', { name: 'Add transaction' }).first(), dialog: /Add (expense|income|transaction)/, submit: /Save (expense|income)/ },
  { name: 'Add income', page: 'Overview', trigger: (p) => p.getByRole('button', { name: 'Add transaction' }).first(), dialog: /Add transaction/, submit: /Save income/, type: 'Income' },
  { name: 'Transfer', page: 'Overview', trigger: (p) => p.getByRole('button', { name: 'Add transaction' }).first(), dialog: /Transfer money/, submit: /Save transfer/, type: 'Transfer' },
  { name: 'Pay credit card', page: 'Overview', trigger: (p) => p.getByRole('button', { name: 'Add transaction' }).first(), dialog: /Pay credit card/, submit: /Pay credit card/, type: 'Pay card' },
  { name: 'Add account', page: 'Accounts', trigger: (p) => p.getByRole('button', { name: 'Add account' }).first(), dialog: 'Add account' },
  { name: 'Add category', page: 'Categories', trigger: (p) => p.getByRole('button', { name: 'Add category' }).first(), dialog: /category/i },
  { name: 'Monthly plan', page: 'Kakeibo', trigger: (p) => p.getByRole('button', { name: /Create plan|Edit plan|Confirm plan/ }).first(), dialog: /plan/i },
]

for (const d of DIALOGS) {
  test(`${d.name} dialog: on screen, keyboard stays inside, Escape returns focus, no axe violation at every width`, async ({ page }) => {
    test.setTimeout(150_000)
    for (const width of WIDTHS) {
      const height = width >= 1024 ? 800 : 640 // a short phone viewport is the hard case for sticky footers
      await page.setViewportSize({ width, height })
      await open(page, d.page)
      await page.waitForLoadState('networkidle')
      const trigger = d.trigger(page)
      await expect(trigger, `${d.name} @${width}: trigger`).toBeVisible()
      await trigger.click()
      const dialog = page.getByRole('dialog').last()
      await expect(dialog).toBeVisible()
      if (d.type) await dialog.getByRole('radio', { name: d.type, exact: true }).locator('xpath=ancestor::label[1]').click()
      await expect(dialog.getByRole('heading', { name: d.dialog }).first()).toBeVisible()
      const label = `${d.name} @${width}`
      await noSideways(page, label)
      const box = await dialog.boundingBox()
      expect(box, label).not.toBeNull()
      expect(box!.x, `${label}: dialog left edge`).toBeGreaterThanOrEqual(-1)
      expect(box!.x + box!.width, `${label}: dialog right edge`).toBeLessThanOrEqual(width + 1)
      expect(box!.y + box!.height, `${label}: dialog bottom edge`).toBeLessThanOrEqual(height + 1)
      expect(await clipped(page, dialog), `${label}: clipped controls`).toEqual([])
      if (d.submit) {
        const primary = dialog.getByRole('button', { name: d.submit }).last()
        await expect(primary, `${label}: primary action`).toBeVisible()
        const pb = await primary.boundingBox()
        expect(pb!.y + pb!.height, `${label}: primary action stays on screen`).toBeLessThanOrEqual(height + 1)
        expect(pb!.y, `${label}: primary action is below the top`).toBeGreaterThanOrEqual(0)
      }
      await axe(page, label, '[role="dialog"]')
      // Keyboard: Tab and Shift+Tab never leave the dialog.
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press(i % 9 === 8 ? 'Shift+Tab' : 'Tab')
        const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
        expect(inside, `${label}: focus left the dialog on Tab ${i + 1}`).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      // Focus is handed back on the next frame; it must land on a real control, never be left on the page body.
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? ''), { message: `${label}: focus returned after Escape`, timeout: 3000 }).not.toBe('BODY')
    }
  })
}

test('More (phones) opens as a dialog, reaches every destination and closes with Escape', async ({ page }) => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 640 })
    await page.goto('/')
    const more = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'More', exact: true }).first()
    await more.click()
    const dialog = page.getByRole('dialog', { name: 'More' })
    await expect(dialog).toBeVisible()
    expect(await clipped(page, dialog), `More @${width}`).toEqual([])
    await axe(page, `More @${width}`, '[role="dialog"]')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('the main navigation is operable from the keyboard on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  const dashboard = nav.locator('button:visible').filter({ hasText: 'Dashboard' }).first()
  await dashboard.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeFocused()
  await expect(dashboard).toHaveAttribute('aria-current', 'page')
})

test('Dashboard charts have equivalent accessible data tables', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, 'Dashboard')
  await page.waitForLoadState('networkidle')
  const toggles = page.getByRole('button', { name: /data table/ })
  const count = await toggles.count()
  expect(count, 'charts with a data-table toggle on the Dashboard').toBeGreaterThanOrEqual(4)
  const charts = page.locator('xpath=//button[contains(., "data table")]/ancestor::*[@role="region"][1]')
  for (let i = 0; i < count; i++) {
    const chart = charts.nth(i)
    await chart.scrollIntoViewIfNeeded()
    const table = chart.locator('table')
    expect(await table.count(), `chart ${i + 1} has a table`).toBe(1)
    expect(await table.locator('caption').textContent(), `chart ${i + 1} table has a caption`).toBeTruthy()
    expect(await table.locator('tbody tr').count(), `chart ${i + 1} table has rows`).toBeGreaterThan(0)
  }
  const first = charts.first()
  const card = await first.boundingBox()
  await first.getByRole('button', { name: 'Show data table' }).click()
  const popup = page.getByRole('dialog')
  await expect(popup.getByRole('table')).toBeVisible() // a window, so the card itself neither grows nor moves
  expect((await first.boundingBox())!.height).toBe(card!.height)
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
})

test('a chart column is highlighted lightly while the mouse is on it, and the highlight goes when the mouse leaves', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'Dashboard')
  await page.waitForLoadState('networkidle')
  const chart = page.getByRole('group', { name: /Income and expenses for each of the/ }).first()
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  const highlight = chart.locator('rect[fill="var(--primary-soft)"]')
  await expect(highlight).toHaveCount(0)
  await page.mouse.move(box.x + box.width - 60, box.y + box.height / 2)
  await expect(highlight).toHaveCount(1)
  expect(Number(await highlight.getAttribute('opacity')), 'a light tint').toBeLessThanOrEqual(0.3)
  await page.mouse.click(box.x + box.width - 60, box.y + box.height / 2) // a click focuses the chart but must not pin the highlight
  await page.mouse.move(5, 5)
  await expect(highlight).toHaveCount(0)
})

test.describe('states on the mock source', () => {
  test.beforeEach(async ({ request }) => { test.skip(await hasRealApi(request), 'Uses the mock source\'s ?demo= scenarios.') })
  for (const demo of ['no-accounts', 'no-plan', 'load-error', 'over-limit', 'many'] as const) {
    test(`?demo=${demo}: every page still fits and passes axe at the narrowest, a tablet and a wide width`, async ({ page }) => {
      test.setTimeout(150_000)
      for (const name of PAGES) {
        for (const width of [320, 768, 1440]) {
          await page.setViewportSize({ width, height: 800 })
          await open(page, name, `/?demo=${demo}`)
          await page.waitForLoadState('networkidle')
          const label = `${demo}/${name} @${width}`
          await noSideways(page, label)
          expect(await clipped(page, page.locator('body')), `${label}: clipped controls`).toEqual([])
          await axe(page, label)
        }
      }
    })
  }
})
