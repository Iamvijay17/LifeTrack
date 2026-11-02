import { AppState } from 'react-native'
import { QueryClient, focusManager } from '@tanstack/react-query'
import { createApi } from '@lifetrack/data'
import { createQueryStore, type DbAdapter } from './queryStore'
import { db } from '../lib/supabase'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnReconnect: true } },
})

// React Native has no window focus: map "app foregrounded" to TanStack's focus so stale data refreshes on return.
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'))

export const store = createQueryStore(db as unknown as DbAdapter, queryClient)
/** Shared multi-row operations (identical code runs on web). */
export const api = createApi(store)
