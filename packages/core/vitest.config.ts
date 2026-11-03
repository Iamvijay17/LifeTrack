import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // src/web/** are the selectors the web app's feature pages use; their tests live in apps/web/tests and are measured there.
      exclude: ['src/testing/**', 'src/web/**'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Ratchet: set just under the measured value so a regression fails. Raise it when coverage rises, never lower it to make a build pass.
      thresholds: { lines: 93, branches: 82 },
    },
  },
})
