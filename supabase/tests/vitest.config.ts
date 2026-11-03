import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['pglite/**/*.test.ts', 'postgres/**/*.test.ts', 'api/**/*.test.ts', 'static/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 } })
