import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts because `tsc -b` (part of `npm run build`)
// type-checks vite.config.ts against Vite's UserConfig, which doesn't know
// about Vitest's `test` option unless a `vitest/config` triple-slash
// reference is added there — kept apart instead so the build's typecheck
// stays untouched by test-runner concerns.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    // Pinned to a non-UTC zone on purpose. Every date helper in the app is
    // local-calendar based (see `utils/date.ts`), so running the whole suite
    // at UTC+8 proves none of it accidentally depends on the local offset
    // being zero — and it is what lets `clock.test.ts` distinguish a genuine
    // local date from a UTC-shifted one.
    env: { TZ: 'Asia/Manila' },
  },
})
