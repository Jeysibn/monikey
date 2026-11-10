import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

test('Overview links to separate analytics without pushing current balances down', async ({ page }) => {
  const screenshots = '../docs/design/screenshots/ui-modernization/phase-d-polish'
  const captureScreenshots = process.env.MONIKEY_CAPTURE_PHASE_D_SCREENSHOTS === '1'
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View analytics' })).toBeVisible()
    const accessibility = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(accessibility.violations, `axe violations at ${width}px: ${JSON.stringify(accessibility.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ html }) => html) })))}`).toEqual([])
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    if (captureScreenshots && width === 390) {
      await mkdir(screenshots, { recursive: true })
      await page.screenshot({ path: `${screenshots}/overview-mobile-390.png` })
    }
    if (captureScreenshots && width === 1440) await page.screenshot({ path: `${screenshots}/overview-desktop-1440.png`, fullPage: true })
    await page.getByRole('button', { name: 'View analytics' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeFocused()
  }
})
