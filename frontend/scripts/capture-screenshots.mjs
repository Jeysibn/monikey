// Regenerates docs/screenshots/*.png from the current build.
//
// Usage: npm run screenshots
// (starts its own preview server against `dist/`, so run `npm run build` first
// if you want the screenshots to reflect the latest source.)
//
// SR-012: added because there was previously no reusable way to regenerate
// the docs screenshots — they had gone stale relative to the Money Position
// reorder, the Recent Transactions overlap fix, and the scrollbar change.

import { chromium } from 'playwright-core'
import { preview } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const outDir = path.join(repoRoot, 'docs', 'screenshots')

async function main() {
  const server = await preview({ root: frontendRoot, preview: { port: 4174, strictPort: false } })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')

  const browser = await chromium.launch()

  try {
    // Desktop pages: a fixed 1440x1000 viewport, viewport-only screenshot
    // (matches the existing committed screenshots' framing).
    const desktopPages = [
      { path: '/', name: 'dashboard.png', fullPage: true },
      { path: '/transactions', name: 'transactions.png', fullPage: false },
      { path: '/budget', name: 'budget.png', fullPage: false },
      { path: '/goals', name: 'goals.png', fullPage: false },
      { path: '/accounts', name: 'accounts.png', fullPage: false },
    ]

    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    for (const p of desktopPages) {
      const page = await desktopContext.newPage()
      await page.goto(`${base}${p.path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(150) // settle animations/fonts
      await page.screenshot({ path: path.join(outDir, p.name), fullPage: p.fullPage })
      await page.close()
      console.log(`captured ${p.name}`)
    }
    await desktopContext.close()

    // Mobile dashboard: 390px wide, full page.
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const mobilePage = await mobileContext.newPage()
    await mobilePage.goto(`${base}/`, { waitUntil: 'networkidle' })
    await mobilePage.waitForTimeout(150)
    await mobilePage.screenshot({ path: path.join(outDir, 'dashboard-mobile.png'), fullPage: true })
    await mobilePage.close()
    await mobileContext.close()
    console.log('captured dashboard-mobile.png')
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
