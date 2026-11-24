import { createSupabaseAdapter } from '@lifetrack/data'
import { isLocalBackend } from '@/lib/backend'
import { supabase } from '@/lib/supabase'
import { localAdapter } from './localAdapter'
import { AppError } from './errors'
import { demoAdapter } from './demo'

const unavailable = new Proxy(
  {},
  {
    get: () => () => {
      throw new AppError('LifeTrack is not connected to a database (missing Supabase configuration).')
    },
  },
)

// `__BACKEND__` is replaced by a literal at build time, so the unused branch (and its imports) is removed from production bundles.
const real = __BACKEND__ === 'supabase' ? createSupabaseAdapter(supabase) : __BACKEND__ === 'local' ? localAdapter : unavailable

// While demo mode is on, every call goes to the in-memory demo database. Nothing is looked up by name on the real adapter in that time: a
// method the demo database lacks fails loudly instead of reaching the account's real data.
export const db = new Proxy(real, {
  get(target, prop, receiver) {
    const demo = demoAdapter()
    if (!demo || prop === 'then') return Reflect.get(target, prop, receiver)
    if (prop === 'subscribe') return () => () => {} // live updates from the real database are not wanted in the demo
    const v = demo[prop]
    if (v === undefined) throw new AppError(`Not available in demo mode: ${String(prop)}`)
    return typeof v === 'function' ? v.bind(demo) : v
  },
})
export const isDevMode = isLocalBackend
