import { describe, it, expect } from 'vitest'
import { resolveBackend } from '../scripts/resolve-backend.js'

const real = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJ...' }
const build = (env) => resolveBackend({ command: 'build', mode: 'production', env })

describe('backend selection (build time)', () => {
  it('uses Supabase whenever real credentials are present', () => {
    expect(build(real)).toBe('supabase')
    expect(resolveBackend({ command: 'serve', mode: 'development', env: real })).toBe('supabase')
  })
  it('allows local mode for the dev server and tests', () => {
    expect(resolveBackend({ command: 'serve', mode: 'development', env: {} })).toBe('local')
    expect(resolveBackend({ command: 'build', mode: 'test', env: {} })).toBe('local')
  })
  it('REFUSES to silently fall back to local mode in a production build', () => {
    expect(build({})).toBe('none')
    expect(build({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toBe('none') // key missing
    expect(build({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' })).toBe('none')
  })
  it('treats the .env.example placeholders as not configured', () => {
    expect(
      build({ VITE_SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co', VITE_SUPABASE_ANON_KEY: 'YOUR-ANON-OR-PUBLISHABLE-KEY' }),
    ).toBe('none')
  })
  it('local mode in a production build needs an explicit opt-in', () => {
    expect(build({ VITE_LOCAL_MODE: 'true' })).toBe('local')
    expect(build({ VITE_LOCAL_MODE: '1' })).toBe('none')
  })
})
