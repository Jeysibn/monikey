import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { hasRealApi, seedPopulatedLedger, uniqueSuffix } from './fixtures'

/*
 * The redesigned Kakeibo page: two ARIA tabs (Plan & Progress, Reflections), the plan summary, four envelope
 * cards, unclassified expenses, folded plan details, and the reflections. Tabs, layout and accessibility run on
 * either data source. The figure checks need the real API and compare the screen with the server's own report, so
 * no expected number is hard-coded and the test does not depend on what else is in the database.
 */
async function openKakeibo(page: Page) {
  const width = page.viewportSize()?.width ?? 1440
  if (width < 768) {
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Kakeibo', exact: true }).click()
  } else {
    await page.locator('nav[aria-label="Main"] button:visible').filter({ hasText: 'Kakeibo' }).first().click()
  }
  await expect(page.getByRole('heading', { name: 'Kakeibo', level: 1 })).toBeFocused()
}

const pesos = (centavos: bigint | number): string => {
  const value = BigInt(centavos)
  const abs = value < 0n ? -value : value
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${value < 0n ? '-' : ''}₱${whole}.${(abs % 100n).toString().padStart(2, '0')}`
}
const cents = (value: string): bigint => {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))
}

test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // scan settled colors, not a half-finished button fade (see overview-dashboard.spec.ts)
  await seedPopulatedLedger(request)
})

test('two tabs follow the ARIA tabs pattern: arrows, Home, End, one tab stop and linked panels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openKakeibo(page)
  const plan = page.getByRole('tab', { name: 'Plan & Progress' })
  const reflect = page.getByRole('tab', { name: 'Reflections' })
  await expect(plan).toHaveAttribute('aria-selected', 'true')
  await expect(plan).toHaveAttribute('tabindex', '0')
  await expect(reflect).toHaveAttribute('tabindex', '-1') // only the selected tab is a tab stop
  await expect(page.getByRole('tabpanel', { name: 'Plan & Progress' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Look back' })).toBeHidden()

  await plan.focus()
  await page.keyboard.press('ArrowRight')
  await expect(reflect).toBeFocused()
  await expect(reflect).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Reflections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your four envelopes' })).toBeHidden()
  await page.keyboard.press('ArrowRight') // wraps
  await expect(plan).toBeFocused()
  await page.keyboard.press('End')
  await expect(reflect).toBeFocused()
  await page.keyboard.press('Home')
  await expect(plan).toBeFocused()
  // The controlled panel exists and names its tab.
  const controls = await plan.getAttribute('aria-controls')
  expect(await page.locator(`#${controls}`).getAttribute('aria-labelledby')).toBe(await plan.getAttribute('id'))
})

test('plan and reflections fit every supported width without horizontal scroll and pass axe', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await openKakeibo(page)
    for (const tab of ['Plan & Progress', 'Reflections']) {
      await page.getByRole('tab', { name: tab }).click()
      const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }))
      expect(dimensions.scroll, `${tab}: horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.width)
      const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map(({ id, impact, description }) => ({ id, impact, description })), `${tab}: axe at ${width}px`).toEqual([])
    }
  }
})

test('the summary and envelopes match the server report; savings and unclassified are never presented as saved or hidden', async ({ page, request }) => {
  test.skip(!(await hasRealApi(request)), 'Compares the screen with the real API report; mock data is covered by the unit tests.')
  const manila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const currentMonth = manila.slice(0, 7)
  const suffix = uniqueSuffix()

  const put = await request.put(`/api/kakeibo/months/${currentMonth}`, {
    data: {
      planned_income: '36000.00', allocated_starting_funds: '2000.00', savings_target: '5000.00', prior_period_debt_reserve: '3000.00',
      needs_limit: '18000.00', wants_limit: '5000.00', culture_limit: '2000.00', unexpected_limit: '3000.00', monthly_intention: `QA intention ${suffix}`,
    },
  })
  expect(put.status(), await put.text()).toBe(200)
  const account = await (await request.post('/api/accounts', { data: { name: `QA Kakeibo ${suffix}`, type: 'bank', opening_balance: '50000.00' } })).json() as { id: number }
  const expenseCategory = (await (await request.get('/api/categories?type=expense&status=active')).json() as { id: number }[])[0]!
  const spend = async (amount: string, envelope: string | null) => {
    const response = await request.post('/api/transactions', { data: { account_id: account.id, category_id: expenseCategory.id, amount, transaction_date: manila, kakeibo_envelope: envelope, note: `QA ${suffix}` } })
    expect(response.status(), await response.text()).toBe(201)
  }
  await spend('1234.56', 'needs')
  await spend('99.99', 'wants')
  await spend('77.77', null) // unclassified

  const report = await (await request.get(`/api/kakeibo/months/${currentMonth}/report`)).json() as Record<string, any>
  const envelopes = ['needs', 'wants', 'culture', 'unexpected'] as const
  const allocated = envelopes.reduce((sum, key) => sum + cents(report.envelopes[key].limit), 0n)
  const classified = envelopes.reduce((sum, key) => sum + cents(report.envelopes[key].actual_spent), 0n)
  expect(allocated).toBe(cents(report.available_to_allocate) - cents(report.unallocated)) // the server agrees with itself

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await openKakeibo(page)
  const summary = page.getByRole('region', { name: `Spending plan summary for ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })}` })
  await expect(summary).toContainText(pesos(allocated))
  await expect(summary).toContainText(pesos(classified))
  await expect(summary.getByText(/savings target is a goal, not money already saved/)).toBeVisible()
  await expect(summary).toContainText(pesos(cents(report.unclassified_expenses)))
  await expect(summary).toContainText(`total expenses of ${pesos(cents(report.total_expenses))}`)
  expect(cents(report.unclassified_expenses)).toBeGreaterThanOrEqual(7777n)
  expect(cents(report.total_expenses)).toBe(classified + cents(report.unclassified_expenses)) // unclassified stays inside total spending

  // Four envelope cards in a fixed order, each with the server's spent figure and an accessible progress description.
  for (const [key, label] of [['needs', 'Needs'], ['wants', 'Wants'], ['culture', 'Culture'], ['unexpected', 'Unexpected']] as const) {
    const card = page.getByRole('article', { name: label })
    await expect(card).toContainText(pesos(cents(report.envelopes[key].actual_spent)))
    await expect(card).toContainText(pesos(cents(report.envelopes[key].remaining)))
  }
  await expect(page.getByRole('region', { name: 'Not yet classified' })).toContainText(pesos(cents(report.unclassified_expenses)))
  await page.getByRole('button', { name: 'Classify expenses' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  // The plan details are folded on phones and carry the server's own figures.
  const details = page.getByRole('region', { name: 'Monthly plan details' })
  await expect(details).toContainText(pesos(cents(report.available_to_allocate)))
  await expect(details).toContainText(`QA intention ${suffix}`)
})

test('Manage category defaults leads to Categories and the Suggestions editor is gone from Kakeibo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await openKakeibo(page)
  await expect(page.getByText('Category suggestions', { exact: false })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Reflections' }).click()
  await expect(page.getByText('Category suggestions', { exact: false })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Plan & Progress' }).click()
  await page.getByRole('button', { name: 'Manage category defaults' }).click()
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Edit /i }).first()).toBeVisible() // where each default is changed
})
