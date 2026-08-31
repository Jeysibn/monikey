import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  // TR-007: the suite is self-building from a clean checkout. `vite preview`
  // only SERVES an existing `dist/` — it never builds one — and `dist/` is
  // gitignored, so the previous `npm run preview` command silently depended
  // on someone having run a build first (or tested stale output).
  //
  // Playwright starts `webServer` ONCE for the whole run, before any worker
  // spawns, so chaining the build here produces exactly one production build
  // no matter how many workers `fullyParallel` uses — which chaining it into
  // the test script per worker would not guarantee.
  //
  // `reuseExistingServer` is false EVERYWHERE, not just in CI. With it on,
  // any process already listening on 4173 (a dev's own `npm run preview`)
  // would be adopted and the webServer command — including the build — would
  // never run, so the suite would silently test whatever stale `dist/` that
  // server happened to hold. That is exactly the failure TR-007 exists to
  // remove, so the build guarantee is unconditional rather than CI-only; a
  // port already in use now fails loudly via `--strictPort` instead.
  //
  // The longer timeout covers `tsc -b && vite build` plus preview startup on
  // a cold machine.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
