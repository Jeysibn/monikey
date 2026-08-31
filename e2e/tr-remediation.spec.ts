import { readFileSync, readdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'

// Third-review remediation (TR-001 … TR-009): end-to-end coverage for the
// behavior each task promised, asserted against the running production build
// rather than the selectors directly.

test.describe('TR-007 — the suite runs against a fresh production build', () => {
  test('the served app is the current on-disk build, not a dev server and not stale output', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.ok()).toBe(true)

    const html = await page.content()
    // `vite build` emits content-hashed bundles into dist/; the dev server
    // serves `/src/main.tsx` and injects its HMR client instead.
    const servedScript = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)
    expect(servedScript, 'the page should load a content-hashed production bundle').not.toBeNull()
    expect(html).not.toContain('/@vite/client')
    expect(html).not.toContain('/src/main.tsx')

    // A hashed filename alone only proves *some* build was served — a stale
    // one has hashed names too. Compare it against what is on disk right now:
    // the bundle the server is handing out must be the bundle this run's
    // `npm run build` just produced, and `dist/index.html` must reference the
    // same one. Together with `reuseExistingServer: false`, that closes the
    // "adopted an already-running server holding old output" gap.
    const builtAssets = readdirSync('dist/assets')
    expect(builtAssets, 'the served bundle must exist in the freshly built dist/').toContain(servedScript![1])

    const builtIndex = readFileSync('dist/index.html', 'utf8')
    expect(builtIndex, 'dist/index.html must reference the same bundle the server served').toContain(servedScript![1])
  })
})

test.describe('TR-001 — one clock: rolling it forward moves everything together', () => {
  test('a frozen clock in the next month moves the reporting label, its totals, and the form default date together', async ({ page }) => {
    // Baseline: the demo clock (2026-08-29). All seeded activity is in August.
    await page.goto('/transactions')
    await expect(page.getByText('Income · August 2026')).toBeVisible()
    await expect(page.getByText('₱2,500.00')).toBeVisible() // income, August
    await expect(page.getByText('₱144.65')).toBeVisible() // expenses, August

    // Roll the ONE clock into September.
    await page.goto('/transactions?today=2026-09-05')
    await expect(page.getByText('Income · September 2026')).toBeVisible()
    await expect(page.getByText('Expenses · September 2026')).toBeVisible()
    await expect(page.getByText('Net Cash Flow · September 2026')).toBeVisible()
    // Every August figure now falls outside the reporting period, so the
    // period-scoped totals are zero — the labels and the maths moved together.
    await expect(page.getByText('₱2,500.00')).toHaveCount(0)
    await expect(page.getByText('₱144.65')).toHaveCount(0)
    await expect(page.getByText('₱0.00').first()).toBeVisible()

    // The Add Transaction form's default date moved with it: a default save
    // always lands inside the period the KPIs are labeled with.
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.locator('input[type="date"]')).toHaveValue('2026-09-05')
  })

  test('the same clock drives the dashboard’s budget days remaining and chart window', async ({ page }) => {
    await page.goto('/budget?today=2026-09-05')
    // 2026-09-05 -> period end 2026-10-01 = 26 days.
    await expect(page.getByText('Within total budget · 26 days left')).toBeVisible()

    await page.goto('/?today=2026-09-05')
    await expect(page.getByText('Aug 30 – Sep 5')).toBeVisible()
  })
})

test.describe('TR-005 — expense chart titles match their data windows', () => {
  test('each period title names the exact range the buckets cover', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Expenses · Last 7 days')).toBeVisible()
    await expect(page.getByText('Aug 23 – Aug 29')).toBeVisible()
    // The old titles claimed calendar periods the buckets never covered.
    await expect(page.getByText('Expenses · this week')).toHaveCount(0)

    await page.getByRole('button', { name: 'Weekly', exact: true }).click()
    await expect(page.getByText('Expenses · Last 4 weeks')).toBeVisible()
    await expect(page.getByText('Aug 2 – Aug 29')).toBeVisible()
    await expect(page.getByText('Expenses · this month')).toHaveCount(0)

    await page.getByRole('button', { name: 'Monthly', exact: true }).click()
    await expect(page.getByText('Expenses · Last 6 months')).toBeVisible()
    await expect(page.getByText('Mar 1 – Aug 31')).toBeVisible()
    await expect(page.getByText('Expenses · this year')).toHaveCount(0)
  })

  test('weekly buckets expose their date ranges to assistive technology, so W1–W4 need no guessing', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Weekly', exact: true }).click()

    const accessibleRows = page.locator('.area-expenses ul.visually-hidden li')
    await expect(accessibleRows).toHaveCount(4)
    await expect(accessibleRows.nth(0)).toContainText('W1 (Aug 2 – Aug 8)')
    await expect(accessibleRows.nth(3)).toContainText('W4 (Aug 23 – Aug 29)')

    // The visible axis label carries the same range as a tooltip.
    await expect(page.locator('.months span').first()).toHaveAttribute('title', 'W1: Aug 2 – Aug 8')
  })
})

test.describe('TR-003 — credit-card workflow', () => {
  test('Add Card captures a due date and minimum payment, and the minimum reaches Money Position', async ({ page }) => {
    await page.goto('/accounts')
    // Baseline upcoming commitments: ₱75 + ₱30 across the two seeded cards.
    await page.getByRole('button', { name: '+ Add card' }).click()
    await page.getByRole('textbox', { name: 'Card name' }).fill('BPI Rewards')
    await page.getByRole('textbox', { name: 'Last 4 digits' }).fill('9911')
    await page.getByRole('textbox', { name: 'Credit limit' }).fill('3000')
    await page.getByRole('textbox', { name: 'Current balance (optional)' }).fill('200')
    await page.getByLabel('Payment due date').fill('2026-09-20')
    await page.getByRole('textbox', { name: 'Minimum payment' }).fill('40')
    await page.getByRole('button', { name: 'Add card', exact: true }).click()

    const cardRow = page.locator('.account-row').filter({ hasText: 'BPI Rewards' })
    await expect(cardRow).toBeVisible()
    // Stored as a real date, rendered for humans — never "Not set".
    await expect(cardRow).toContainText('Due Sep 20 · min ₱40')
    await expect(page.getByText('Due date not set')).toHaveCount(0)

    // Client-side navigation keeps the in-memory state; the new card's
    // minimum is inside the documented 30-day horizon, so it is counted.
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page.locator('.money-position')).toContainText('₱145') // 75 + 30 + 40
    await expect(page.locator('.money-position')).toContainText('due in the next 30 days')
  })

  test('Add Card refuses to store an incomplete card', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('button', { name: '+ Add card' }).click()
    await page.getByRole('textbox', { name: 'Card name' }).fill('No Due Date')
    await page.getByRole('textbox', { name: 'Last 4 digits' }).fill('1234')
    await page.getByRole('textbox', { name: 'Credit limit' }).fill('1000')
    await page.getByRole('button', { name: 'Add card', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('due date')
    await expect(page.locator('.account-row').filter({ hasText: 'No Due Date' })).toHaveCount(0)
  })

  // FINDING-009: a past due date would be accepted and then sit outside the
  // 30-day horizon forever, contributing nothing — the exact failure TR-003
  // exists to remove.
  test('Add Card refuses a due date already in the past, and does not offer one', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('button', { name: '+ Add card' }).click()

    // The picker will not offer a past date in the first place.
    await expect(page.getByLabel('Payment due date')).toHaveAttribute('min', '2026-08-29')

    await page.getByRole('textbox', { name: 'Card name' }).fill('Stale Due Date')
    await page.getByRole('textbox', { name: 'Last 4 digits' }).fill('4321')
    await page.getByRole('textbox', { name: 'Credit limit' }).fill('1000')
    await page.getByLabel('Payment due date').fill('2024-01-05')
    await page.getByRole('button', { name: 'Add card', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('can’t be in the past')
    await expect(page.getByLabel('Payment due date')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('.account-row').filter({ hasText: 'Stale Due Date' })).toHaveCount(0)
  })

  test('paying ₱500 from Checking to a credit card reduces cash and credit owed, leaving cash flow untouched', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page.getByText('₱2,500.00')).toBeVisible() // income, August
    await expect(page.getByText('₱144.65')).toBeVisible() // expenses, August

    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('button', { name: 'Transfer', exact: true }).click()
    await page.locator('.tx-amount-input').fill('500')
    await page.getByLabel(/From Account/).selectOption({ label: 'Checking ••4471' })
    await page.getByLabel(/To Account/).selectOption({ label: 'Visa Platinum ••2290' })
    // The path is labeled as a card payment while keeping transfer semantics.
    await expect(page.getByText(/Credit card payment:/)).toBeVisible()
    await page.getByRole('button', { name: 'Save Transfer' }).click()
    await expect(page.getByText('Card payment saved')).toBeVisible()

    // Income and expenses are unchanged — a card payment is not cash flow.
    await expect(page.getByText('₱2,500.00')).toBeVisible()
    await expect(page.getByText('₱144.65')).toBeVisible()

    await page.getByRole('link', { name: 'Accounts', exact: true }).click()
    // Checking 4,120 - 500 = 3,620; credit owed 2,070 - 500 = 1,570.
    await expect(page.locator('.account-row').filter({ hasText: 'Checking' })).toContainText('₱3,620.00')
    await expect(page.locator('.account-row').filter({ hasText: 'Visa Platinum' })).toContainText('₱960.00')
    await expect(page.getByText('₱1,570.00')).toBeVisible()
  })

  test('a card cannot be used as a transfer source (no cash advances)', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('button', { name: 'Transfer', exact: true }).click()

    const fromOptions = await page.getByLabel(/From Account/).locator('option').allTextContents()
    expect(fromOptions).not.toContain('Visa Platinum ••2290')
    expect(fromOptions).not.toContain('Mastercard ••7734')
  })
})

test.describe('TR-004 — goal funding integrity', () => {
  test('funding cannot exceed the selected source account’s balance', async ({ page }) => {
    await page.goto('/goals')
    const carCard = page.locator('.goal-card').filter({ hasText: 'Car Down Payment' })
    await carCard.getByRole('button', { name: '+ Add funds' }).click()

    // Cash Wallet holds ₱120, while the goal still needs ₱4,987 — the
    // ceiling shown is the smaller of the two.
    await carCard.getByLabel('Fund from account').selectOption({ label: 'Cash Wallet · ₱120.00 available' })
    await expect(carCard.getByText('Up to ₱120.00')).toBeVisible()

    await carCard.getByLabel('Amount to add').fill('500')
    await carCard.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(carCard.getByRole('alert')).toContainText('Cash Wallet only has ₱120.00 available')
    // Nothing moved: the goal and the account are untouched.
    await expect(carCard.getByText('₱13')).toBeVisible()
    await page.getByRole('link', { name: 'Accounts', exact: true }).click()
    await expect(page.locator('.account-row').filter({ hasText: 'Cash Wallet' })).toContainText('₱120.00')
  })

  // FINDING-001 regression: the ceiling the form offers must be a ceiling the
  // repository accepts. Rounding it to whole pesos produced "Up to ₱120" over
  // a ₱119.60 balance, and entering 120 was then rejected by an error naming
  // ₱120 as what was available — leaving the true maximum undiscoverable.
  test('the displayed fundable ceiling is exact and can be submitted verbatim', async ({ page }) => {
    // Make the Cash Wallet balance fractional: ₱120 − ₱0.40 = ₱119.60.
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.locator('.tx-amount-input').fill('0.40')
    await page.getByPlaceholder('e.g. Grab Grocery').fill('Sachet')
    await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Food & Groceries' })
    await page.getByLabel('Account', { exact: false }).selectOption({ label: 'Cash Wallet' })
    await page.getByRole('button', { name: 'Save Expense' }).click()
    await expect(page.getByText('Expense saved')).toBeVisible()

    await page.getByRole('link', { name: 'Goals', exact: true }).click()
    const carCard = page.locator('.goal-card').filter({ hasText: 'Car Down Payment' })
    await carCard.getByRole('button', { name: '+ Add funds' }).click()
    await carCard.getByLabel('Fund from account').selectOption({ label: 'Cash Wallet · ₱119.60 available' })

    // The ceiling is stated to the centavo, not rounded up to ₱120.
    await expect(carCard.getByText('Up to ₱119.60')).toBeVisible()

    // Submitting exactly what the form offers succeeds.
    await carCard.getByLabel('Amount to add').fill('119.60')
    await carCard.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(carCard.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('.goal-card').filter({ hasText: 'Car Down Payment' }).getByText('₱133')).toBeVisible()

    await page.getByRole('link', { name: 'Accounts', exact: true }).click()
    await expect(page.locator('.account-row').filter({ hasText: 'Cash Wallet' })).toContainText('₱0.00')
  })

  test('seed data satisfies the same no-overfunding rule as user-created goals', async ({ page }) => {
    await page.goto('/goals')
    // Home Fund used to hold ₱3,743 against a ₱3,500 target (107%).
    const homeCard = page.locator('.completed-card').filter({ hasText: 'Home Fund' })
    await expect(homeCard).toContainText('₱3,500')
    await expect(homeCard).toContainText('100% of ₱3,500')
    await expect(page.getByText(/1(0[1-9]|[1-9][0-9])% of/)).toHaveCount(0)
  })
})

test.describe('TR-009 — form errors are programmatically associated and take focus', () => {
  test('an invalid Add Transaction submit focuses the first invalid control and links its message', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()

    // Everything blank: the amount is the first invalid control.
    await page.getByRole('button', { name: 'Save Expense' }).click()

    const amount = page.locator('.tx-amount-input')
    await expect(amount).toBeFocused()
    await expect(amount).toHaveAttribute('aria-invalid', 'true')

    const describedBy = await amount.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`#${describedBy}`)).toHaveText('Enter an amount greater than zero.')

    // With a valid amount, focus moves on to the next invalid control.
    await amount.fill('50')
    await page.getByRole('button', { name: 'Save Expense' }).click()
    const title = page.getByPlaceholder('e.g. Grab Grocery')
    await expect(title).toBeFocused()
    await expect(title).toHaveAttribute('aria-invalid', 'true')
  })

  test('a local form error lands on the field that caused it, not a detached paragraph', async ({ page }) => {
    await page.goto('/budget')
    await page.getByRole('button', { name: '+ New category' }).click()
    await page.getByRole('textbox', { name: 'Category name' }).fill('Too Big')
    await page.getByRole('textbox', { name: 'Monthly budget' }).fill('5000')
    await page.getByRole('button', { name: 'Add category' }).click()

    const allocated = page.getByRole('textbox', { name: 'Monthly budget' })
    await expect(allocated).toBeFocused()
    await expect(allocated).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await allocated.getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy}`)).toContainText('unallocated')
  })

  // FINDING-002 regression: an error must not outlive the mistake. Every form
  // family is covered — the modal (which uses the shared hook) and the local
  // page forms (Budget, Accounts, Goals).
  test('a corrected field stops announcing itself as invalid — Add Transaction modal', async ({ page }) => {
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await page.getByRole('button', { name: 'Save Expense' }).click()

    const amount = page.locator('.tx-amount-input')
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter an amount greater than zero.')).toBeVisible()

    await amount.fill('50')

    await expect(amount).not.toHaveAttribute('aria-invalid', /.*/)
    await expect(amount).not.toHaveAttribute('aria-describedby', /.*/)
    await expect(page.getByText('Enter an amount greater than zero.')).toHaveCount(0)
  })

  test('a corrected field stops announcing itself as invalid — Budget category form', async ({ page }) => {
    await page.goto('/budget')
    await page.getByRole('button', { name: '+ New category' }).click()
    await page.getByRole('button', { name: 'Add category' }).click()

    const name = page.getByRole('textbox', { name: 'Category name' })
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Category name is required.')).toBeVisible()

    await name.fill('Entertainment')

    await expect(name).not.toHaveAttribute('aria-invalid', /.*/)
    await expect(page.getByText('Category name is required.')).toHaveCount(0)
  })

  test('a corrected field stops announcing itself as invalid — Add Card and Add Funds forms', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('button', { name: '+ Add card' }).click()
    await page.getByRole('button', { name: 'Add card', exact: true }).click()

    const cardName = page.getByRole('textbox', { name: 'Card name' })
    await expect(cardName).toHaveAttribute('aria-invalid', 'true')
    await cardName.fill('BPI Rewards')
    await expect(cardName).not.toHaveAttribute('aria-invalid', /.*/)

    await page.getByRole('link', { name: 'Goals', exact: true }).click()
    const carCard = page.locator('.goal-card').filter({ hasText: 'Car Down Payment' })
    await carCard.getByRole('button', { name: '+ Add funds' }).click()
    await carCard.getByRole('button', { name: 'Add', exact: true }).click()

    const fundAmount = carCard.getByLabel('Amount to add')
    await expect(fundAmount).toHaveAttribute('aria-invalid', 'true')
    await fundAmount.fill('10')
    await expect(fundAmount).not.toHaveAttribute('aria-invalid', /.*/)
  })

  test('essential financial text is never rendered below 12px', async ({ page }) => {
    for (const route of ['/', '/transactions', '/accounts', '/budget', '/goals']) {
      await page.goto(route)
      const tooSmall = await page.evaluate(() => {
        const offenders: string[] = []
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          if (el.closest('.visually-hidden')) continue
          const text = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent?.trim() ?? '')
            .join('')
          if (!text) continue
          const size = parseFloat(getComputedStyle(el).fontSize)
          if (size < 12) offenders.push(`${el.className || el.tagName} @ ${size}px: ${text.slice(0, 40)}`)
        }
        return offenders
      })
      expect(tooSmall, `${route} should render no text below 12px`).toEqual([])
    }
  })

  test('no page overflows horizontally at any target width', async ({ page }) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of ['/', '/transactions', '/accounts', '/budget', '/goals']) {
        await page.goto(route)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${route} should not overflow horizontally at ${width}px`).toBeLessThanOrEqual(0)
      }
    }
  })

  test('the changed workflows stay usable at 200% zoom with no horizontal overflow', async ({ page }) => {
    // 200% zoom at a 1280px window behaves like a 640px CSS viewport.
    await page.setViewportSize({ width: 640, height: 720 })
    for (const route of ['/', '/accounts', '/goals', '/budget']) {
      await page.goto(route)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${route} should not overflow horizontally at 200% zoom`).toBeLessThanOrEqual(0)
    }

    // The Add Transaction dialog's actions stay reachable, not clipped.
    await page.goto('/transactions')
    await page.getByRole('main').getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.getByRole('button', { name: 'Save Expense' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })
})
