import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { hasRealApi, seedPopulatedLedger } from './fixtures'

/*
 * The Overview polish: the net-position hero stays first, the welcome panel sits
 * below the hero in a slot of the same height (so it never moves anything), two balanced columns on desktop, and
 * every block still loads, fails and recovers on its own. Runs on either data source unless a test says otherwise.
 */
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seedPopulatedLedger(request)
})

const top = async (locator: ReturnType<Page['locator']>) => Math.round((await locator.boundingBox())!.y)
const hero = (page: Page) => page.locator('section[aria-labelledby="net-position-label"]')

test('reading order: hero, then the welcome panel, then the cards', async ({ page }) => {
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByText('Welcome back!')).toBeVisible()
    const heroTop = await top(hero(page))
    const welcomeTop = await top(page.getByText('Welcome back!'))
    const firstCardTop = await top(page.getByRole('region', { name: /Recent activity|This month/ }).first())
    expect(heroTop, `hero is the first block at ${width}px`).toBeLessThan(welcomeTop)
    expect(welcomeTop).toBeLessThan(firstCardTop)
    const heroBox = (await hero(page).boundingBox())!
    expect(heroBox.y, 'nothing sits above the hero except the page header').toBeLessThan(width >= 1024 ? 140 : 240)
  }
})

test('the reserved welcome slot is exactly as tall as the panel, so showing or hiding it moves nothing', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const panel = page.locator('[data-welcome-slot] > *').first()
    await expect(panel).toBeVisible()
    const [slot, inner] = await Promise.all([page.locator('[data-welcome-slot]').boundingBox(), panel.boundingBox()])
    expect(Math.abs(slot!.height - inner!.height), `slot vs panel height at ${width}px`).toBeLessThanOrEqual(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}px`).toBeLessThanOrEqual(0)
  }
})

test('the blocks below do not move while the data refreshes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const recent = page.getByRole('region', { name: 'Recent activity' })
  const before = await top(recent)
  const heroBefore = await top(hero(page))
  // Change the month and back: a refresh hides the welcome panel for a moment; the slot keeps the page still.
  const samples: number[] = []
  const sample = async () => { samples.push(await top(recent)) }
  const select = page.getByLabel('Month', { exact: true })
  const options = await select.locator('option').evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
  await select.selectOption(options[1]!)
  await sample()
  await select.selectOption(options[0]!)
  await sample()
  await page.waitForTimeout(800)
  await sample()
  expect(await top(hero(page))).toBe(heroBefore)
  for (const y of samples) expect(Math.abs(y - before), 'Recent activity stayed put').toBeLessThanOrEqual(3)
})

test('desktop layout: this month is a strip, wallets and credit cards line up edge to edge, recent activity runs beneath', async ({ page }) => {
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const card = (name: string | RegExp) => page.getByRole('region', { name }).first()
    const wallets = page.locator('main').getByRole('heading', { name: 'Wallets' })
    const credit = page.getByRole('heading', { name: 'Credit cards' })
    const walletCard = (await wallets.locator('xpath=ancestor::*[@data-slot="card"][1]').boundingBox())!
    const creditCard = (await credit.locator('xpath=ancestor::*[@data-slot="card"][1]').boundingBox())!
    expect(Math.abs(walletCard.y - creditCard.y), `${width}px: same top`).toBeLessThanOrEqual(1)
    expect(Math.abs(walletCard.height - creditCard.height), `${width}px: same height`).toBeLessThanOrEqual(1)
    const month = (await card('This month').boundingBox())!
    const recent = (await card(/Recent activity/).boundingBox())!
    expect(month.y + month.height, 'month is above the wallet row').toBeLessThanOrEqual(walletCard.y)
    expect(recent.y, 'recent activity is below the wallet row').toBeGreaterThanOrEqual(walletCard.y + walletCard.height)
    expect(Math.abs(month.x - recent.x) + Math.abs(month.width - recent.width), 'month and recent share both edges').toBeLessThanOrEqual(2)
    expect(Math.abs(walletCard.x - month.x), 'wallets start at the same left edge').toBeLessThanOrEqual(2)
    expect(Math.abs(creditCard.x + creditCard.width - (month.x + month.width)), 'credit cards end at the same right edge').toBeLessThanOrEqual(2)
  }
})

test('Overview and the navigation lead to Dashboard, Activity, Accounts and the account details', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Dashboard' }).first().click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await page.getByRole('button', { name: 'View all', exact: true }).click() // recent activity
  await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await page.getByRole('button', { name: /^View all \d+ accounts$/ }).click()
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
  await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Overview' }).first().click()
  await page.getByRole('button', { name: /^Open /, }).click() // "Open <selected account>"
  await expect(page.locator('[data-account-details]')).toBeVisible()
  await expect(page.locator('[data-account-details]').getByRole('heading', { name: 'Recent activity' })).toBeVisible()
})

test('a block that fails shows its own retry and the rest of Overview stays', async ({ page, request }) => {
  test.skip(await hasRealApi(request), 'Uses the mock source\'s failing-read scenario.')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?demo=load-error&failing=activity')
  await expect(page.getByRole('alert').filter({ hasText: /recent activity/ })).toBeVisible()
  await expect(hero(page)).toBeVisible() // the position is unaffected
  await expect(page.getByRole('button', { name: 'Add transaction' }).first()).toBeEnabled()
})

test('Overview has no automated WCAG A/AA violations and no horizontal scroll at any supported width', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByText('Welcome back!')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow at ${width}px`).toBeLessThanOrEqual(0)
    const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `axe at ${width}px`).toEqual([])
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `test-results/browser/overview-${width}.png`, fullPage: true })
  }
})
