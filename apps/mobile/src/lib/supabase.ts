import * as SecureStore from 'expo-secure-store'
import * as Linking from 'expo-linking'
import { createSupabaseAdapter, createSupabaseAuth, createSupabaseClient, hasCredentials } from '@lifetrack/data'
import { createChunkedStorage } from './chunkedStorage'

// PUBLIC values only (inlined at build time). Authorisation is enforced by Row Level Security, never by the client.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const isConfigured = hasCredentials(url, anonKey)

export const supabase = isConfigured
  ? createSupabaseClient({
      url: url!,
      anonKey: anonKey!,
      // Session lives in the OS keychain/keystore (chunked: sessions exceed SecureStore's per-value limit).
      auth: { storage: createChunkedStorage(SecureStore), detectSessionInUrl: false, flowType: 'pkce' },
    })
  : null

export const authService = supabase
  ? createSupabaseAuth(supabase, {
      signUp: () => Linking.createURL('auth-callback'),
      passwordReset: () => Linking.createURL('reset-password'),
    })
  : null

export const db = supabase ? createSupabaseAdapter(supabase) : null
