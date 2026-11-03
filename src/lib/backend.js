// Which backend this bundle was built for (see scripts/resolve-backend.js). A build-time constant, so the unused
// backend's code is removed from the production bundle.
export const BACKEND = __BACKEND__ // 'supabase' | 'local' | 'none'
export const isSupabaseBackend = BACKEND === 'supabase'
export const isLocalBackend = BACKEND === 'local'
export const isMisconfigured = BACKEND === 'none'
