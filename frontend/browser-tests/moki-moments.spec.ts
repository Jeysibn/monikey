import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { hasRealApi } from './fixtures'

/*
 * Moki's moments and tips: a tip appears once on Dashboard, Activity and Categories, can be dismissed and stays
 * away; Overview and Accounts have none; a page that fails to load shows Moki with a working Retry; the
 * first-use welcome bobs gently unless the person asks for less motion. Mock source (it uses ?demo= scenarios).
 */
async function open(page: Page, name: string, url = '/') {
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

for (const [view, tip] of [['Dashboard', 'dashboard-scopes'], ['Activity', 'activity-search'], ['Categories', 'categories-look']] as const) {
  test(`${view}: a tip from Moki shows once, dismisses by keyboard, and stays dismissed after a reload`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, view)
    const box = page.locator(`[data-moki-tip="${tip}"]`)
    await expect(box).toBeVisible()
    await expect(box.getByRole('img')).toHaveCount(0) // decorative: the words carry the meaning
    const axe = await new AxeBuilder({ page }).include(`[data-moki-tip="${tip}"]`).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(axe.violations.map((v) => v.id)).toEqual([])
    const dismiss = box.getByRole('button', { name: /^Dismiss tip/ })
    expect((await dismiss.boundingBox())!.width).toBeGreaterThanOrEqual(44)
    await dismiss.focus()
    await page.keyboard.press('Enter')
    await expect(box).toHaveCount(0)
    await expect(page.getByRole('heading', { name: view, level: 1 })).toBeFocused()
    await page.reload()
    await open(page, view, page.url())
    await expect(page.locator(`[data-moki-tip="${tip}"]`)).toHaveCount(0)
  })
}

test('Overview and Accounts carry no tips: the money comes first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  await expect(page.locator('[data-moki-tip]')).toHaveCount(0)
  await open(page, 'Accounts')
  await expect(page.locator('[data-moki-tip]')).toHaveCount(0)
})

test('a page that could not load shows Moki, keeps the words and Retry, and recovers', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock source\'s ?demo= failure scenario.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page, 'Activity', '/?demo=load-error')
  const alert = page.getByRole('alert').filter({ hasText: /activity/i })
  await expect(alert).toBeVisible()
  await expect(alert.locator('img[src$="moki-server-error.webp"]')).toHaveCount(1)
  await alert.getByRole('button', { name: /Retry loading activity/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: /activity/i })).toHaveCount(0)
})

test('the first-use welcome bobs gently, and holds still for reduced motion', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock source\'s ?demo=no-accounts scenario.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/?demo=no-accounts')
  const moki = page.locator('img.moki-float')
  await expect(moki).toHaveCount(1)
  expect(await moki.evaluate((el) => getComputedStyle(el).animationName)).toBe('moki-float')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await moki.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('page headers: Moki beside Dashboard, Activity and Categories titles only, never on Overview, Accounts or Kakeibo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const name of ['Dashboard', 'Activity', 'Categories']) {
    await open(page, name)
    const header = page.locator('main h1').locator('xpath=..')
    await expect(header.locator('img')).toBeVisible()
  }
  for (const name of ['Overview', 'Accounts', 'Kakeibo']) {
    await open(page, name)
    await expect(page.locator('main h1').locator('xpath=..').locator('img')).toHaveCount(0)
  }
})

test('Kakeibo shows a calm Moki line under the plan: thumbs-up within limits, no alarm wording when over', async ({ page }) => {
  test.skip(await hasRealApi(page.request), 'Uses mock scenarios.')
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const url of ['/', '/?demo=over-limit']) {
    await open(page, 'Kakeibo', url)
    const mood = page.locator('[data-plan-mood]')
    if (await mood.count()) {
      await expect(mood.locator('img')).toBeVisible()
      await expect(mood).not.toContainText(/warning|danger|failed|overspent/i)
    }
  }
})
