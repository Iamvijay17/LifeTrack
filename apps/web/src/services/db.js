import { createSupabaseAdapter } from '@lifetrack/data'
import { isLocalBackend } from '@/lib/backend'
import { supabase } from '@/lib/supabase'
import { localAdapter } from './localAdapter'
import { AppError } from './errors'

const unavailable = new Proxy(
  {},
  {
    get: () => () => {
      throw new AppError('LifeTrack is not connected to a database (missing Supabase configuration).')
    },
  },
)

// `__BACKEND__` is replaced by a literal at build time, so the unused branch (and its imports) is removed from production bundles.
export const db = __BACKEND__ === 'supabase' ? createSupabaseAdapter(supabase) : __BACKEND__ === 'local' ? localAdapter : unavailable
export const isDevMode = isLocalBackend
