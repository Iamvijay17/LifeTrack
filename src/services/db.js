import { isSupabaseConfigured, devModeAllowed } from '@/lib/supabase'
import { supabaseAdapter } from './supabaseAdapter'
import { localAdapter } from './localAdapter'

export const db = isSupabaseConfigured || !devModeAllowed ? supabaseAdapter : localAdapter
export const isDevMode = !isSupabaseConfigured && devModeAllowed
