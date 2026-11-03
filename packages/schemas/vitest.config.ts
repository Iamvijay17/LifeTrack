import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/testing/**'], // test doubles/contract suites are test infrastructure, not product code
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Ratchet: set just under the measured value so a regression fails. Raise it when coverage rises, never lower it to make a build pass.
      thresholds: { lines: 95, branches: 80 },
    },
  },
})
