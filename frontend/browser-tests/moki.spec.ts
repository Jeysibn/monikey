import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('Moki appears only for the matching first-run and empty states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=no-accounts')

  const welcome = page.locator('img[src="/moki/moki-wave.webp"]')
  await expect(welcome).toBeVisible()
  await expect(welcome).toHaveAttribute('alt', '')
  await expect(page.getByRole('button', { name: 'Add account' })).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(0)
  const overviewAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(overviewAxe.violations.map(({ id }) => id)).toEqual([])
  await page.screenshot({ path: 'test-results/browser/moki-overview-mobile.png', fullPage: true })

  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await expect(page.locator('img[src="/moki/moki-empty-wallet.webp"]')).toBeVisible()
  await expect(page.getByRole('region', { name: 'All accounts' }).getByRole('button', { name: 'Add account' })).toBeVisible()
  await page.screenshot({ path: 'test-results/browser/moki-accounts-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: 'test-results/browser/moki-accounts-desktop.png', fullPage: true })
})

test('first-use artwork disappears after the first account is saved', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=no-accounts')
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByLabel('Name', { exact: true }).fill('QA Cash Account')
  await page.getByLabel('Current balance (₱)').fill('0')
  await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByText('Account added: QA Cash Account.')).toBeVisible()
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toHaveCount(0)
  await expect(page.locator('img[src="/moki/moki-thumbs-up.webp"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/browser/moki-first-account-success-mobile.png', fullPage: true })
})

test('first-account success art is withheld when the save fails', async ({ page }) => {
  await page.goto('/?demo=no-accounts&behavior=save-error')
  await page.getByRole('button', { name: 'Add account', exact: true }).first().click()
  await page.getByLabel('Name', { exact: true }).fill('QA Failed Account')
  await page.getByLabel('Current balance (₱)').fill('0')
  await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByText("Couldn't save. Check your connection and try again. Your account details are still here.")).toBeVisible()
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await expect(page.locator('img[src="/moki/moki-thumbs-up.webp"]')).toHaveCount(0)
})

test('Activity separates an empty history from filtered no-results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/?demo=no-accounts')
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await expect(page.locator('img[src="/moki/moki-sleeping.webp"]')).toBeVisible()
  await expect(page.getByText('No activity in October 2026.')).toBeVisible()
  await page.screenshot({ path: 'test-results/browser/moki-activity-empty-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/browser/moki-activity-empty-mobile.png', fullPage: true })

  await page.goto('/')
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await page.getByLabel('Month').selectOption('2026-09')
  await page.getByLabel('Account').selectOption('1')
  await expect(page.locator('img[src="/moki/moki-search.webp"]')).toBeVisible()
  await expect(page.getByText('Nothing matches these filters.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()
  const activityAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(activityAxe.violations.map(({ id }) => id)).toEqual([])
  await page.screenshot({ path: 'test-results/browser/moki-activity-no-results-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/browser/moki-activity-no-results-mobile.png', fullPage: true })

  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.locator('img[src="/moki/moki-search.webp"]')).toHaveCount(0)
  await expect(page.locator('img[src="/moki/moki-sleeping.webp"]')).toBeVisible()
})

test('Kakeibo planning pose appears only while the selected month has no plan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=no-plan')
  await page.getByRole('button', { name: 'Kakeibo', exact: true }).click()
  await expect(page.locator('img[src="/moki/moki-checklist-thinking.webp"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No plan for October 2026 yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create the October 2026 plan' })).toBeVisible()
  await page.screenshot({ path: 'test-results/browser/moki-kakeibo-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: 'test-results/browser/moki-kakeibo-desktop.png', fullPage: true })

  await page.goto('/?demo=overpaid')
  await page.getByRole('button', { name: 'Kakeibo', exact: true }).click()
  await expect(page.locator('img[src="/moki/moki-checklist-thinking.webp"]')).toHaveCount(0)
})

test('failed mascot artwork falls back to the state copy and action', async ({ page }) => {
  await page.route('**/moki/moki-wave.webp', (route) => route.abort())
  await page.goto('/?demo=no-accounts')
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toHaveCount(0)
  await expect(page.getByText('Start by adding a cash, bank or e-wallet account.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add account' })).toBeVisible()
})

test('optimized mascot assets decode at the expected size with transparent corners', async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const paths = [
      '/moki/moki-wave.webp',
      '/moki/moki-empty-wallet.webp',
      '/moki/moki-sleeping.webp',
      '/moki/moki-search.webp',
      '/moki/moki-checklist-thinking.webp',
      '/moki/moki-thumbs-up.webp',
    ]
    return Promise.all(paths.map(async (src) => {
      const image = new Image()
      image.src = src
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable')
      context.drawImage(image, 0, 0)
      return { src, width: image.naturalWidth, height: image.naturalHeight, cornerAlpha: context.getImageData(0, 0, 1, 1).data[3] }
    }))
  })
  for (const asset of results) {
    expect(asset.width, asset.src).toBe(480)
    expect(asset.height, asset.src).toBe(480)
    expect(asset.cornerAlpha, asset.src).toBe(0)
  }
})

test('only the pose for the current state is requested', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/moki/')) requests.push(path)
  })

  await page.goto('/')
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor()
  expect(requests).toEqual([])

  await page.goto('/?demo=no-accounts')
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await expect(page.locator('img[src="/moki/moki-empty-wallet.webp"]')).toBeVisible()
  expect(requests).toEqual(['/moki/moki-wave.webp', '/moki/moki-empty-wallet.webp'])
})

test('Moki states fit supported widths without cropping or horizontal overflow', async ({ page }) => {
  await page.goto('/?demo=no-accounts')
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [view, selector] of [
      ['Overview', 'img[src="/moki/moki-wave.webp"]'],
      ['Accounts', 'img[src="/moki/moki-empty-wallet.webp"]'],
      ['Activity', 'img[src="/moki/moki-sleeping.webp"]'],
      ['Kakeibo', 'img[src="/moki/moki-checklist-thinking.webp"]'],
    ]) {
      await page.getByRole('button', { name: view, exact: true }).click()
      const image = page.locator(selector)
      await expect(image).toBeVisible()
      const bounds = await page.locator(selector).boundingBox()
      const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
      expect(dimensions.scroll, `${view} horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
      expect(bounds?.x).toBeGreaterThanOrEqual(0)
      expect((bounds?.x ?? 0) + (bounds?.width ?? width)).toBeLessThanOrEqual(width)
      if (width === 390 && view === 'Accounts') {
        const addAccount = await page.getByRole('region', { name: 'All accounts' }).getByRole('button', { name: 'Add account' }).boundingBox()
        const bottomNav = await page.getByRole('navigation', { name: 'Main' }).boundingBox()
        expect(addAccount?.y + (addAccount?.height ?? 0)).toBeLessThanOrEqual(bottomNav?.y ?? 0)
      }
      if (width === 1440 && view === 'Overview') await page.screenshot({ path: 'test-results/browser/moki-overview-desktop.png', fullPage: true })
    }
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await page.getByLabel('Month').selectOption('2026-09')
  await page.getByLabel('Account').selectOption('1')
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const image = page.locator('img[src="/moki/moki-search.webp"]')
    await expect(image).toBeVisible()
    const bounds = await image.boundingBox()
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `filtered Activity horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
    expect(bounds?.x).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? width)).toBeLessThanOrEqual(width)
  }
})
