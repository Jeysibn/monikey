import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Real-PostgreSQL integration files share intentionally global rows
    // (provider quotas and notification outbox dedupe records). Running files
    // concurrently makes those global invariants race each other even when
    // every individual test cleans up correctly. Keep cases within a file
    // fast, but serialize files for a deterministic release regression gate.
    fileParallelism: false,
  },
})
