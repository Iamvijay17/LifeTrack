import { isSupabaseConfigured } from '@/lib/supabase'
import { supabaseAdapter } from './supabaseAdapter'
import { localAdapter } from './localAdapter'

export const db = isSupabaseConfigured ? supabaseAdapter : localAdapter
export const isDevMode = !isSupabaseConfigured
