import { expect, test, type Page } from '@playwright/test'

// The floating dock must never cover the last rows or their actions, at any viewport.
async function openV3(page: Page, route: string) {
  await page.goto('/?v3=1')
  await expect(page).toHaveURL(/\/v3$/)
  await page.goto(route)
}

const viewports = [
  { name: 'mobile', width: 390, height: 600 },
  { name: 'tablet', width: 820, height: 560 },
  { name: 'desktop', width: 1280, height: 560 },
]

/** The element at the centre of `selector`'s box is the element itself (nothing, e.g. the dock, sits on top). */
async function reachable(page: Page, selector: string) {
  return page.locator(selector).last().evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return Boolean(hit && (el === hit || el.contains(hit)))
  })
}

for (const vp of viewports) {
  test.describe(`dock clearance @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('Activity: last row and its actions stay clear of the dock at the end of the page', async ({ page }) => {
      await openV3(page, '/v3/activity')
      const dock = page.locator('.v3-dock')
      await expect(dock).toBeVisible()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const lastRow = page.locator('.v3-act-table tbody tr, .v3-act-row').last()
      await expect(lastRow).toBeVisible()
      const rowBox = (await lastRow.boundingBox())!
      const dockBox = (await dock.boundingBox())!
      expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(dockBox.y + 1)
      const action = page.locator('.v3-act-actions button').last()
      if (await action.count()) {
        expect(await reachable(page, '.v3-act-actions button')).toBe(true)
        const box = (await action.boundingBox())!
        expect(box.y + box.height).toBeLessThanOrEqual(dockBox.y + 1)
      }
    })

    test('Activity: selecting the last row still works and the dock keeps its floating style', async ({ page }) => {
      await openV3(page, '/v3/activity')
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const target = page.locator('.v3-act-table tbody tr .v3-act-titlebtn, .v3-act-row').last()
      await target.click()
      await expect(page.getByTestId('v3-activity-detail')).toBeVisible()
      const dock = page.locator('.v3-dock')
      const style = await dock.evaluate((el) => { const s = getComputedStyle(el); return { position: s.position, radius: s.borderTopLeftRadius, blur: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter } })
      expect(style.position).toBe('fixed')
      expect(parseFloat(style.radius)).toBeGreaterThanOrEqual(16)
      expect(style.blur).toContain('blur')
    })

    test('Accounts: the last card and its favorite/detail controls stay clear of the dock', async ({ page }) => {
      await openV3(page, '/v3/accounts')
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const last = page.locator('.v3-acct-cell').last()
      const box = (await last.boundingBox())!
      const dockBox = (await page.locator('.v3-dock').boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(dockBox.y + 1)
    })
  })
}
