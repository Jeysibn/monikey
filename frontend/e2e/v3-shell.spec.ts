import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
} as const

// Set V3_SCREENSHOTS=1 to (re)write docs/remake/screenshots/stage3/*.png.
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage3')
async function shot(page: Page, name: string) {
  if (process.env.V3_SCREENSHOTS === '1') await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false })
}

async function optIn(page: Page, to = '/v3') {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  if (to !== '/v3') await page.goto(to)
}

test.describe('V3 preview opt-in', () => {
  test('legacy UI is the default and /v3 falls back to it', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Transactions', exact: true })).toBeVisible()
    await expect(page.locator('.v3-root')).toHaveCount(0)
    await page.goto('/v3/activity')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.v3-root')).toHaveCount(0)
  })

  test('?v3=1 opts in, persists across reloads, and exit returns to legacy', async ({ page }) => {
    await optIn(page)
    await page.reload()
    await expect(page.locator('.v3-root')).toBeVisible()
    await page.getByRole('link', { name: 'Exit preview' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('.v3-root')).toHaveCount(0)
    await page.goto('/v3')
    await expect(page).toHaveURL(/\/$/)
  })

  test('legacy pages incl. Sync Center and Settings stay reachable from the preview', async ({ page }) => {
    await optIn(page)
    await page.getByRole('navigation', { name: 'Utilities' }).getByRole('link', { name: 'Sync Center' }).click()
    await expect(page).toHaveURL(/\/sync$/)
    await expect(page.getByRole('heading', { name: /Sync/ }).first()).toBeVisible()
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible()
  })
})

test.describe('V3 dock', () => {
  test.use({ viewport: VIEWPORTS.desktop })

  test('shows current page, navigates, and Add opens Quick Add without changing page', async ({ page }) => {
    await optIn(page)
    const dock = page.getByRole('navigation', { name: 'Primary' })
    await expect(dock.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await dock.getByRole('link', { name: 'Planning' }).click()
    await expect(page).toHaveURL(/\/v3\/planning$/)
    await expect(dock.getByRole('link', { name: 'Planning' })).toHaveAttribute('aria-current', 'page')
    await dock.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/v3\/planning$/)
  })

  test('arrow keys, Home and End move focus; focus is visible', async ({ page }) => {
    await optIn(page)
    const dock = page.getByRole('navigation', { name: 'Primary' })
    await dock.getByRole('link', { name: 'Overview' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(dock.getByRole('link', { name: 'Activity' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(dock.getByRole('link', { name: 'Planning' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(dock.getByRole('link', { name: 'Overview' })).toBeFocused()
    const outline = await dock.getByRole('link', { name: 'Overview' }).evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
  })

  test('hover magnifies subtly on desktop and is disabled under reduced motion', async ({ page }) => {
    await optIn(page)
    const activity = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Activity' })
    await activity.hover()
    await expect.poll(() => activity.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.mouse.move(0, 0)
    await activity.hover()
    await expect.poll(() => activity.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  })
})

test.describe('V3 responsive shell', () => {
  test('mobile: account region first, single column, dock does not occlude content', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await optIn(page)
    const regions = ['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity']
    const boxes = await Promise.all(regions.map((id) => page.locator(`#${id}`).boundingBox()))
    expect(boxes.every(Boolean)).toBe(true)
    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y)
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y)
    expect(Math.abs(boxes[0]!.x - boxes[2]!.x)).toBeLessThan(2)
    await shot(page, 'mobile-overview')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const lastBottom = (await page.locator('.v3-workspace').boundingBox())!.y + (await page.locator('.v3-workspace').boundingBox())!.height
    const dockTop = (await page.locator('.v3-dock').boundingBox())!.y
    expect(lastBottom).toBeLessThanOrEqual(dockTop)
    // 48px touch targets in the dock
    for (const item of await page.locator('.v3-dock__item').all()) {
      const box = (await item.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(48)
      expect(box.width).toBeGreaterThanOrEqual(48)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('tablet: two columns, accounts spans left', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet)
    await optIn(page)
    const [a, p, r] = await Promise.all(['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity'].map((id) => page.locator(`#${id}`).boundingBox()))
    expect(p!.x).toBeGreaterThan(a!.x + a!.width - 2)
    expect(Math.abs(p!.x - r!.x)).toBeLessThan(2)
    expect(r!.y).toBeGreaterThan(p!.y)
    await shot(page, 'tablet-overview')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('desktop: genuine three-column workspace on one row', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await optIn(page)
    const [a, p, r] = await Promise.all(['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity'].map((id) => page.locator(`#${id}`).boundingBox()))
    expect(a!.x).toBeLessThan(p!.x)
    expect(p!.x).toBeLessThan(r!.x)
    expect(Math.abs(a!.y - p!.y)).toBeLessThan(2)
    expect(Math.abs(p!.y - r!.y)).toBeLessThan(2)
    await shot(page, 'desktop-overview')
  })

  test('1000px (below three-column breakpoint) stays two columns without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await optIn(page)
    const [a, p, r] = await Promise.all(['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity'].map((id) => page.locator(`#${id}`).boundingBox()))
    expect(p!.x).toBeGreaterThan(a!.x)
    expect(r!.y).toBeGreaterThan(p!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('design specimen screenshots', async ({ page }) => {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(vp)
      await optIn(page, '/v3/design')
      await expect(page.getByRole('heading', { name: 'Design system', level: 1 })).toBeVisible()
      await shot(page, `${name}-design-system`)
    }
  })
})

test.describe('V3 accessibility', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const route of ['/v3', '/v3/activity', '/v3/accounts', '/v3/planning', '/v3/design']) {
      test(`axe: ${route} at ${name}`, async ({ page }) => {
        await page.setViewportSize(vp)
        await optIn(page, route)
        await expect(page.locator('main')).toBeVisible()
        const results = await new AxeBuilder({ page }).analyze()
        expect(results.violations).toEqual([])
      })
    }
  }
})
