import { expect, test } from '@playwright/test'

test('mobile navigation keeps primary destinations legible and exposes secondary views', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')

    const mainNavigation = page.getByRole('navigation', { name: 'Main' }).last()
    for (const label of ['Overview', 'Activity', 'Accounts', 'More']) {
      const control = mainNavigation.getByRole('button', { name: label, exact: true })
      await expect(control).toBeVisible()
      const bounds = await control.boundingBox()
      expect(bounds?.width, `${label} target width at ${width}px`).toBeGreaterThanOrEqual(44)
      expect(bounds?.x).toBeGreaterThanOrEqual(0)
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width)
    }
    const add = mainNavigation.getByRole('button', { name: /Add transaction/ })
    await expect(add).toBeVisible()
    expect((await add.boundingBox())?.width).toBeGreaterThanOrEqual(44)

    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
    if (width === 320 || width === 390) {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.screenshot({ path: `test-results/browser/navigation-${width}.png` })
    }

    await mainNavigation.getByRole('button', { name: 'More', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet.getByRole('button', { name: 'Kakeibo', exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Categories', exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Kakeibo', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Kakeibo', level: 1 })).toBeFocused()
    await expect(sheet).toHaveCount(0)
    await expect(mainNavigation.getByRole('button', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'page')

  }
})

test('secondary navigation dialog supports Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const mainNavigation = page.getByRole('navigation', { name: 'Main' }).last()
  const more = mainNavigation.getByRole('button', { name: 'More', exact: true })
  await more.click()
  await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0)
  await expect(more).toBeFocused()
})
