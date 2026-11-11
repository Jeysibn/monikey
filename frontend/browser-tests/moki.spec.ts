import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/*
 * Where this spec's evidence screenshots go. By default a temporary, untracked folder, so running the suite never
 * rewrites the approved reference images in docs/. To regenerate those baselines ON PURPOSE, run with
 * MONIKEY_UPDATE_BASELINES=1 and review the diff before committing.
 */
const SHOTS = process.env.MONIKEY_UPDATE_BASELINES === '1' ? '../docs/design/screenshots/moki/correction' : 'test-results/browser/moki-correction'

/** Opens a view the way a person would: directly from the main navigation where it is shown, otherwise through More (phones). */
async function openView(page: Page, name: string) {
  const main = page.getByRole('navigation', { name: 'Main' })
  const direct = main.getByRole('button', { name, exact: true })
  if (await direct.count()) {
    await direct.first().click()
    return
  }
  await main.getByRole('button', { name: 'More', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name, exact: true }).click()
}

test('populated Overview welcomes returning users and keeps financial information visible after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const welcome = page.locator('img[src="/moki/moki-wave.webp"]')
  await expect(welcome).toBeVisible()
  await expect(welcome).toHaveAttribute('alt', '')
  await expect(welcome).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByText('Welcome back!')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wallets' })).toBeVisible()
  await expect(page.getByText('Start by adding a cash, bank or e-wallet account.')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/after-populated-overview-mobile.png` })

  await page.reload()
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()

  await openView(page, 'Accounts')
  await expect(page.locator('img[src="/moki/moki-empty-wallet.webp"]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'All accounts' }).getByRole('button', { name: /Cash on hand.*View details/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add account', exact: true })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/after-populated-accounts-mobile.png` })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/after-populated-accounts-desktop.png`, fullPage: true })
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/after-populated-overview-desktop.png`, fullPage: true })
})

test('populated welcome waits for Overview data and stays hidden during refreshes and errors', async ({ page }) => {
  await page.goto('/?demo=slow')
  const welcome = page.locator('img[src="/moki/moki-wave.webp"]')
  await expect(welcome).toHaveCount(0)
  await expect(welcome).toBeVisible({ timeout: 10_000 })

  await page.getByLabel('Month', { exact: true }).selectOption('2026-09')
  await expect(welcome).toHaveCount(0)
  await expect(welcome).toBeVisible({ timeout: 10_000 })

  await page.goto('/?demo=load-error&failing=summary')
  await expect(welcome).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText(/Couldn’t load your summary|Couldn't load your summary/)

  await page.goto('/?demo=offline')
  await expect(welcome).toHaveCount(0)
  await expect(page.getByRole('alert').first()).toContainText(/Couldn’t load|Couldn't load/)
})

test('first-account saves keep normal status feedback without a setup-dependent mascot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=no-accounts')
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByLabel('Name', { exact: true }).fill('QA Cash Account')
  await page.getByLabel('Current balance (₱)').fill('0')
  await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByText('Account added: QA Cash Account.')).toBeVisible()
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()
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
  await expect(page.getByRole('button', { name: 'Reset filters' })).toBeVisible()
  const activityAxe = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(activityAxe.violations.map(({ id }) => id)).toEqual([])
  await page.screenshot({ path: 'test-results/browser/moki-activity-no-results-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/browser/moki-activity-no-results-mobile.png', fullPage: true })

  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page.locator('img[src="/moki/moki-search.webp"]')).toHaveCount(0)
  await expect(page.locator('img[src="/moki/moki-sleeping.webp"]')).toBeVisible()
})

test('Kakeibo planning pose appears only while the selected month has no plan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?demo=no-plan')
  await openView(page, 'Kakeibo')
  await expect(page.locator('img[src="/moki/moki-checklist-thinking.webp"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No plan for October 2026 yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create plan for October 2026', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/browser/moki-kakeibo-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.screenshot({ path: 'test-results/browser/moki-kakeibo-desktop.png', fullPage: true })

  await page.goto('/?demo=overpaid')
  await openView(page, 'Kakeibo')
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
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  expect(requests).toEqual(['/moki/moki-wave.webp'])

  await page.goto('/?demo=no-accounts')
  await expect(page.locator('img[src="/moki/moki-wave.webp"]')).toBeVisible()
  await openView(page, 'Accounts')
  await expect(page.locator('img[src="/moki/moki-empty-wallet.webp"]')).toBeVisible()
  expect(requests).toEqual(['/moki/moki-wave.webp', '/moki/moki-wave.webp', '/moki/moki-empty-wallet.webp'])
})

test('populated Overview welcome stays visible and compact at supported widths', async ({ page }) => {
  await page.goto('/')
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const image = page.locator('img[src="/moki/moki-wave.webp"]')
    await expect(image).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Net position' })).toBeVisible()
    await expect(page.getByText('Welcome back!')).toBeVisible()
    const bounds = await image.boundingBox()
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
    expect(dimensions.scroll, `Overview horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
    expect(bounds?.x).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? width)).toBeLessThanOrEqual(width)
    if (width === 390) await page.screenshot({ path: `${SHOTS}/after-populated-overview-mobile.png` })
    if (width === 1440) await page.screenshot({ path: `${SHOTS}/after-populated-overview-desktop.png`, fullPage: true })
  }
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
      await openView(page, view)
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
