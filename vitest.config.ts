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
  },
})
