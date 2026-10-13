import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
} as const

// Set V3_SCREENSHOTS=1 to (re)write docs/remake/screenshots/stage4/*.png.
const shotDir = path.resolve(process.cwd(), '../docs/remake/screenshots/stage4')
async function shot(page: Page, name: string) {
  if (process.env.V3_SCREENSHOTS === '1') await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
}

async function openOverview(page: Page, tab: 'Summary' | 'Insights' = 'Summary') {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  if (tab === 'Insights') await page.getByRole('tab', { name: 'Insights' }).click()
  await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test.describe(`V3 Overview @ ${name}`, () => {
    test.use({ viewport: vp })

    test('Summary: four accounts, position, budget, activity; no overflow; axe clean', async ({ page }) => {
      await openOverview(page)
      await expect(page.getByRole('list', { name: 'Favorite accounts' }).getByRole('listitem')).toHaveCount(4)
      await expect(page.getByTestId('v3-net')).toContainText('₱')
      await expect(page.getByTestId('v3-budget-line')).toBeVisible()
      await expect(page.getByRole('list', { name: 'Recent transactions' })).toBeVisible()
      expect(await noOverflow(page)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await shot(page, `${name}-summary`)
    })

    test('Insights: honest history state, categories, budget vs actual; no overflow; axe clean', async ({ page }) => {
      await openOverview(page, 'Insights')
      await expect(page.getByTestId('v3-history')).toContainText('not recorded in demo mode')
      await expect(page.getByTestId('v3-categories')).toBeVisible()
      await expect(page.getByTestId('v3-bva')).toBeVisible()
      expect(await noOverflow(page)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await shot(page, `${name}-insights`)
    })
  })
}

test.describe('V3 Overview behavior', () => {
  test('mobile: 48px targets, cards first, dock never covers the last content', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await openOverview(page)
    const accounts = await page.locator('#v3-ws-accounts').boundingBox()
    const position = await page.locator('#v3-ws-position').boundingBox()
    expect(accounts!.y).toBeLessThan(position!.y)
    for (const tab of await page.getByRole('tab').all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    for (const link of await page.locator('.v3-ov-activity__row, .v3-ov-wide-btn').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const last = await page.getByRole('link', { name: 'All activity' }).boundingBox()
    const dockTop = (await page.locator('.v3-dock').boundingBox())!.y
    expect(last!.y + last!.height).toBeLessThanOrEqual(dockTop)
  })

  test('desktop: three columns on one row', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await openOverview(page)
    const [a, p, r] = await Promise.all(['v3-ws-accounts', 'v3-ws-position', 'v3-ws-activity'].map((id) => page.locator(`#${id}`).boundingBox()))
    expect(a!.x).toBeLessThan(p!.x)
    expect(p!.x).toBeLessThan(r!.x)
    expect(Math.abs(a!.y - r!.y)).toBeLessThan(2)
  })

  test('keyboard: arrow keys switch tabs; cards and links open existing pages', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await openOverview(page)
    await page.getByRole('tab', { name: 'Summary' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Insights' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Insights' })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    const card = page.getByRole('link', { name: /^Checking, balance/ })
    await card.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/accounts$/)
    await page.goto('/v3')
    await page.getByRole('link', { name: 'All activity' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
  })

  test('timeframe selector updates the period', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await openOverview(page, 'Insights')
    const before = await page.getByTestId('v3-period-label').textContent()
    await page.getByRole('button', { name: 'Yearly' }).click()
    await expect(page.getByTestId('v3-period-label')).not.toHaveText(before ?? '')
    await expect(page.getByTestId('v3-bva')).toContainText('Budgets are monthly')
  })
})
