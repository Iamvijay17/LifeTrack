import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Logic only. Screens/UI are covered by component tests (Checkpoint B) and Maestro; Expo-bound glue needs a device.
      include: ['src/lib/**/*.ts', 'src/data/**/*.ts', 'src/hooks/**/*.ts', 'src/features/**/*.ts'],
      exclude: [
        'src/data/client.ts', 'src/data/useTable.ts', 'src/lib/supabase.ts', 'src/lib/haptics.ts', 'src/lib/signOut.ts', 'src/lib/modules.ts',
        'src/features/notifications/index.ts', 'src/hooks/useFocusTimer.ts', 'src/hooks/useNow.ts', 'src/hooks/useToday.ts', 'src/hooks/useAction.ts', 'src/hooks/useTables.ts', 'src/hooks/useSettings.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: { lines: 88, branches: 88 }, // ratchet, see packages/*/vitest.config.ts
    },
  },
})
