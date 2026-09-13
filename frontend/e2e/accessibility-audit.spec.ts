import { expect, test } from '@playwright/test'

const ROUTES = ['/', '/transactions', '/accounts', '/budget', '/goals', '/crypto', '/recurring', '/reports', '/imports', '/rules', '/reconciliation', '/tags', '/sync', '/security', '/settings']

test.describe('route accessibility audit', () => {
  for (const route of ROUTES) {
    test(`${route} has structural accessibility invariants`, async ({ page }) => {
      await page.goto(route)
      await expect(page.locator('main').first()).toBeVisible()
      const issues = await page.evaluate(() => {
        const missingLabels: string[] = []
        for (const element of document.querySelectorAll('input, select, textarea')) {
          const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          const labelled = Boolean(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) || control.closest('label'))
          if (!labelled) missingLabels.push(`${control.tagName.toLowerCase()}[name="${control.getAttribute('name') ?? ''}"]`)
        }
        const duplicateIds = [...document.querySelectorAll('[id]')].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index)
        const missingImageAlt = [...document.images].filter((image) => !image.hasAttribute('alt')).map((image) => image.src)
        const unlabeledIconButtons = [...document.querySelectorAll('button')].filter((button) => !button.textContent?.trim() && !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby') && !button.getAttribute('title')).map((button) => button.outerHTML.slice(0, 160))
        return { missingLabels, duplicateIds: [...new Set(duplicateIds)], missingImageAlt, unlabeledIconButtons }
      })
      expect(issues.missingLabels, `${route}: unlabeled form controls`).toEqual([])
      expect(issues.duplicateIds, `${route}: duplicate IDs`).toEqual([])
      expect(issues.missingImageAlt, `${route}: images without alt`).toEqual([])
      expect(issues.unlabeledIconButtons, `${route}: unlabeled icon buttons`).toEqual([])
    })
  }
})
