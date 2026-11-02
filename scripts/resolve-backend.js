// Decides, at BUILD time, which backend a bundle talks to. Shared by vite.config.js and the unit tests.
//  'supabase' – real project credentials were provided
//  'local'    – dev server, tests, or an explicit opt-in (VITE_LOCAL_MODE=true, used by the hermetic E2E build).
//               Data stays in the browser and auth is NOT secure: never ship this to users.
//  'none'     – a production build with no credentials. The app shows a configuration error instead of silently
//               falling back to local mode, and the local adapter is tree-shaken out of the bundle.
export function resolveBackend({ command, mode, env }) {
  const url = env.VITE_SUPABASE_URL ?? ''
  const key = env.VITE_SUPABASE_ANON_KEY ?? ''
  const configured = Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-'))
  if (configured) return 'supabase'
  if (command === 'serve' || mode === 'test' || env.VITE_LOCAL_MODE === 'true') return 'local'
  return 'none'
}
