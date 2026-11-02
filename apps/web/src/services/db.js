import { createSupabaseAdapter } from '@lifetrack/data'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { localAdapter } from './localAdapter'

export const db = isSupabaseConfigured ? createSupabaseAdapter(supabase) : localAdapter
export const isDevMode = !isSupabaseConfigured
