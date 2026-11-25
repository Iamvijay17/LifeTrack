import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { resolveBackend } from './scripts/resolve-backend.js'

// The one source of the displayed app version: this package's own package.json.
const { version: APP_VERSION } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig(({ command, mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION), __BACKEND__: JSON.stringify(resolveBackend({ command, mode, env: loadEnv(mode, process.cwd(), 'VITE_') })) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'LifeTrack',
        short_name: 'LifeTrack',
        description: 'Personal life operating system',
        theme_color: '#09090B',
        background_color: '#09090B',
        display: 'standalone',
        orientation: 'any',
        categories: ['productivity', 'health', 'lifestyle'],
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the installed icon for these. Plain links: no data is stored with them.
        shortcuts: [
          {
            name: "Today's planner",
            short_name: 'Planner',
            url: '/planner',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          { name: 'Habits', url: '/habits', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Calendar', url: '/calendar', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      // The app shell (every page's code, styles, fonts, icons) is precached, so any page that was opened before loads with no connection, and the
      // app's data comes from the encrypted copy on the device (src/sync). Requests to the database/auth API are NEVER cached by the service worker:
      // sign-in tokens and personal data are not stored where a service worker can hand them back.
      workbox: {
        importScripts: ['sw-sync.js'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only the Latin font subsets are precached; other scripts are fetched on demand.
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Exercise demonstration photos are static and large in number: cache each on first view (not precached), newest 600, 30 days.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\.supabase\.(co|in)$/.test(url.hostname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/exercises/') && url.pathname.endsWith('.jpg'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname === '/exercises/catalog.json',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'exercise-catalog' },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    testTimeout: 30_000,
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      allowExternal: true,
      include: ['src/**/*.{js,jsx}', '../../packages/core/src/web/**/*.js'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Only the unit-testable logic is gated. Screens/hooks are exercised by Playwright and (Checkpoint B) component tests.
      thresholds: { 'src/services/**': { lines: 95, branches: 80 } },
    },
  },
}))
